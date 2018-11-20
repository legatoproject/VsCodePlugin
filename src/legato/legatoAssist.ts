'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import { LeafManager } from '../leaf/leafCore';
import { LegatoManager, LEGATO_FILE_EXTENSIONS, LEGATO_MKTOOLS } from './legatoCore';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient';

const EXTENSION_COMMANDS = {
  pickDefFile: "legato.pickDefFile"
};

export class LegatoUiManager {

  private lspClient: LanguageClient | undefined;
  private defStatusbar: vscode.StatusBarItem;


  public constructor() {
    this.defStatusbar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  }
  public start(context: vscode.ExtensionContext) {
    this.startLegatoServer();

    this.defStatusbar.command = EXTENSION_COMMANDS.pickDefFile;
    this.defStatusbar.text = "<No def file selected>";
    this.defStatusbar.tooltip = "Active definition file";
    this.defStatusbar.show();

    // Tasks definition
    let legatoTaskProvider = vscode.tasks.registerTaskProvider('Legato', {
      provideTasks: () => {
        return this.getLegatoTasks();
      },
      resolveTask(_task: vscode.Task): vscode.Task | undefined {
        return undefined;
      }
    });
    context.subscriptions.push(legatoTaskProvider);  // Dispose on extension/deactivate

    vscode.commands.registerCommand(EXTENSION_COMMANDS.pickDefFile, () => {
      this.chooseActiveDef().then((selectedDef: vscode.Uri | undefined) => {
        let path = require('path');
        if (selectedDef) {
          LegatoManager.getInstance().setActiveDefFile(selectedDef);
          this.defStatusbar.text = path.basename(selectedDef.path);
        }
      });
    });
  }

  private chooseActiveDef(): Thenable<vscode.Uri | undefined> {
    return LegatoManager.getInstance().listDefinitionFiles()
      .then((xdefs: vscode.Uri[]) => {
        if (xdefs.length === 0) {
          vscode.window.showErrorMessage("No *.sdef nor *.adef files found in workspace.");
          return undefined;
        } else if (xdefs.length === 1) {
          vscode.window.showInformationMessage(`Active definition file set to the only one - ${xdefs[0].path}`);
          return xdefs[0];
        } else {
          return vscode.window
            .showQuickPick(xdefs.map(s => s.path), { placeHolder: "Please select active definition file among ones available in the workspace..." })
            .then((xdefPath: string | undefined) => xdefPath !== undefined ? vscode.Uri.file(xdefPath) : undefined);
        }
      });
  }

  private async getLegatoTasks(): Promise<vscode.Task[]> {
    let legatoBuildTasks: vscode.Task[] = [];
    let workspaceRoot = vscode.workspace.rootPath;
    if (!workspaceRoot) {
      return [];
    }
    let xdefBuildTask = await this.xdefBuildTask();
    if (xdefBuildTask) {
      legatoBuildTasks.push(xdefBuildTask);
    }
    return legatoBuildTasks;
  }

  private async xdefBuildTask(): Promise<undefined | vscode.Task> {
    let activeDefFile: vscode.Uri | undefined = LegatoManager.getInstance().getActiveDefFile();
    let mktool: undefined | string;
    if (activeDefFile) {
      let path = require('path');
      let ext = path.extname(activeDefFile.fsPath);
      switch (ext) {
        case LEGATO_FILE_EXTENSIONS.sdef:
          mktool = LEGATO_MKTOOLS.mksys;
          break;
        case LEGATO_FILE_EXTENSIONS.adef:
          mktool = LEGATO_MKTOOLS.mkapp;
          break;
        default:
          break;
      }

      if (mktool) {
        let command = `${mktool} -t \${LEGATO_TARGET} ${vscode.workspace.asRelativePath(activeDefFile)}`;
        let kind: vscode.TaskDefinition = {
          type: 'Legato'
        };
        let shellOptions: vscode.ShellExecutionOptions = {
          env: await LeafManager.INSTANCE.getEnvVars()
        };

        let legatoTaskTarget: vscode.WorkspaceFolder = {
          uri: vscode.Uri.file(LeafManager.INSTANCE.getLeafWorkspaceDirectory()),
          name: 'leaf-workspace',
          index: 0
        };
        let task = new vscode.Task(kind, legatoTaskTarget, mktool, 'Legato', new vscode.ShellExecution(command, shellOptions));
        task.group = vscode.TaskGroup.Build;
        task.problemMatchers = ['$legato'];
        task.presentationOptions = {
          "reveal": vscode.TaskRevealKind.Always,
          "panel": vscode.TaskPanelKind.Shared
        };
        return task;
      }
    }
  }

  /**
   * Start the Legato LSP
   */
  public startLegatoServer() {
    let path = require('path');
    LegatoManager.getInstance().getLegatoRoot().then((legatoPath: string) => {
      let serverModule = path.join(legatoPath, 'bin', 'languageServer', 'languageServer.js');
      if (!fs.existsSync(serverModule)) {
        throw new Error(`${serverModule} LSP doesn't exist`);
      }

      // The debug options for the server
      // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
      let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

      // If the extension is launched in debug mode then the debug server options are used
      // Otherwise the run options are used
      let serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
          module: serverModule,
          transport: TransportKind.ipc,
          options: debugOptions
        }
      };

      // Options to control the language client
      let clientOptions: LanguageClientOptions = {
        // Register the server for plain text documents
        documentSelector: [
          { scheme: 'file', language: 'sdef' },
          { scheme: 'file', language: 'adef' },
          { scheme: 'file', language: 'cdef' },
          { scheme: 'file', language: 'mdef' }
        ],
        synchronize: {
          // Notify the server about file changes to '.clientrc files contained in the workspace
          fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
        }
      };
      // Create the language client and start the client.
      this.lspClient = new LanguageClient(
        'legatoServer',
        'Legato Language Server',
        serverOptions,
        clientOptions
      );

      // Start the client. This will also launch the server
      this.lspClient.start();
    }).catch((reason: any) => {
      console.log(`Failed to start the Legato Language server - reason: ${reason}`);
    });
  }
}
