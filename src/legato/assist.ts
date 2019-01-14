'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { Command, TaskDefinitionType } from '../commons/identifiers';
import { LeafManager, LeafEvent } from '../leaf/core';
import { CommandRegister } from '../commons/utils';
import { chooseFile, listDefinitionFiles, LegatoFilesPatterns } from './files';
import { LegatoManager, LEGATO_ENV, LEGATO_FILE_EXTENSIONS, LEGATO_MKTOOLS } from './core';

enum LegatoTasks {
  Build = "Build",
  BuildAndInstall = "Build and install"
}

export class LegatoUiManager extends CommandRegister {

  private readonly defStatusbar: vscode.StatusBarItem;
  private readonly defFileWatcher: vscode.FileSystemWatcher; // Listen to def files creation/deletion
  private currentDefFile: vscode.Uri | undefined = undefined; // Current active def file

  public constructor() {
    super();

    // Listen def files creation/deletion
    this.defFileWatcher = this.toDispose(vscode.workspace.createFileSystemWatcher(LegatoFilesPatterns.DefinitionsFiles, false, true, false));
    this.defFileWatcher.onDidCreate(this.onDefFileCreation, this, this);
    this.defFileWatcher.onDidDelete(this.onDefFileDeletion, this, this);

    // Status bar
    this.defStatusbar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    this.toDispose(this.defStatusbar);  // Dispose on extension/deactivate
    this.defStatusbar.command = Command.LegatoBuildPickDefFile;
    this.defStatusbar.text = "Searching sdef file...";
    this.defStatusbar.tooltip = "Active definition file";
    this.defStatusbar.show();

    this.setInitialState();
  }

  /**
   * Called when a new def file is created
   * If it's the first, set it as active one
   */
  private onDefFileCreation(defFile: vscode.Uri) {
    if (!this.currentDefFile) {
      this.setCurrentDefFile(defFile, true);
    }
  }

  /**
   * Called when a def file is deleted
   * If it's the current one, let's update it in bar and envvar
   */
  private onDefFileDeletion(defFile: vscode.Uri) {
    if (this.currentDefFile && this.currentDefFile.toString() === defFile.toString()) {
      this.setCurrentDefFile(undefined, true);
    }
  }

  /**
   * Async initialisation
   */
  private async setInitialState() {
    // Update status bar on env var change
    LeafManager.getInstance().addListener(LeafEvent.EnvVarsChanged, this.onEnvVarChanged, this);

    // Set initial value of status bar
    this.onEnvVarChanged(undefined, await LeafManager.getInstance().getEnvVars());

    // Tasks definition
    const legatoTaskProvider = vscode.tasks.registerTaskProvider(TaskDefinitionType.LegatoBuild, {
      provideTasks: () => {
        return this.getLegatoTasks();
      },
      resolveTask(_task: vscode.Task): vscode.Task | undefined {
        return undefined;
      }
    });
    this.toDispose(legatoTaskProvider);  // Dispose on extension/deactivate

    // Create command
    this.createCommand(Command.LegatoBuildPickDefFile, this.onPickDefFileCommand);
  }

  private async onEnvVarChanged(_oldEnvVar: any | undefined, newEnvVar: any | undefined) {
    let defFile = newEnvVar ? newEnvVar[LEGATO_ENV.LEGATO_DEF_FILE] : undefined;
    let uri = defFile ? vscode.Uri.file(defFile) : undefined;
    this.setCurrentDefFile(uri);
  }

  private async onPickDefFileCommand() {
    let xdefs: vscode.Uri[] = await listDefinitionFiles();
    let defFile: vscode.Uri | undefined = undefined;
    if (xdefs.length > 0) {
      defFile = await chooseFile(xdefs,
        {
          noFileFoundMessage: "Neither *.sdef nor *.adef files found in workspace.",
          quickPickPlaceHolder: "Please select active definition file among ones available in the workspace..."
        });
      if (!defFile) {
        return; // User cancellation
      }
    }
    this.setCurrentDefFile(defFile, true);
  }

  /**
   * Update this.currentDefFile, status bar and env var if persisted is true
   */
  private setCurrentDefFile(defFile: vscode.Uri | undefined, persist: boolean = false) {
    this.currentDefFile = defFile;
    this.defStatusbar.text = defFile ? path.basename(defFile.path) : '<No def file selected>';
    if (persist) {
      LegatoManager.getInstance().saveActiveDefFile(defFile);
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

  private async buildTask(type: TaskDefinitionType, taskName: LegatoTasks, command: string | undefined): Promise<vscode.Task | undefined> {
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
      let buildTask: vscode.Task | undefined = await this.buildTask(TaskDefinitionType.LegatoBuild, LegatoTasks.Build, buildCommand);
      if (buildTask) {
        legatoTasks.push(buildTask);

        let buildAndInstallTask: vscode.Task | undefined = await this.buildTask(TaskDefinitionType.LegatoInstall,
          LegatoTasks.BuildAndInstall,
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
