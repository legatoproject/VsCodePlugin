'use strict';

import * as vscode from 'vscode';
import { LeafManager } from '../leaf/leafCore';

export class LegatoUiManager {

  private legatoBuildTasks: vscode.Task[] = [];

  public start(context: vscode.ExtensionContext) {
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
  }

  private async getLegatoTasks(): Promise<vscode.Task[]> {
    if (this.legatoBuildTasks.length > 0) {
      return this.legatoBuildTasks;
    }
    let workspaceRoot = vscode.workspace.rootPath;
    if (!workspaceRoot) {
      return [];
    }
    this.legatoBuildTasks.push(await this.newLegatoTask('mkapp', "mkapp -t ${LEGATO_TARGET} ${file}"));
    this.legatoBuildTasks.push(await this.newLegatoTask('mksys', "mksys -t ${LEGATO_TARGET} ${file}"));
    return this.legatoBuildTasks;
  }

  private async newLegatoTask(mktool: string, command: string) {

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
      "panel": vscode.TaskPanelKind.New
    };
    return task;
  }
}

interface LakeTaskDefinition extends vscode.TaskDefinition {
  /**
   * The task name
   */
  mktool: string;
}
