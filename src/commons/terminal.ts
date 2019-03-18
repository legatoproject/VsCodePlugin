'use strict';

import * as vscode from "vscode";
import { Configuration } from './configuration';
import { spawn } from 'child_process';
import { DisposableBag } from './manager';

/**
 * List kind of terminals
 */
export const enum TerminalKind {
    External = "external", // System terminal using $SHELL or 'bash'
    Integrated = "integrated" // VsCode's integrated terminal
}

/**
 * This class is a base used to launch a command in a shell of a new terminal.
 * This terminal can be integrated or external according to the returned value of [getKind](#ReSpawnableTerminal.getKind)
 * [show](#ReSpawnableTerminal.show) is the unique method of this class
 */
export abstract class ReSpawnableTerminal extends DisposableBag {
    /**
     * Integrated terminal in a promise if any
     */
    private integratedPromise: Promise<vscode.Terminal> | undefined;

    /**
     * @param name the name will be ether:
     * - if integrated, shown in the terminal selector combo
     * - or if external, or in a message echoed before the command is executed in terminal
     */
    constructor(private readonly name: string) {
        super();
        // Listen to integrated terminal closing
        vscode.window.onDidCloseTerminal(this.onDidCloseTerminal, this, this);
    }

    /**
     * Called each time any integrated terminal is closed
     */
    private async onDidCloseTerminal(closedTerminal: vscode.Terminal): Promise<void> {
        // Resolve current integrated terminal of any
        let integrated = await this.integratedPromise;
        // If the closing terminal is this one
        if (integrated && closedTerminal === integrated) {
            // Let's dispose it
            integrated.dispose(); // Not sure if it's useful as it's probably already called by system
            this.integratedPromise = undefined; // Mark as closed
        }
    }

    /**
     * Will show the result of the command ether in:
     * - an integrated terminal: if already exist, it will be reused. If not, will be created and shown.
     * - an external terminal: a new system terminal will be launched whenever this method is called.
     */
    public async show(): Promise<void> {
        switch (await this.getKind()) {
            case TerminalKind.Integrated:
                // If there is no integrated terminal
                if (!this.integratedPromise) {
                    // Let's create it
                    this.integratedPromise = this.createNewIntegratedTerminal();
                }
                // Show terminal (without stealing focus)
                console.log(`[ReSpawnableTerminal] Show integrated terminal [${this.name}]`);
                (await this.integratedPromise).show(true);
                break;
            case TerminalKind.External:
                // Launch a new system terminal on each call
                return this.showNewExternalTerminal();
        }
    }

    /**
     * Try to render the final command send to the system
     * Concatenate command and wrap each arg using quotes then join them using spaces
     */
    private joinCmdAndArgs(command: string, args: string[]): string {
        let wrappedArgs = args.map(arg => `'${arg}'`).join(' ');
        return `${command} ${wrappedArgs}`;
    }

    /**
     * Return $SHELL env var or "bash" if not defined
     */
    private getDefaultShell(): string {
        return process.env["SHELL"] || "bash";
    }

    /**
     * Create a new vscode terminal using default shell then show the result of the command
     */
    private async createNewIntegratedTerminal(): Promise<vscode.Terminal> {
        let termOptions = {
            name: this.name,
            shellPath: this.getDefaultShell(),
            shellArgs: ['-c', await this.createCommand()]
        };
        console.log(`[ReSpawnableTerminal] Create new integrated terminal [${this.name}]: ${this.joinCmdAndArgs(termOptions.shellPath, termOptions.shellArgs)}`);
        return vscode.window.createTerminal(termOptions);
    }

    /**
     * Launch a new system terminal from vscode setting 'terminal.external.linuxExec'.
     * In this terminal, we launch a shell which will:
     * - echo the name of the terminal
     * - execute the command synchronously
     * - echo an end message
     */
    private async showNewExternalTerminal() {
        let externTerm = Configuration.VsCode.TerminalExternalLinuxExec.getValue();
        let startMessage = `--------${this.name}--------`;
        let endMessage = 'Press enter to exit';
        let externTermArgs = [
            '-e',  // -e seems to be the most common used argument to pass something to execute by the terminal (tested on gnome-terminal)
            `${this.getDefaultShell()} -c "echo ${startMessage} && ${await this.createCommand()}; echo ${endMessage}; read"` // the command executed by the terminal
        ];
        console.log(`[ReSpawnableTerminal] Launch new external terminal [${this.name}]: ${this.joinCmdAndArgs(externTerm, externTermArgs)}`);
        spawn(externTerm, externTermArgs, {
            detached: true // We don't want to kill launched terminal over vscode restart
        });
    }

    /**
     * Client must implement this method
     * This method is called whenever [show](#ReSpawnableTerminal.show) is called
     * @returns a promise that deliver the command to execute
     */
    protected abstract async createCommand(): Promise<string>;

    /**
     * Client must implement this method
     * This method is called whenever [show](#ReSpawnableTerminal.show) is called
     * @returns the terminal kind to use
     */
    protected abstract getKind(): TerminalKind;
}