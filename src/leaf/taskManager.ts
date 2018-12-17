'use strict';

import * as vscode from "vscode";
import { TaskDefinitions } from '../identifiers';
import { ACTION_LABELS } from '../uiUtils';
import { EnvVars, PromiseCallbacks } from '../utils';

/**
 * Take care of task creation, launching and create a corresponding promise to let the user do somthing at the end og the task
 */
export abstract class AbstractLeafTaskManager {
    private readonly listener: vscode.Disposable; // Task ending listener
    private readonly idGenerator: IterableIterator<number> = AbstractLeafTaskManager.newIdGenerator(); // task id generator
    private pendingRequests: PromiseCallbacks = {}; // Pending promise callbacks

    public constructor() {
        // Listen to task ending
        this.listener = vscode.tasks.onDidEndTask(this.onDidEndTask, this);
    }

    /**
     * Execute shell command as task
     * @returns a promise that is resolved at the end of the task or rejected if the user cancel it
     */
    public async executeAsTask(name: string, cmd: string, additionalEnv?: EnvVars): Promise<void> {
        let task = this.createNewTask(name, cmd, additionalEnv);
        let out = this.toPromise(task);
        this.executeTask(task);
        return out;
    }

    /**
     * Launch task or add it to queue
     */
    protected abstract async executeTask(task: vscode.Task): Promise<void>;

    /**
     * Called on task end
     */
    protected onDidEndTask(event: vscode.TaskEndEvent) {
        let taskId = event.execution.task.definition.taskId;
        this.terminate(taskId);
    }

    /**
     * Resolve or reject task
     */
    protected terminate(taskId: string, cancelled = false) {
        if (taskId in this.pendingRequests) {
            let request = this.pendingRequests[taskId];
            if (cancelled) {
                request.reject(new Error("Operation canceled by user"));
            } else {
                request.resolve();
            }
            delete this.pendingRequests[taskId];
        }
    }

    /**
     * Create a task with ShellExecution
     */
    private createNewTask(name: string, cmd: string, additionalEnv?: EnvVars): vscode.Task {
        let taskDefinition = {
            type: TaskDefinitions.Leaf,
            taskId: this.idGenerator.next().value
        };
        let target: vscode.WorkspaceFolder = {
            uri: vscode.Uri.file(<string>vscode.workspace.rootPath),
            name: 'leaf-workspace',
            index: 0
        };
        let env: EnvVars = additionalEnv ? additionalEnv : {};
        //if the custom env does not provide LEAF_WORKSPACE, override the inherited one 
        if (additionalEnv && !additionalEnv["LEAF_WORKSPACE"]) {
            env["LEAF_WORKSPACE"] = "";
        }
        let execution = new vscode.ShellExecution(cmd, {
            cwd: vscode.workspace.rootPath,
            env: env
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

    /**
     * Convert task to promise and store callbacks for further resolution
     */
    private async toPromise(task: vscode.Task): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            let id: string = task.definition.taskId as string;
            this.pendingRequests[id] = {
                resolve: resolve,
                reject: reject
            };
        });
    }

    /**
     * Generate unique task id used to resolve promises
     */
    private static * newIdGenerator(): IterableIterator<number> {
        var id = 0;
        while (true) {
            yield id++;
        }
    }

    /**
     * Stop listening tasks ending
     */
    public dispose() {
        this.listener.dispose();
    }
}

/**
 * Take care of task execution.
 * If there is no task running, run it
 * If the is already a task, ask user permission to add task in a queue.
 * Execute all task one by one
 */
export class SequencialLeafTaskManager extends AbstractLeafTaskManager {

    private runningTask: vscode.Task | undefined = undefined;
    private currentTasksQueue: vscode.Task[] = [];

    /**
     * Execute next task if present if a task end
     */
    protected onDidEndTask(event: vscode.TaskEndEvent) {
        super.onDidEndTask(event);
        if (this.runningTask && event.execution.task === this.runningTask) {
            console.log(`[TaskManager] End task: ${this.runningTask.definition.taskId}/${this.runningTask.name}`);
            this.runningTask = undefined;
            this.runNextTask();
        }
    }

    /**
     * If there is no task running, run it
     * If the is already a task, ask user permission to add task in a queue.
     */
    protected async executeTask(task: vscode.Task): Promise<void> {
        if (!this.runningTask || await this.askUserAboutAddingToQueue()) {
            console.log(`[TaskManager] Add task to queue: ${task.definition.taskId}/${task.name}`);
            this.currentTasksQueue.push(task);
            this.runNextTask();
        } else {
            console.log(`[TaskManager] Task canceled by user: ${task.definition.taskId}/${task.name}`);
            this.terminate(task.definition.taskId, true);
        }
    }

    /**
     * Show warning message with "Forget" and "Cancel" buttons
     */
    private async askUserAboutAddingToQueue(): Promise<boolean> {
        return ACTION_LABELS.ADD_TO_QUEUE === await vscode.window.showWarningMessage(
            "Leaf is already busy. Do you want to queue this new task for later execution, or simply forget it?",
            ACTION_LABELS.FORGET,
            ACTION_LABELS.ADD_TO_QUEUE);
    }

    /**
     * Run next task if any
     */
    private runNextTask() {
        if (this.runningTask) {
            let len = this.currentTasksQueue.length;
            if (len > 0) {
                console.log(`[TaskManager] ${len} task(s) postponed due to other task running: ${this.runningTask.name}`);
            }
        } else {
            this.runningTask = this.currentTasksQueue.shift();
            if (this.runningTask) {
                console.log(`[TaskManager] Start task: ${this.runningTask.definition.taskId}/${this.runningTask.name}`);
                vscode.tasks.executeTask(this.runningTask);
            }
        }
    }
}
