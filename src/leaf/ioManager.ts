'use strict';

import { TaskDefinitionType } from '../commons/identifiers';
import { DisposableBag, EnvVars } from '../commons/utils';
import { Sequencer } from '../commons/scheduler';
import { LeafBridge, LeafBridgeElement, LeafBridgeCommands } from './bridge';
import { OutputChannelProcessLauncher, TaskProcessLauncher } from '../commons/process';

/**
 * Take care of IO operation from/to Leaf
 */
export class LeafIOManager extends DisposableBag {

    // Use sequencer to ensure only one command is send to leaf at a time
    private readonly sequencer: Sequencer;

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
        this.sequencer = new Sequencer('Leaf');
        this.bridge = this.toDispose(new LeafBridge());
        this.outputChannelProcessLauncher = this.toDispose(new OutputChannelProcessLauncher('Leaf', cwd, this.sequencer, this.getEnv, this));
        this.taskProcessLauncher = this.toDispose(new TaskProcessLauncher(TaskDefinitionType.Leaf, cwd, this.sequencer, this.getEnv, this));
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
     * Execute a command as a task
     * @return a promise that is resolved at the end of the task or rejected if the user cancel it
     */
    public async executeAsTask(name: string, ...cmd: string[]): Promise<void> {
        return this.taskProcessLauncher.executeProcess(name, ...cmd);
    }

    /**
     * Execute a command as a child process and print the output in a channel
     * @return a promise that is resolved at the end of the process or rejected if the user cancel it
     */
    public async executeAsChannel(name: string, ...cmd: string[]): Promise<void> {
        return this.outputChannelProcessLauncher.executeProcess(name, ...cmd);
    }

    /**
     * Send a command to the Leaf Bridge
     * @return a promise that is resolved when the Bridge give an answer
     */
    public async sendToBridge(cmd: LeafBridgeCommands): Promise<LeafBridgeElement | undefined> {
        return this.bridge.send(cmd);
    }
}
