'use strict';

import * as vscode from "vscode";
import { TaskDefinitionType } from '../commons/identifiers';
import { EnvVars } from '../commons/utils';
import { spawn, SpawnOptions, ChildProcess } from 'child_process';
import { Scheduler, Immediate, Sequencer } from '../commons/scheduler';
import { WaitingPromise } from '../commons/promise';
import { DisposableBag } from './manager';

/**
 * Return the Error corresponding to the given return code
 * @param returnCode the return code of the process
 * @returns the corresponding error
 */
export function createReturnCodeError(returnCode: number) {
    return new Error(`Return code: ${returnCode}`);
}

export interface ProcessLauncherOptions {
    /**
     * the path where to execute the processes.
     * Can be overridden in [ProcessLauncher.executeProcess] and [ProcessLauncher.executeInShell]
     */
    readonly defaultCwd?: string;
    /**
     * The scheduler to use when executing cmd
     * If ignored, processes are executed immediatly
     */
    readonly scheduler?: Scheduler;

    /**
     * A provider than can dynamically give the current env to use when executing a process
     */
    readonly envProvider: () => Promise<EnvVars | undefined>;

    /**
     * The `this`-argument which will be used when calling the env vars provider.
     */
    readonly thisArg?: any;
}


/**
 * Abstract parent of TaskProcessLauncher and OutputChannelProcessLauncher
 */
export abstract class ProcessLauncher extends DisposableBag {

    private readonly options: ProcessLauncherOptions;
    private readonly scheduler: Scheduler;

    /**
     * @param options an instance of [ProcessLauncherOptions](#ProcessLauncherOptions)
     */
    public constructor(public readonly name: string, options: ProcessLauncherOptions) {
        super();
        this.options = options;
        this.scheduler = options.scheduler || this.getDefaultScheduler();
    }

    /**
     * Return scheduler to use if no one is given in options
     */
    protected getDefaultScheduler(): Scheduler {
        return new Immediate();
    }

    /**
     * @return the env vars to use
     */
    protected async getEnv(): Promise<EnvVars> {
        let env = await this.options.envProvider.apply(this.options.thisArg);
        if (!env) {
            throw new Error("No env available, execution canceled");
        }
        return env;
    }

    /**
     * Check that cwd have been given either in constructor or method
     */
    private checkCwdAvailable(cwdFromMethod?: string): string {
        let cwdToUse = cwdFromMethod || this.options.defaultCwd;
        if (!cwdToUse) {
            throw new Error("cwd must be given at least once in constructor or in method");
        }
        return cwdToUse;
    }

    /**
     * Execute the command as a process using the scheduler given in constructor
     */
    public executeProcess(name: string, cmdArray: string[], cwd?: string): Promise<void> {
        return this.scheduler.schedule(this.createWaitingPromise(name, false, cmdArray, this.checkCwdAvailable(cwd)));
    }

    /**
     * Execute the command in a shell using the scheduler given in constructor
     */
    public executeInShell(name: string, cmdLine: string, cwd?: string): Promise<void> {
        return this.scheduler.schedule(this.createWaitingPromise(name, true, [cmdLine], this.checkCwdAvailable(cwd)));
    }

    /**
     * Create a PromiseExecutor from a name and a command
     */
    protected abstract createWaitingPromise(name: string, inShell: boolean, cmdArray: string[], cwd: string): WaitingPromise<void>;
}

/**
 * Turn a unexecuted Task into a WaitingPromise on which execute can be called later.
 * Will be resolved or rejected at the end of the task execution
 * Will never be resolved or rejected if [execute](#execute) is never called
 */
class TaskPromise extends WaitingPromise<void> {
    private readonly taskListener: vscode.Disposable;
    constructor(private readonly taskPromise: Promise<vscode.Task>) {
        super(async () => {
            let task = await this.taskPromise;
            console.log(`[TaskProcessLauncher] Start task: ${task.name}`);
            vscode.tasks.executeTask(task);
        });
        this.taskListener = vscode.tasks.onDidEndTaskProcess(this.onDidEndTask, this);
    }

