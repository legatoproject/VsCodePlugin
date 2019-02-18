'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { Command, TaskDefinitionType } from '../commons/identifiers';
import { LeafManager, LeafEvent } from '../leaf/core';
import { CommandRegister } from '../commons/manager';
import { chooseFile, listDefinitionFiles, LEGATO_FILES_PATTERNS } from './files';
import { LegatoManager, LEGATO_ENV, LEGATO_FILE_EXTENSIONS, LEGATO_MKTOOLS } from './core';
import { EnvVars } from '../commons/utils';

enum LegatoTasks {
  Build = "Build",
  BuildAndInstall = "Build and install"
}

export class LegatoUiManager extends CommandRegister {

  private readonly defStatusbar: vscode.StatusBarItem;
  private readonly defFileWatcher: vscode.FileSystemWatcher; // Listen to def files creation/deletion
  private currentDefFile: vscode.Uri | undefined = undefined; // Current active def file

  public constructor(private readonly leafManager: LeafManager, private readonly legatoManager: LegatoManager) {
    super();

    // Listen def files creation/deletion
    this.defFileWatcher = this.toDispose(vscode.workspace.createFileSystemWatcher(LEGATO_FILES_PATTERNS.DEFINITIONS_FILES, false, true, false));
    this.defFileWatcher.onDidCreate(this.onDefFileCreation, this, this);
    this.defFileWatcher.onDidDelete(this.onDefFileDeletion, this, this);

    // Status bar
    this.defStatusbar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    this.toDispose(this.defStatusbar);  // Dispose on extension/deactivate
    this.defStatusbar.command = Command.LegatoBuildPickDefFile;
    this.defStatusbar.text = "Searching sdef file...";
    this.defStatusbar.tooltip = "Active definition file";
    this.defStatusbar.show();

    // Update status bar on env var change
    this.leafManager.addListener(LeafEvent.EnvVarsChanged, this.onEnvVarChanged, this);

    // Tasks definition
    // Delete this line when this issue will be fixed: https://github.com/Microsoft/vscode/issues/68486
    let isDisposed: boolean = false;
    // Uncomment when this issue will be fixed: https://github.com/Microsoft/vscode/issues/68486
    /*let legatoTaskProviderSub =*/ vscode.tasks.registerTaskProvider(
      '', // type is not used in impl of registerTaskProvider
      {
        // Temporary fix for issue: https://github.com/Microsoft/vscode/issues/68486
        provideTasks: () => isDisposed ? [] : this.getLegatoTasks(),
        resolveTask: (_task: vscode.Task) => undefined
      });
    // Delete this line when this issue will be fixed: https://github.com/Microsoft/vscode/issues/68486
    this.onDispose(() => isDisposed = true); // Temporary fix for issue: https://github.com/Microsoft/vscode/issues/68486
    // Uncomment when this issue will be fixed: https://github.com/Microsoft/vscode/issues/68486
    // this.toDispose(legatoTaskProviderSub);

    // Create command
    this.createCommand(Command.LegatoBuildPickDefFile, this.onPickDefFileCommand);

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
    try {
      // Set initial value of status bar
      await this.onEnvVarChanged(undefined, await this.leafManager.getEnvVars());
    } catch (reason) {
      // Catch and log because this method is never awaited
      console.error(reason);
    }
  }

  private onEnvVarChanged(oldEnvVar: EnvVars | undefined, newEnvVar: EnvVars | undefined): Promise<void> {
    let oldDefFile = oldEnvVar ? oldEnvVar[LEGATO_ENV.LEGATO_DEF_FILE] : undefined;
    let newDefFile = newEnvVar ? newEnvVar[LEGATO_ENV.LEGATO_DEF_FILE] : undefined;
    if (oldDefFile != newDefFile) {
      let uri = newDefFile ? vscode.Uri.file(newDefFile) : undefined;
      return this.setCurrentDefFile(uri);
    }
    return Promise.resolve();
  }

  private async onPickDefFileCommand(): Promise<void> {
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
    return this.setCurrentDefFile(defFile, true);
  }

  /**
   * Update this.currentDefFile, status bar and env var if persisted is true
   */
  private setCurrentDefFile(defFile: vscode.Uri | undefined, persist: boolean = false): Promise<void> {
    this.currentDefFile = defFile;
    this.defStatusbar.text = defFile ? path.basename(defFile.path) : '<No def file selected>';
    if (persist) {
      return this.legatoManager.saveActiveDefFile(defFile);
    }
    return Promise.resolve();
  }

  private async buildTask(type: TaskDefinitionType, taskName: LegatoTasks, command: string): Promise<vscode.Task> {
    let kind: vscode.TaskDefinition = {
      type: type
    };
    let shellOptions: vscode.ShellExecutionOptions = {
      env: await this.leafManager.getEnvVars()
    };
    let task = new vscode.Task(kind, vscode.TaskScope.Workspace, taskName, 'Legato', new vscode.ShellExecution(command, shellOptions));
    task.group = vscode.TaskGroup.Build;
    task.problemMatchers = ['$legato'];
    task.presentationOptions = {
      reveal: vscode.TaskRevealKind.Always,
      panel: vscode.TaskPanelKind.Dedicated
    };
    return task;
  }

  private async getLegatoTasks(): Promise<vscode.Task[]> {
    let activeDefFile = await this.legatoManager.getActiveDefFile();

    if (!activeDefFile) {
      return [];
    }

    let mktool: undefined | string;
    switch (path.extname(activeDefFile.fsPath)) {
      case LEGATO_FILE_EXTENSIONS.sdef:
        mktool = LEGATO_MKTOOLS.mksys;
        break;
      case LEGATO_FILE_EXTENSIONS.adef:
        mktool = LEGATO_MKTOOLS.mkapp;
        break;
      case LEGATO_FILE_EXTENSIONS.cdef:
        return [];
    }

    let buildCommand = `${mktool} -t \${LEGATO_TARGET} \${LEGATO_DEF_FILE}`;
    let build = await this.buildTask(TaskDefinitionType.LegatoBuild, LegatoTasks.Build, buildCommand);

    let installCommand = `${buildCommand} && update $(basename \${LEGATO_DEF_FILE%.*def}).$LEGATO_TARGET.update`;
    let buildAndInstall = await this.buildTask(TaskDefinitionType.LegatoInstall, LegatoTasks.BuildAndInstall, installCommand);

    return [build, buildAndInstall];
  }
}
