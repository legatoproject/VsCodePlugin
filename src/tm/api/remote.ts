'use strict';

import { spawn } from 'child_process';
import { DisposableBag } from '../../commons/manager';
import { LegatoManager } from '../../legato/api/core';
import { join } from 'path';

/**
 * List of possible statuses of a Legato application
 */
export const enum AppStatus {
    NotInstalled,
    Stopped,
    Running,
    Paused
}

/**
 * Manage remote commands to device through ssh
 */
export class RemoteDeviceManager extends DisposableBag {

    /**
     * Absolute path to current Legato system
     */
    private readonly currentSystemPath: string = '/legato/systems/current';

    /**
     * Absolute path to Legato app tool
     * We need to use absolute path because root profile is not loaded in ssh calls
     */
    private readonly appTool: string = join(this.currentSystemPath, 'bin', 'app');

    /**
     * The path to the gdb server on the device
     */
    public readonly gdbServerPath: string = this.getExecutablePath('devMode', 'gdbserver');

    /**
     * Need 1 manager
     */
    public constructor(
        private readonly legatoManager: LegatoManager
    ) {
        super();
    }

    /**
     * Parse a part of what 'app status' command returns
     * @param text the string that represent an app state returned by 'app status' command
     * @returns the corresponding state using AppStatus enum
     */
    private parseState(text: string): AppStatus {
        if (text === '[running]') {
            return AppStatus.Running;
        }
        if (text === '[stopped]') {
            return AppStatus.Stopped;
        }
        if (text === '[paused]') {
            return AppStatus.Paused;
        }
        return AppStatus.NotInstalled;
    }

    /**
     * Send 'app status' to the remote device and return the result as a map AppName/AppStatus
     * @returns a map AppName/AppStatus representing installed Legato applications
     */
    public async getInstalledApps(): Promise<{ [key: string]: AppStatus }> {
        let output = await this.execute(`${this.appTool} status`);
        let lines = output.split('\n').filter(line => line.length > 0);
        let out: { [key: string]: AppStatus } = {};
        for (let line of lines) {
            let [state, app] = line.split(' ');
            out[app] = this.parseState(state);
        }
        return out;
    }

    /**
     * Start a Legato application on the remote device
     * @param appName the name of the application
     * @param debug if specified, start the specified process stopped, ready to attach a debugger
     */
    public async startApp(appName: string, ...debug: string[]): Promise<void> {
        let cmd = `${this.appTool} start ${appName}`;
        if (debug.length > 0) {
            cmd += ` --debug=${debug.join(',')}`;
        }
        await this.execute(cmd);
    }

    /**
     * Stop a Legato application on the remote device
     * @param appName the name of the application
     */
    public async stopApp(appName: string): Promise<void> {
        await this.execute(`${this.appTool} stop ${appName}`);
    }

    /**
     * Execute an arbitrary command on remote device through ssh
     * @param cmd the command to execute on device
     * If the return code is not 0, the promise is rejected with the error code in the embedded error
     */
    private execute(cmd: string): Promise<string> {
        return new Promise(async (resolve, reject) => {
            console.log(`[RemoteDeviceManager] Execute command: '${cmd}'`);
            let buffer: string[] = [];
            let destIp = await this.legatoManager.destIp.getMandatory();
            let childProcess = spawn('ssh', [`root@${destIp}`, cmd]);
            childProcess.stdout.on("data", chunk => {
                buffer.push(chunk.toString());
            });
            childProcess.stderr.on("data", chunk => {
                console.log(chunk.toString());
            });
            childProcess.on("error", err => {
                console.log(err.toString());
                reject(err);
            });
            childProcess.on("close", (code: number | null, _signal: string | null) => {
                console.log(`[RemoteDeviceManager] Command '${cmd}' terminated with code ${code}`);
                if (code && code !== 0) {
                    reject(new Error(`Return code: ${code}`));
                } else {
                    resolve(buffer.join(''));
                }
            });
        });
    }

    /**
     * @param applicationName the name of the Legato application
     * @param executableName the name of the executable file
     * @returns the absolute executable path
     */
    public getExecutablePath(applicationName: string, executableName: string): string {
        return join(this.currentSystemPath, 'apps', applicationName, 'read-only', 'bin', executableName);
    }
}