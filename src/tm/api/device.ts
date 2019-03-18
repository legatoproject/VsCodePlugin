'use strict';

import { basename } from 'path';
import { LeafManager } from "../../leaf/api/core";
import { LegatoManager } from "../../legato/api/core";
import { DisposableBag } from '../../commons/manager';
import { TaskDefinitionType } from '../../commons/identifiers';
import { TaskProcessLauncher, ProcessLauncherOptions } from '../../commons/process';
import { getWorkspaceFolderPath } from '../../commons/files';
import { ModelElement } from '../../commons/model';

/**
 * Manage device ip and remote shell/logs commands 
 */
export class DeviceManager extends DisposableBag {
    /**
     * Used to launch update, fwupdate and swiflash commands
     */
    private readonly processLauncher: TaskProcessLauncher;

    // Exposed model
    private readonly destIp = new ModelElement<string>("legato.tm.destip", this);
    public readonly remoteShellCmd = new ModelElement<string>("legato.tm.cmd.shell", this);
    public readonly remoteLogsCmd = new ModelElement<string>("legato.tm.cmd.logs", this);

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

        // Listen to env changes to update destip
        this.legatoManager.destIp.addDependency(this.destIp, this.errorIfUndefined, this);

        // Listen dest ip to update shell/logs cmds
        this.destIp
            .addDependency(this.remoteShellCmd, destIp => `ssh root@${destIp}`, this)
            .addDependency(this.remoteLogsCmd, destIp => `ssh root@${destIp} /sbin/logread -f`, this);
    }

    /**
     * Throw error of no dest ip is set
     */
    private errorIfUndefined(destIp: string | undefined): string {
        if (!destIp) {
            throw Error('Cannot launch this command, $DEST_IP is not set');
        }
        return destIp;
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