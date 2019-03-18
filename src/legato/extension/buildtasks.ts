'use strict';

import * as vscode from 'vscode';
import { CommandRegister } from '../../commons/manager';
import { TaskDefinitionType } from '../../commons/identifiers';
import { LeafManager } from '../../leaf/api/core';
import { LegatoManager } from '../api/core';

/**
 * Build task names
 */
enum LegatoTasks {
    Build = "Build",
    BuildAndInstall = "Build and install"
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
    private async createTask(type: TaskDefinitionType, taskName: LegatoTasks, command: string): Promise<vscode.Task> {
        let kind: vscode.TaskDefinition = {
            type: type
        };
        let shellOptions: vscode.ShellExecutionOptions = {
            env: await this.leafManager.envVars.get()
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

    /**
     * Create and returns build tasks
     */
    private async getBuildTasks(): Promise<vscode.Task[]> {
        let out: vscode.Task[] = [];

        // Build
        let buildCommand = await this.legatoManager.buildCommand.get();
        if (buildCommand) {
            out.push(await this.createTask(TaskDefinitionType.LegatoBuild, LegatoTasks.Build, buildCommand));
        }

        // Build and install
        let buildAndInstallCommand = await this.legatoManager.buildAndInstallCommand.get();
        if (buildAndInstallCommand) {
            out.push(await this.createTask(TaskDefinitionType.LegatoInstall, LegatoTasks.BuildAndInstall, buildAndInstallCommand));
        }

        return out;
    }
}
