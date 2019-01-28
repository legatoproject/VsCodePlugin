'use strict';

import * as vscode from "vscode";
import { TaskDefinitionType } from '../commons/identifiers';
import { EnvVars, PromiseCallbacks, PromiseExecutor, newIdGenerator } from '../commons/utils';
import { spawn, SpawnOptions, ChildProcess } from 'child_process';
import { Scheduler, Immediate } from '../commons/scheduler';

/**
 * Abstract parent of TaskProcessLauncher and OutputChannelProcessLauncher
 */
abstract class ProcessLauncher {

    /**
     * @param cwd the path where to execute the processes
     * @param scheduler an optional scheduler
     * @param envProvider an optional env provider used on each process launching
     * @param thisArgs The `this`-argument which will be used when calling the env vars provider.
     */
    public constructor(
        protected readonly cwd: string,
        private readonly scheduler: Scheduler = new Immediate(),
        private readonly envProvider: () => Promise<EnvVars | undefined>,
        private readonly thisArgs?: any) { }

    /**
     * @return the env vars to use
     */
    protected async getEnv(): Promise<EnvVars> {
        let env = await this.envProvider.apply(this.thisArgs);
        if (!env) {
            throw new Error("No env available, execution canceled");
        }

        return env;
    }

    /**
     * Execute the command as a process using the scheduler given in constructor
     */
    public executeProcess(name: string, ...cmd: string[]) {
        this.scheduler.schedule(this.createExecutor(name, false, ...cmd));
    }

    /**
     * Execute the command in a shell using the scheduler given in constructor
     */
    public executeInShell(name: string, cmdLine: string) {
        this.scheduler.schedule(this.createExecutor(name, true, cmdLine));
    }

    /**
     * Create a PromiseExecutor from a name and a command
     */
    protected abstract createExecutor(name: string, inShell: boolean, ...cmd: string[]): PromiseExecutor<void>;
}

/**
 * This class can launch a process as a vscode task
 */
export class TaskProcessLauncher extends ProcessLauncher {
    private pendingRequests: PromiseCallbacks<void> = {}; // Pending promise callbacks
    private readonly idGenerator: IterableIterator<number> = newIdGenerator(); // task id generator
    private readonly taskListenerDisposable: vscode.Disposable;

    /**
     * @param taskDefinitionType the type to use when creating task
     * @param cwd the path where to execute the processes
     * @param scheduler an optional scheduler
     * @param envProvider an optional env provider used on each process launching
     * @param thisArgs The `this`-argument which will be used when calling the env vars provider.
     */
    public constructor(
        private readonly taskDefinitionType: TaskDefinitionType,
        cwd: string,
        scheduler: Scheduler | undefined,
        envProvider: () => Promise<EnvVars | undefined>,
        thisArgs?: any
    ) {
        super(cwd, scheduler, envProvider, thisArgs);
        // Listen to task ending
        this.taskListenerDisposable = vscode.tasks.onDidEndTask(this.onDidEndTask, this);
    }

    /**
     * Create a PromiseExecutor from a name and a command
     */
    protected createExecutor(name: string, inShell: boolean, ...cmd: string[]): PromiseExecutor<void> {
        let task = this.createNewTask(name, inShell, cmd);
        return async (resolve, reject) => {
            let resolvedTask = await task;
            let taskId: string = resolvedTask.definition.taskId as string;
            this.pendingRequests[taskId] = {
                resolve: resolve,
                reject: reject
            };
            console.log(`[TaskProcessLauncher] Start task: ${taskId}/${resolvedTask.name}`);
            vscode.tasks.executeTask(resolvedTask);
        };
    }

