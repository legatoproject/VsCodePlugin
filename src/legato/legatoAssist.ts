'use strict';

import * as vscode from 'vscode';
import { LeafManager } from '../leaf/leafCore';
import { LegatoManager } from './legatoCore';
export class LegatoUiManager {

  private sdefStatusbar: vscode.StatusBarItem;


  public constructor() {
    this.sdefStatusbar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  }
  public start(context: vscode.ExtensionContext) {
    this.sdefStatusbar.command = "legato.pickSdef";
    this.sdefStatusbar.text = "<No sdef selected>";
    this.sdefStatusbar.show();

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

    vscode.commands.registerCommand("legato.pickSdef", () => {
      this.chooseActiveSdef().then((selectedSdef: vscode.Uri | undefined) => {
        let path = require('path');
        if (selectedSdef) {
          LegatoManager.getInstance().setActiveSdef(selectedSdef);
          this.sdefStatusbar.text = path.basename(selectedSdef.path);
        }
      });
    });
  }

  private chooseActiveSdef(): Thenable<vscode.Uri | undefined> {
    return LegatoManager.getInstance().listSdefs()
      .then((sdefs: vscode.Uri[]) => {
        if (sdefs.length === 0) {
          vscode.window.showErrorMessage("No *.sdef files found in workspace.");
          return undefined;
        } else if (sdefs.length === 1) {
          vscode.window.showInformationMessage(`Active SDEF set to the only one - ${sdefs[0].path}`);
          return sdefs[0];
        } else {
          return vscode.window
            .showQuickPick(sdefs.map(s => s.path), { placeHolder: "Please select active SDEF file among ones available in the workspace..."})
              .then((sdefPath: string | undefined) => sdefPath !== undefined ? vscode.Uri.file(sdefPath) : undefined);
        }
      });
  }

  private async getLegatoTasks(): Promise<vscode.Task[]> {
    let legatoBuildTasks: vscode.Task[] = [];
    let workspaceRoot = vscode.workspace.rootPath;
    if (!workspaceRoot) {
      return [];
    }
    let sdefBuildTask = await this.sdefBuildTask();
    if (sdefBuildTask) {
      legatoBuildTasks.push(sdefBuildTask);
    }
    return legatoBuildTasks;
  }

  private raiseNoBuildTask() {
    vscode.window.showErrorMessage("Please select the active .sdef file first");
    throw new Error('Missing active SDEF file to build');
  }


  private async sdefBuildTask(): Promise<undefined | vscode.Task> {
    let activeSdefFile: vscode.Uri | undefined = LegatoManager.getInstance().getActiveSdef();
    let mktool: undefined | string;
    if (activeSdefFile) {
      mktool = "mksys";
      let command = `${mktool} -t \${LEGATO_TARGET} ${vscode.workspace.asRelativePath(activeSdefFile)}`;
      let kind: LakeTaskDefinition = {
        type: 'Legato',
        mktool: mktool
      };
      let shellOptions: vscode.ShellExecutionOptions = {
        executable: await LeafManager.getInstance().getLeafPath(),
        shellArgs: ['shell', '-c']
      };

      let legatoTaskTarget: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file(await LeafManager.getInstance().getLeafWorkspaceDirectory()),
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
    } else {
      this.raiseNoBuildTask();
    }
  }
}

interface LakeTaskDefinition extends vscode.TaskDefinition {
  /**
   * The task name
   */
  mktool: string;
}