    /**
     * Called on task end
     */
    private async onDidEndTask(event: vscode.TaskProcessEndEvent) {
        let endingTask = event.execution.task;
        let thisTask = await this.taskPromise;
        if (endingTask === thisTask) {
            console.log(`[TaskProcessLauncher][${thisTask.definition.type}] End task: '${thisTask.name}' with exit code ${event.exitCode}`);
            if (event.exitCode === 0) {
                this.resolve();
            } else {
                this.reject(createReturnCodeError(event.exitCode));
            }
            this.taskListener.dispose();
        }
    }
}

/**
 * This class can launch a process as a vscode task
 */
export class TaskProcessLauncher extends ProcessLauncher {

    /**
     * @param taskDefinitionType the type to use when creating task
     * @param options an instance of [ProcessLauncherOptions](#ProcessLauncherOptions)
     */
    public constructor(
        private readonly taskDefinitionType: TaskDefinitionType,
        options: ProcessLauncherOptions
    ) {
        super(taskDefinitionType, options);
    }

    /**
     * Tasks need to have a scheduler to avoid 'Terminate/Restart' popup
     */
    protected getDefaultScheduler(): Scheduler {
        return new Sequencer(this.taskDefinitionType);
    }

    /**
     * Create a PromiseExecutor from a name and a command
     */
    protected createWaitingPromise(name: string, inShell: boolean, cmdArray: string[], cwd: string): TaskPromise {
        let task = this.createNewTask(name, inShell, cmdArray, cwd);
        return new TaskPromise(task);
    }

    /**
     * Create a task with ShellExecution
     */
    private async createNewTask(name: string, inShell: boolean, cmdArray: string[], cwd: string): Promise<vscode.Task> {
        let taskDefinition: vscode.TaskDefinition = {
            type: this.taskDefinitionType,
        };
        let execOptions = {
            cwd: cwd,
            env: await this.getEnv()
        };
        let execution: vscode.ProcessExecution | vscode.ShellExecution;
        if (inShell) {
            execution = new vscode.ShellExecution(cmdArray[0], execOptions);
        } else {
            execution = new vscode.ProcessExecution(cmdArray[0], cmdArray.slice(1), execOptions);
        }
        let task = new vscode.Task(taskDefinition, vscode.TaskScope.Workspace, name, 'Leaf', execution);
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
}

/**
 * This class can launch a process as and show its output on a dedicated channel
 */
export class OutputChannelProcessLauncher extends ProcessLauncher {
    private channel: vscode.OutputChannel;

    /**
     * Creates a new [output channel](#OutputChannel)
     * @param name Human-readable string which will be used to represent the channel in the UI.
     * @param options an instance of [ProcessLauncherOptions](#ProcessLauncherOptions)
     */
    public constructor(
        name: string,
        options: ProcessLauncherOptions
    ) {
        super(name, options);
        console.log(`[OutputChannelProcessLauncher][${this.name}] Create channel`);
        this.channel = this.toDispose(vscode.window.createOutputChannel(this.name));
    }

    /**
     * Create a PromiseExecutor from a name and a command
     */
    protected createWaitingPromise(name: string, inShell: boolean, cmdArray: string[], cwd: string): WaitingPromise<void> {
        return new WaitingPromise(async (resolve, reject) => {
            console.log(`[OutputChannelProcessLauncher][${this.name}] Execute command ${name}: ${cmdArray.join(' ')}`);
            this.channel.appendLine(`----------- ${name} -----------`);
            this.channel.appendLine(`> ${cmdArray.join(' ')}`);
            let options: SpawnOptions = {
                cwd: cwd,
                env: await this.getEnv(),
                shell: inShell
            };
            let childProcess: ChildProcess;
            if (inShell) {
                childProcess = spawn(cmdArray[0], options);
            } else {
                childProcess = spawn(cmdArray[0], cmdArray.slice(1), options);
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
                console.log(`[OutputChannelProcessLauncher][${this.name}] End command ${name}: '${cmdArray.join(' ')}' with code ${code}`);
                this.channel.appendLine(`=> Operation terminated with return code ${code}`);
                if (code && code !== 0) {
                    this.channel.show(true); // true to not take focus
                    reject(createReturnCodeError(code));
                } else {
                    resolve();
                }
            });
        });
    }
}
