'use strict';

import { LEGATO_IDS } from '../identifiers';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { CommandRegister } from '../uiUtils';
import { LegatoManager, LEGATO_FILE_EXTENSIONS, LEGATO_MKTOOLS, LEGATO_ENV } from './legatoCore';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from 'vscode-languageclient';
import { LeafManager } from '../leaf/leafCore';

export class LegatoUiManager extends CommandRegister {

  private lspClient: LanguageClient | undefined;
  private defStatusbar: vscode.StatusBarItem;

  public constructor() {
    super();

    // Status bar
    this.defStatusbar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    this.disposables.push(this.defStatusbar);  // Dispose on extension/deactivate
    this.defStatusbar.command = LEGATO_IDS.COMMANDS.BUILD.PICK_DEF_FILE;
    this.defStatusbar.text = "<No def file selected>";
    this.defStatusbar.tooltip = "Active definition file";
    this.defStatusbar.show();

    this.start();
  }

  private async start() {
    await this.startLegatoServer();

    // Set starting status bar value
    let savedDefFile = await LeafManager.INSTANCE.getEnvValue(LEGATO_ENV.LEGATO_DEF_FILE);
    if (savedDefFile) {
      this.updateDefFileStatusBar(vscode.Uri.file(savedDefFile));
    }

    // Tasks definition
    let legatoTaskProvider = vscode.tasks.registerTaskProvider(LEGATO_IDS.TASK_DEFINITION.LEGATO, {
      provideTasks: () => {
        return this.getLegatoTasks();
      },
      resolveTask(_task: vscode.Task): vscode.Task | undefined {
        return undefined;
      }
    });
    this.disposables.push(legatoTaskProvider);  // Dispose on extension/deactivate

    // Create command
    this.createCommand(LEGATO_IDS.COMMANDS.BUILD.PICK_DEF_FILE, () => this.onPickDefFileCommand());
  }

  private async onPickDefFileCommand() {
    let selectedDef = await this.chooseActiveDef();
    if (selectedDef) {
      this.updateDefFileStatusBar(selectedDef, true);
    }
  }

  private updateDefFileStatusBar(selectedDef: vscode.Uri | undefined, persist: boolean = false) {
    if (selectedDef) {
      let path = require('path');
      this.defStatusbar.text = path.basename(selectedDef.path);
      if (persist) {
        LegatoManager.getInstance().saveActiveDefFile(selectedDef);
      }
    }
  }

  private async chooseActiveDef(): Promise<vscode.Uri | undefined> {
    let xdefs: vscode.Uri[] = await LegatoManager.getInstance().listDefinitionFiles();
    if (xdefs.length === 0) {
      vscode.window.showErrorMessage("No *.sdef nor *.adef files found in workspace.");
      return undefined;
    } else if (xdefs.length === 1) {
      vscode.window.showInformationMessage(`Active definition file set to the only one - ${xdefs[0].path}`);
      return xdefs[0];
    } else {
      let xdefPath: string | undefined = await vscode.window.showQuickPick(
        xdefs.map(s => s.path),
        { placeHolder: "Please select active definition file among ones available in the workspace..." });
      return xdefPath !== undefined ? vscode.Uri.file(xdefPath) : undefined;
    }
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
    let activeDefFile: vscode.Uri | undefined = await LegatoManager.getInstance().getActiveDefFile();
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
        let command = `${mktool} -t \${LEGATO_TARGET} \${LEGATO_DEF_FILE}`;
        let kind: vscode.TaskDefinition = {
          type: LEGATO_IDS.TASK_DEFINITION.LEGATO
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
          reveal: vscode.TaskRevealKind.Always,
          panel: vscode.TaskPanelKind.Shared
        };
        return task;
      }
    }
  }

  /**
   * Start the Legato LSP
   */
  public async startLegatoServer() {
    let path = require('path');
    try {
      let legatoPath = await LegatoManager.getInstance().getLegatoRoot();
      let serverModule = path.join(legatoPath, 'bin', 'languageServer', 'languageServer.js');
      if (!fs.existsSync(serverModule)) {
        throw new Error(serverModule + " LSP doesn't exist");
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
    } catch (e) {
      vscode.window.showWarningMessage(`Failed to start the Legato Language server - reason: ${e}`);
    }
  }
}
