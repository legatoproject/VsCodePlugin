'use strict';

import * as fs from 'fs';
import * as vscode from 'vscode';
import * as path from 'path';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';
import { LEGATO_IDS } from '../identifiers';
import { LeafManager, LEAF_EVENT } from '../leaf/leafCore';
import { CommandRegister } from '../utils';
import { LegatoManager, LEGATO_ENV, LEGATO_FILE_EXTENSIONS, LEGATO_MKTOOLS } from './legatoCore';

export class LegatoUiManager extends CommandRegister {

  private lspClient: LanguageClient | undefined;
  private defStatusbar: vscode.StatusBarItem;

  public constructor() {
    super();

    // Status bar
    this.defStatusbar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    this.toDispose(this.defStatusbar);  // Dispose on extension/deactivate
    this.defStatusbar.command = LEGATO_IDS.COMMANDS.BUILD.PICK_DEF_FILE;
    this.defStatusbar.text = "Searching sdef file...";
    this.defStatusbar.tooltip = "Active definition file";
    this.defStatusbar.show();

    this.setInitialState();
  }

  /**
   * Async initialisation
   */
  private async setInitialState() {
    await this.startLegatoServer();

    // Update status bar on env var change
    LeafManager.getInstance().addListener(
      LEAF_EVENT.leafEnvVarChanged,
      (oldEnvVar, newEnvVar) => this.onEnvVarChanged(oldEnvVar, newEnvVar),
      this);

    // Set initial value of status bar
    this.onEnvVarChanged(undefined, await LeafManager.getInstance().getEnvVars());

    // Tasks definition
    const legatoTaskProvider = vscode.tasks.registerTaskProvider(LEGATO_IDS.TASK_DEFINITION.LEGATO, {
      provideTasks: () => {
        return this.getLegatoTasks();
      },
      resolveTask(_task: vscode.Task): vscode.Task | undefined {
        return undefined;
      }
    });
    this.toDispose(legatoTaskProvider);  // Dispose on extension/deactivate

    // Create command
    this.createCommand(LEGATO_IDS.COMMANDS.BUILD.PICK_DEF_FILE, () => this.onPickDefFileCommand());
  }

  private async onEnvVarChanged(_oldEnvVar: any | undefined, newEnvVar: any | undefined) {
    let defFile = newEnvVar ? newEnvVar[LEGATO_ENV.LEGATO_DEF_FILE] : undefined;
    let uri = defFile ? vscode.Uri.file(defFile) : undefined;
    this.updateDefFileStatusBar(uri);
  }

  private async onPickDefFileCommand() {
    this.updateDefFileStatusBar(await this.chooseActiveDef(), true);
  }

  private updateDefFileStatusBar(selectedDef: vscode.Uri | undefined, persist: boolean = false) {
    if (selectedDef) {
      this.defStatusbar.text = path.basename(selectedDef.path);
      if (persist) {
        LegatoManager.getInstance().saveActiveDefFile(selectedDef);
      }
    } else {
      this.defStatusbar.text = "<No def file selected>";
    }
  }

  private async chooseActiveDef(): Promise<vscode.Uri | undefined> {
    let xdefs: vscode.Uri[] = await LegatoManager.getInstance().listDefinitionFiles();
    if (xdefs.length === 0) {
      vscode.window.showErrorMessage("No *.sdef nor *.adef files found in workspace.");
      return undefined;
    } else if (xdefs.length === 1) {
      console.log(`Active definition file set to the only one - ${xdefs[0].path}`);
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
          env: await LeafManager.getInstance().getEnvVars()
        };

        let legatoTaskTarget: vscode.WorkspaceFolder = {
          uri: vscode.Uri.file(LeafManager.getInstance().getLeafWorkspaceDirectory()),
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
    try {
      let legatoPath = await LegatoManager.getInstance().getLegatoRoot();
      if (!legatoPath) {
        throw new Error("Unable to get LEGATO_ROOT env var");
      }
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
