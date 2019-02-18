'use strict';

import { TaskDefinitionType } from '../commons/identifiers';
import { EnvVars } from '../commons/utils';
import { DisposableBag } from '../commons/manager';
import { PoliteSequencer, Scheduler } from '../commons/scheduler';
import { LeafBridge, LeafBridgeElement, LeafBridgeCommands } from './bridge';
import { ProcessLauncher, OutputChannelProcessLauncher, TaskProcessLauncher, ProcessLauncherOptions } from '../commons/process';

export const enum ExecKind {
    Task,
    OutputChannel
}

/**
 * Take care of IO operation from/to Leaf
 */
export class LeafIOManager extends DisposableBag {

    // Use sequencer to ensure only one command is send to leaf at a time
    private readonly sequencer: Scheduler;

    // Leaf Bridge
    private readonly bridge: LeafBridge;

    // Leaf output channel process launcher
    private readonly outputChannelProcessLauncher: OutputChannelProcessLauncher;

    // Leaf tasks process launcher
    private readonly taskProcessLauncher: TaskProcessLauncher;

    /**
     * @param cwd the path where to execute the processes
     */
    public constructor(private readonly cwd: string) {
        super();
        this.sequencer = new PoliteSequencer('Leaf');
        this.bridge = this.toDispose(new LeafBridge());
        let options: ProcessLauncherOptions = {
            defaultCwd: cwd,
            scheduler: this.sequencer,
            envProvider: this.getEnv,
            thisArg: this
        };
        this.outputChannelProcessLauncher = this.toDispose(new OutputChannelProcessLauncher('Leaf', options));
        this.taskProcessLauncher = this.toDispose(new TaskProcessLauncher(TaskDefinitionType.Leaf, options));
    }

    /**
     * Build env for our processes
     */
    private getEnv(): Promise<EnvVars> {
        let env = process.env as EnvVars;
        env["LEAF_WORKSPACE"] = this.cwd;
        return Promise.resolve(env);
    }

    /**
     * Return the launcher of the given kind
     */
    private getLauncher(kind: ExecKind): ProcessLauncher {
        switch (kind) {
            case ExecKind.OutputChannel:
                return this.outputChannelProcessLauncher;
            case ExecKind.Task:
                return this.taskProcessLauncher;
        }
    }

    /**
     * Execute a command as a task
     * @return a promise that is resolved at the end of the task or rejected if the user cancel it
     */
    public executeInShell(kind: ExecKind, name: string, cmdLine: string): Promise<void> {
        return this.getLauncher(kind).executeInShell(name, cmdLine);
    }

    /**
     * Execute a command as a child process and print the output in a channel
     * @return a promise that is resolved at the end of the process or rejected if the user cancel it
     */
    public executeProcess(kind: ExecKind, name: string, ...cmdArray: string[]): Promise<void> {
        return this.getLauncher(kind).executeProcess(name, cmdArray);
    }

    /**
     * Send a command to the Leaf Bridge
     * @return a promise that is resolved when the Bridge give an answer
     */
    public sendToBridge(cmd: LeafBridgeCommands): Promise<LeafBridgeElement | undefined> {
        return this.bridge.send(cmd);
    }
}