    /**
     * Create a task with ShellExecution
     */
    private async createNewTask(name: string, inShell: boolean, cmd: string[]): Promise<vscode.Task> {
        let taskDefinition = {
            type: this.taskDefinitionType,
            taskId: this.idGenerator.next().value
        };
        let uri = vscode.Uri.file(this.cwd);
        let workspaceFolder: vscode.WorkspaceFolder | undefined = undefined;
        if (vscode.workspace.workspaceFolders) {
            workspaceFolder = vscode.workspace.workspaceFolders.find(value => value.uri.toString() === uri.toString());
        }
        if (!workspaceFolder) {
            throw new Error("Impossible to find leaf workspace directory");
        }

        let execution: vscode.ProcessExecution | vscode.ShellExecution;
        let env = await this.getEnv();
        if (inShell) {
            execution = new vscode.ShellExecution(cmd[0], {
                cwd: this.cwd,
                env: env
            });
        } else {
            execution = new vscode.ProcessExecution(cmd[0], cmd.slice(1), {
                cwd: this.cwd,
                env: env
            });
        }
        let task = new vscode.Task(taskDefinition, workspaceFolder, name, 'Leaf', execution);
        task.group = vscode.TaskGroup.Build;
        task.isBackground = false;
        task.presentationOptions = {
            reveal: vscode.TaskRevealKind.Always,
            echo: true,
            focus: true,
            panel: vscode.TaskPanelKind.Dedicated,
            showReuseMessage: true
        };
        return task;
    }

    /**
     * Called on task end
     */
    private onDidEndTask(event: vscode.TaskEndEvent) {
        let taskId = event.execution.task.definition.taskId;
        if (taskId in this.pendingRequests) {
            this.pendingRequests[taskId].resolve();
            delete this.pendingRequests[taskId];
            console.log(`[TaskProcessLauncher][${this.taskDefinitionType}] End task: ${taskId}`);
        }
    }

    /**
     * Dispose task listener
     */
    public dispose() {
        this.taskListenerDisposable.dispose();
    }
}

export class OutputChannelProcessLauncher extends ProcessLauncher {
    private channel: vscode.OutputChannel;

    /**
     * Creates a new [output channel](#OutputChannel)
     * @param name Human-readable string which will be used to represent the channel in the UI.
     * @param cwd the path where to execute the processes
     * @param scheduler an optional scheduler
     * @param envProvider an optional env provider used on each process launching
     * @param thisArgs The `this`-argument which will be used when calling the env vars provider.
     */
    public constructor(
        public readonly name: string,
        cwd: string,
        scheduler: Scheduler | undefined,
        envProvider: () => Promise<EnvVars | undefined>,
        thisArgs?: any
    ) {
        super(cwd, scheduler, envProvider, thisArgs);
        console.log(`[OutputChannelProcessLauncher][${this.name}] Create channel`);
        this.channel = vscode.window.createOutputChannel(this.name);
    }

    /**
     * Create a PromiseExecutor from a name and a command
     */
    protected createExecutor(name: string, inShell: boolean, ...cmd: string[]): PromiseExecutor<void> {
        return async (resolve, reject) => {
            console.log(`[OutputChannelProcessLauncher][${this.name}] Execute command ${name}: ${cmd.join(' ')}`);
            this.channel.appendLine(`----------- ${name} -----------`);
            this.channel.appendLine(`> ${cmd.join(' ')}`);
            let options: SpawnOptions = {
                cwd: this.cwd,
                env: await this.getEnv(),
                shell: inShell
            };
            let childProcess: ChildProcess;
            if (inShell) {
                childProcess = spawn(cmd[0], options);
            } else {
                childProcess = spawn(cmd[0], cmd.slice(1), options);
            }
            childProcess.stdout.on("data", chunk => {
                this.channel.append(chunk.toString());
            });
            childProcess.stderr.on("data", chunk => {
                this.channel.append(chunk.toString());
            });
            childProcess.on("error", err => {
                this.channel.appendLine(err.toString());
                reject(err);
            });
            childProcess.on("close", (code: number | null, _signal: string | null) => {
                console.log(`[OutputChannelProcessLauncher][${this.name}] End command ${name}: '${cmd.join(' ')}' with code ${code}`);
                this.channel.appendLine(`=> Operation terminated with return code ${code}`);
                if (code && code !== 0) {
                    this.channel.show(true); // true to not take focus
                    reject(new Error(`Return code: ${code}`));
                } else {
                    resolve();
                }
            });
        };
    }

    /**
     * Dispose the channel
     */
    public dispose() {
        this.channel.dispose();
    }
}
