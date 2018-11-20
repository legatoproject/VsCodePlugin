'use strict';

import * as vscode from "vscode";
import { LeafManager } from './leafCore';
import { PromiseCallbacks } from '../utils';
import { IDS } from '../identifiers';
import { ACTION_LABELS } from './leafUiUtils';

export abstract class AbstractLeafTaskManager {
    private readonly listener: vscode.Disposable;
    private readonly idGenerator: IterableIterator<number> = AbstractLeafTaskManager.newIdGenerator();
    private pendingRequests: PromiseCallbacks = {};

    public constructor() {
        this.listener = vscode.tasks.onDidEndTask(event => this.onDidEndTask(event));
    }

    public async executeAsTask(name: string, cmd: string): Promise<void> {
        let task = this.createNewTask(name, cmd);
        let out = this.toPromise(task);
        this.executeTask(task);
        return out;
    }

    protected abstract async executeTask(task: vscode.Task): Promise<void>;

    protected onDidEndTask(event: vscode.TaskEndEvent) {
        let taskId = event.execution.task.definition.taskId;
        this.terminate(taskId);
    }

    protected terminate(taskId?: string, cancelled = false) {
        if (taskId && taskId in this.pendingRequests) {
            let task = this.pendingRequests[taskId];
            if (cancelled) {
                task.reject(new Error("Operation canceled by user"));
            } else {
                task.resolve();
            }
            delete this.pendingRequests[taskId];
        }
    }

    private createNewTask(name: string, cmd: string): vscode.Task {
        let taskDefinition = {
            type: IDS.TASK_DEFINITION.LEAF,
            taskId: this.idGenerator.next().value
        };
        let target: vscode.WorkspaceFolder = {
            uri: vscode.Uri.file(LeafManager.INSTANCE.getLeafWorkspaceDirectory()),
            name: 'leaf-workspace',
            index: 0
        };
        let execution = new vscode.ShellExecution(cmd, {
            cwd: vscode.workspace.rootPath
        });
        let task = new vscode.Task(taskDefinition, target, name, 'Leaf', execution);
        task.group = vscode.TaskGroup.Build;
        task.isBackground = false;
        task.presentationOptions = {
            reveal: vscode.TaskRevealKind.Always,
            echo: true,
            focus: false,
            panel: vscode.TaskPanelKind.Dedicated,
            showReuseMessage: true
        };
        return task;
    }

    private async toPromise(task: vscode.Task): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let id: string = task.definition.taskId as string;
            this.pendingRequests[id] = {
                resolve: resolve,
                reject: reject
            };
        });
    }

    private static * newIdGenerator(): IterableIterator<number> {
        var id = 0;
        while (true) {
            yield id++;
        }
    }

    public dispose() {
        this.listener.dispose();
    }
}

export class SequencialLeafTaskManager extends AbstractLeafTaskManager {

    private runningTask: vscode.Task | undefined = undefined;
    private currentTasksQueue: vscode.Task[] = [];

    protected onDidEndTask(event: vscode.TaskEndEvent) {
        super.onDidEndTask(event);
        if (this.runningTask && event.execution.task === this.runningTask) {
            console.log(`End task: ${this.runningTask.definition.taskId}/${this.runningTask.name}`);
            this.runningTask = undefined;
            this.runNextTask();
        }
    }

    protected async executeTask(task: vscode.Task): Promise<void> {
        if (!this.runningTask || await this.askUserAboutAddingToQueue()) {
            console.log(`Add task to queue: ${task.definition.taskId}/${task.name}`);
            this.currentTasksQueue.push(task);
            this.runNextTask();
        } else {
            console.log(`Task canceled by user: ${task.definition.taskId}/${task.name}`);
            this.terminate(task.definition.taskId, false);
        }
    }

    private async askUserAboutAddingToQueue(): Promise<boolean> {
        return ACTION_LABELS.ADD_TO_QUEUE === await vscode.window.showWarningMessage(
            "Leaf is already busy. Do you want to queue this new task for later execution, or simply forget it?",
            ACTION_LABELS.FORGET,
            ACTION_LABELS.ADD_TO_QUEUE);
    }

    private runNextTask() {
        if (this.runningTask) {
            let len = this.currentTasksQueue.length;
            if (len > 0) {
                console.log(`${len} task(s) postponed due to other task running: ${this.runningTask.name}`);
            }
        } else {
            this.runningTask = this.currentTasksQueue.shift();
            if (this.runningTask) {
                console.log(`Start task: ${this.runningTask.definition.taskId}/${this.runningTask.name}`);
                vscode.tasks.executeTask(this.runningTask);
            }
        }
    }
}
