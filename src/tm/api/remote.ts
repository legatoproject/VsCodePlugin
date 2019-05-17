'use strict';

import { spawn } from 'child_process';
import { DisposableBag } from '../../commons/manager';
import { LegatoManager } from '../../legato/api/core';

/**
 * List of possible statuses of a Legato application
 */
export const enum AppStatus {
    NotInstalled,
    Stopped,
    Running
}

/**
 * Absolute path to Legato app tool
 * We need to use absolute path because root profile is not loaded in ssh calls
 */
const App = '/legato/systems/current/bin/app';

/**
 * Manage remote commands to device through ssh
 */
export class RemoteDeviceManager extends DisposableBag {

    /**
     * Need 1 managers
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
        return AppStatus.NotInstalled;
    }

    /**
     * Send 'app status' to the remote device and return the result as a map AppName/AppStatus
     * @returns a map AppName/AppStatus representing installed Legato applications
     */
    public async getInstalledApps(): Promise<{ [key: string]: AppStatus }> {
        let output = await this.execute(`${App} status`);
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
     */
    public async startApp(appName: string): Promise<void> {
        await this.execute(`${App} start ${appName}`);
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
}