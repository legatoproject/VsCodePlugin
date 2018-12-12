'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { LEGATO_IDS } from '../identifiers';
import { LeafManager, LEAF_EVENT } from '../leaf/core';
import { CommandRegister } from '../utils';
import { chooseFile, listDefinitionFiles } from './files';
import { LegatoManager, LEGATO_ENV, LEGATO_FILE_EXTENSIONS, LEGATO_MKTOOLS } from './core';

const LEGATO_TASKS = {
  BUILD: "Build",
  BUILD_AND_INSTALL: "Build and install"
};
export class LegatoUiManager extends CommandRegister {

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
    // Update status bar on env var change
    LeafManager.getInstance().addListener(
      LEAF_EVENT.leafEnvVarChanged,
      (oldEnvVar, newEnvVar) => this.onEnvVarChanged(oldEnvVar, newEnvVar),
      this);

    // Set initial value of status bar
    this.onEnvVarChanged(undefined, await LeafManager.getInstance().getEnvVars());

    // Tasks definition
    const legatoTaskProvider = vscode.tasks.registerTaskProvider(LEGATO_IDS.TASK_DEFINITION.LEGATO_BUILD, {
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
    let xdefs: vscode.Uri[] = await listDefinitionFiles();
    let selectedXdef = await chooseFile(xdefs,
      {
        noFileFoundMessage: "Neither *.sdef nor *.adef files found in workspace.",
        quickPickPlaceHolder: "Please select active definition file among ones available in the workspace..."
      });
    this.updateDefFileStatusBar(selectedXdef, true);
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



  private buildCommand(activeDefFile: vscode.Uri) {
    let command: string | undefined;
    let mktool: undefined | string;
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
      command = `${mktool} -t \${LEGATO_TARGET} \${LEGATO_DEF_FILE}`;
    }
    return command;
  }

  private async buildTask(type: string, taskName: string, command: string | undefined): Promise<vscode.Task | undefined> {
    if (command) {
      let kind: vscode.TaskDefinition = {
        type: type
      };
      let shellOptions: vscode.ShellExecutionOptions = {
        env: await LeafManager.getInstance().getEnvVars()
      };

      let legatoTaskTarget: vscode.WorkspaceFolder = {
        uri: vscode.Uri.file(LeafManager.getInstance().getLeafWorkspaceDirectory()),
        name: 'leaf-workspace',
        index: 0
      };
      let task = new vscode.Task(kind, legatoTaskTarget, taskName, 'Legato', new vscode.ShellExecution(command, shellOptions));
      task.group = vscode.TaskGroup.Build;
      task.problemMatchers = ['$legato'];
      task.presentationOptions = {
        reveal: vscode.TaskRevealKind.Always,
        panel: vscode.TaskPanelKind.Dedicated
      };
      return task;
    }
  }

  private async getLegatoTasks(): Promise<vscode.Task[]> {
    let legatoTasks = new Array<vscode.Task>();
    let activeDefFile: vscode.Uri | undefined = await LegatoManager.getInstance().getActiveDefFile();
    if (activeDefFile) {
      let buildCommand = this.buildCommand(activeDefFile);
      let buildTask: vscode.Task | undefined = await this.buildTask(LEGATO_IDS.TASK_DEFINITION.LEGATO_BUILD, LEGATO_TASKS.BUILD, buildCommand);
      if (buildTask) {
        legatoTasks.push(buildTask);

        let buildAndInstallTask: vscode.Task | undefined = await this.buildTask(LEGATO_IDS.TASK_DEFINITION.LEGATO_INSTALL,
          LEGATO_TASKS.BUILD_AND_INSTALL,
          `${buildCommand} && update $(basename \${LEGATO_DEF_FILE%.*def}).$LEGATO_TARGET.update`
        );
        if (buildAndInstallTask) {
          legatoTasks.push(buildAndInstallTask);
        }
      }
    }
    return legatoTasks;
  }
}
