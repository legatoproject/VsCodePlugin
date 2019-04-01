'use strict';

import { basename } from 'path';
import { LeafManager } from "../../leaf/api/core";
import { LegatoManager } from "../../legato/api/core";
import { DisposableBag } from '../../commons/manager';
import { TaskDefinitionType } from '../../commons/identifiers';
import { TaskProcessLauncher, ProcessLauncherOptions } from '../../commons/process';
import { getWorkspaceFolderPath } from '../../commons/files';

/**
 * Manage device ip and remote shell/logs commands 
 */
export class DeviceManager extends DisposableBag {
    /**
     * Used to launch update, fwupdate and swiflash commands
     */
    private readonly processLauncher: TaskProcessLauncher;

    /**
     * Need 2 managers
     */
    public constructor(
        private readonly leafManager: LeafManager,
        private readonly legatoManager: LegatoManager
    ) {
        super();

        // Create the task process launcher (this class can launch a process as a vscode task)
        let options: ProcessLauncherOptions = {
            defaultCwd: getWorkspaceFolderPath(),
            envProvider: this.leafManager.envVars.get,
            thisArg: this.leafManager.envVars
        };
        this.processLauncher = new TaskProcessLauncher(TaskDefinitionType.LegatoTm, options);
    }

    /**
     * Used by getRemoteShellCmd and getRemoteLogsCmd
     * @returns dest ip if set
     * @throws an error if dest ip is not set
     */
    private async getMandatoryDestIp(): Promise<string> {
        let destIp = await this.legatoManager.destIp.get();
        if (!destIp) {
            throw Error('Cannot launch this command, $DEST_IP is not set');
        }
        return destIp;
    }

    /**
     * @return the command to launch remote shell
     * @throws an error if dest ip is not set
     */
    public async getRemoteShellCmd(): Promise<string> {
        return `ssh root@${await this.getMandatoryDestIp()}`;
    }

    /**
     * @return the command to launch remote logs
     * @throws an error if dest ip is not sets
     */
    public async getRemoteLogsCmd(): Promise<string> {
        return `ssh root@${await this.getMandatoryDestIp()} /sbin/logread -f`;
    }

    /**
     * Install the given update file on device
     */
    public async installOnDevice(updateFilePath: string): Promise<void> {
        return this.processLauncher.executeProcess(
            `Install ${basename(updateFilePath)}`,
            ['update', updateFilePath]);
    }

    /**
     * Flash the given image file on device
     */
    public async flashImage(imageFilePath: string): Promise<void> {
        return this.processLauncher.executeProcess(
            `Flash ${basename(imageFilePath)}`,
            ['fwupdate', 'download', imageFilePath]);
    }

    /**
     * Flash the given image file on device in recovery mode
     */
    public async flashImageRecovery(imageFilePath: string): Promise<void> {
        return this.processLauncher.executeInShell(
            `[Recovery] Flash ${basename(imageFilePath)}`,
            `swiflash -m $LEGATO_TARGET -i '${imageFilePath}'`);
    }

    /**
     * Reset user partition
     */
    public async resetUserPartition(): Promise<void> {
        return this.processLauncher.executeInShell(
            '[Recovery] Reset the user partition',
            'swiflash -m $LEGATO_TARGET -r');
    }
}