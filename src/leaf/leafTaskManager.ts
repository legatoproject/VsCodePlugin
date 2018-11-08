'use strict';

import { CancellationToken, workspace, Task, tasks, TaskPanelKind, WorkspaceFolder, Uri, TaskEndEvent, TaskRevealKind, TaskGroup, ShellExecution } from "vscode";
import { LeafManager } from './leafCore';
import { Disposable } from 'vscode';

export abstract class AbstractLeafTaskManager {
    private readonly listener: Disposable;
    private readonly idGenerator: IterableIterator<number> = AbstractLeafTaskManager.newIdGenerator();
    private pendingRequests: {
        [key: string]: {
            resolve: (value?: void | PromiseLike<void>) => void,
            reject: (reason?: any) => void
        }
    } = {};

    protected constructor(public env?: { [key: string]: string }) {
        this.listener = tasks.onDidEndTask(event => this.onDidEndTask(event));
    }

    public async executeAsTask(name: string, cmd: string): Promise<void> {
        let task = this.createNewTask(name, cmd);
        let out = this.toPromise(task);
        this.executeTask(task);
        return out;
    }

    protected abstract executeTask(task: Task): void;

    protected onDidEndTask(event: TaskEndEvent) {
        let taskId = event.execution.task.definition.taskId;
        if (taskId && taskId in this.pendingRequests) {
            this.pendingRequests[taskId].resolve();
            delete this.pendingRequests[taskId];
        }
    }

    private createNewTask(name: string, cmd: string): Task {
        let taskDefinition = {
            type: 'Leaf',
            taskId: this.idGenerator.next().value
        };
        let target: WorkspaceFolder = {
            uri: Uri.file(LeafManager.INSTANCE.getLeafWorkspaceDirectory()),
            name: 'leaf-workspace',
            index: 0
        };
        let execution = new ShellExecution(cmd, {
            cwd: workspace.rootPath,
            env: this.env
        });
        let task = new Task(taskDefinition, target, name, 'Leaf', execution);
        task.group = TaskGroup.Build;
        task.isBackground = false;
        task.presentationOptions = {
            reveal: TaskRevealKind.Always,
            echo: true,
            focus: false,
            panel: TaskPanelKind.Dedicated,
            showReuseMessage: true
        };
        return task;
    }

    private async toPromise(task: Task): Promise<void> {
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

export class ParallelLeafTaskManager extends AbstractLeafTaskManager {

    private pendingTasks: { [id: string]: Task } = {};

    public constructor(env?: { [key: string]: string }) {
        super(env);
        tasks.registerTaskProvider('Leaf', {
            provideTasks: (token?: CancellationToken) => {
                console.log(`Task provider return ${Object.keys(this.pendingTasks).length} task(s)`);
                let out: Task[] = [];
                for (let taskId in this.pendingTasks) {
                    out.push(this.pendingTasks[taskId]);
                }
                return out;
            },
            resolveTask: (task: Task, token?: CancellationToken) => {
                // Currently not called by VS Code. It is there to optimize task loading in the future.
                return undefined;
            }
        });
    }

    protected onDidEndTask(event: TaskEndEvent) {
        super.onDidEndTask(event);
        let removedTask = event.execution.task;
        let removedTaskId = removedTask.definition.taskId;
        console.log(`End task: ${removedTaskId}/${removedTask.name}`);
        if (removedTaskId in this.pendingTasks) {
            console.log(`Remove task to pending tasks: ${removedTaskId}/${removedTask.name}`);
            delete this.pendingTasks[removedTaskId];
        }
    }

    protected executeTask(task: Task): void {
        let taskId = task.definition.taskId;
        console.log(`Add task to pending tasks: ${taskId}/${task.name}`);
        this.pendingTasks[taskId] = task;
        console.log(`Start task: ${taskId}/${task.name}`);
        tasks.executeTask(task);
    }
}

export class SequencialLeafTaskManager extends AbstractLeafTaskManager {

    private runningTask: Task | undefined = undefined;
    private currentTasksQueue: Task[] = [];

    public constructor(env?: { [key: string]: string }) {
        super(env);
    }

    protected onDidEndTask(event: TaskEndEvent) {
        super.onDidEndTask(event);
        if (this.runningTask && event.execution.task === this.runningTask) {
            console.log(`End task: ${this.runningTask.definition.taskId}/${this.runningTask.name}`);
            this.runningTask = undefined;
            this.runNextTask();
        }
    }

    protected executeTask(task: Task): void {
        console.log(`Add task to queue: ${task.definition.taskId}/${task.name}`);
        this.currentTasksQueue.push(task);
        this.runNextTask();
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
                tasks.executeTask(this.runningTask);
            }
        }
    }
}
