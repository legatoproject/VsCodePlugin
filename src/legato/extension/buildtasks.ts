'use strict';

import * as vscode from 'vscode';
import { TaskDefinitionType } from '../../commons/identifiers';
import { CommandRegister } from '../../commons/manager';
import { LeafManager } from '../../leaf/api/core';
import { LegatoManager } from '../api/core';

/**
 * Build task names
 */
enum LegatoTasks {
    Build = "Build",
    BuildAndInstall = "Build and install",
    Clean = "Clean",
    SysToImage = "Generate image"
}

/**
 * Expose build commands as build tasks
 */
export class LegatoBuildTasks extends CommandRegister {

    /**
     * Need 2 managers
     */
    public constructor(
        private readonly leafManager: LeafManager,
        private readonly legatoManager: LegatoManager
    ) {
        super();

        // Tasks definition
        this.toDispose(vscode.tasks.registerTaskProvider(
            '', // type is not used in impl of registerTaskProvider
            {
                provideTasks: () => this.getBuildTasks(),
                resolveTask: (_task: vscode.Task) => undefined
            }));
    }

    /**
     * Create a build task
     */
    private async createTask(type: TaskDefinitionType, taskName: LegatoTasks, command: string, group = vscode.TaskGroup.Build): Promise<vscode.Task> {
        let kind: vscode.TaskDefinition = {
            type: type
        };
        let shellOptions: vscode.ShellExecutionOptions = {
            env: await this.leafManager.envVars.get()
        };
        let task = new vscode.Task(kind, vscode.TaskScope.Workspace, taskName, 'Legato', new vscode.ShellExecution(command, shellOptions));
        task.group = group;
        task.problemMatchers = ['$legato'];
        task.presentationOptions = {
            reveal: vscode.TaskRevealKind.Always,
            panel: vscode.TaskPanelKind.Dedicated
        };
        return task;
    }

    /**
     * @returns the clean task or undefined if not available
     */
    public async createCleanTask(): Promise<vscode.Task | undefined> {
        let cleanCommand = await this.legatoManager.mkBuild.getCleanCommand();
        if (cleanCommand) {
            return this.createTask(TaskDefinitionType.LegatoClean, LegatoTasks.Clean, cleanCommand, vscode.TaskGroup.Clean);
        }
    }

    /**
     * @returns the build task or undefined if not available
     */
    public async createBuildTask(): Promise<vscode.Task | undefined> {
        let buildCommand = await this.legatoManager.mkBuild.getBuildCommand();
        if (buildCommand) {
            return this.createTask(TaskDefinitionType.LegatoBuild, LegatoTasks.Build, buildCommand);
        }
    }

    /**
     * @returns the build and install task or undefined if not available
     */
    public async createBuildAndInstallTask(): Promise<vscode.Task | undefined> {
        let buildAndInstallCommand = await this.legatoManager.mkBuild.getBuildAndInstallCommand();
        if (buildAndInstallCommand) {
            return this.createTask(TaskDefinitionType.LegatoInstall, LegatoTasks.BuildAndInstall, buildAndInstallCommand);
        }
    }

    /**
     * @returns the generate image task or undefined if not available
     */
    public async createGenerateImageTask(): Promise<vscode.Task | undefined> {
        let generateImageCommand = await this.legatoManager.mkBuild.generateImage();
        if (generateImageCommand) {
            return this.createTask(TaskDefinitionType.LegatoSysToImage, LegatoTasks.SysToImage, generateImageCommand);
        }
    }

    /**
     * Create and returns build tasks
     */
    private async getBuildTasks(): Promise<vscode.Task[]> {
        let out: vscode.Task[] = [];

        // Clean
        let cleanTask = await this.createCleanTask();
        if (cleanTask) {
            out.push(cleanTask);
        }

        // Build
        let buildTask = await this.createBuildTask();
        if (buildTask) {
            out.push(buildTask);
        }

        // Build and install
        let buildAndInstallTask = await this.createBuildAndInstallTask();
        if (buildAndInstallTask) {
            out.push(buildAndInstallTask);
        }

        // Generate image
        const generateImageTask = await this.createGenerateImageTask();
        if (generateImageTask) {
            out.push(generateImageTask);
        }
        return out;
    }
}
