'use strict';

import * as vscode from 'vscode';
import { LeafManager } from '../leaf/leafCore';

export class LegatoUiManager {

  private static instance: LegatoUiManager;
  private legatoTaskProvider!: vscode.Disposable;
  private legatoBuildTasks: vscode.Task[] = [];

  private constructor() {
  }

  static getInstance(): LegatoUiManager {
    LegatoUiManager.instance = LegatoUiManager.instance || new LegatoUiManager();
    return LegatoUiManager.instance;
  }

  /**
   * init
   */
  public init(context: vscode.ExtensionContext) {
    // Tasks definition
    this.legatoTaskProvider = vscode.tasks.registerTaskProvider('Legato', {
      provideTasks: () => {
        return this.getLegatoTasks();
      },
      resolveTask(_task: vscode.Task): vscode.Task | undefined {
        return undefined;
      }
    });

    context.subscriptions.push(this);  // Dispose on extension/deactivate
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

  dispose(): void {
    this.legatoTaskProvider.dispose();
  }
}

interface LakeTaskDefinition extends vscode.TaskDefinition {
  /**
   * The task name
   */
  mktool: string;
}
