'use strict';

import * as vscode from 'vscode';
import { LeafManager } from '../leaf/leafCore';
import { LegatoManager, LEGATO_FILE_EXTENSIONS, LEGATO_MKTOOLS } from './legatoCore';
const EXTENSION_COMMANDS = {
  pickDefFile: "legato.pickDefFile"
};

export class LegatoUiManager {

  private defStatusbar: vscode.StatusBarItem;


  public constructor() {
    this.defStatusbar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  }
  public start(context: vscode.ExtensionContext) {
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
}