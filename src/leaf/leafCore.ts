'use strict';

import { EventEmitter } from "events";
import { join } from "path";
import { workspace } from "vscode";
import { unwatchFile, watchFile, readlinkSync } from "fs";
import { exec } from 'child_process';
import { AbstractLeafTaskManager, ParallelLeafTaskManager } from './leafTaskManager';
import { LEAF_INTERFACE_COMMANDS, LeafInterface } from './leafInterface';

export const LEAF_ENV = {
  LEAF_PROFILE: 'LEAF_PROFILE'
};
export const LEAF_COMMANDS = {
  shell: "shell"
};
export const LEAF_EVENT = {
  profileChanged: "profileChanged"
};
export const LEAF_TASKS = {
  setEnv: "set Leaf env"
};

/**
 * LeafManager is responsible for the leaf lifecycle.
 */
export class LeafManager extends EventEmitter {
  public static readonly INSTANCE: LeafManager = new LeafManager();
  private readonly leafPath: Promise<string>;
  private readonly leafVersion: Promise<string>;
  private readonly currentProfilePath: string;
  private readonly taskManager: AbstractLeafTaskManager = new ParallelLeafTaskManager();
  //  private readonly taskManager: AbstractLeafTaskManager = new SequencialLeafTaskManager();
  private readonly leafInterface: LeafInterface = new LeafInterface();

  private constructor() {
    super();
    this.leafPath = this.executeInWsShell(`which leaf`);
    this.leafVersion = this.leafInterface.send(LEAF_INTERFACE_COMMANDS.VERSION);
    this.currentProfilePath = join(this.getLeafWorkspaceDirectory(), 'leaf-data', 'current');
    this.watchCurrentProfile();
  }

  private async executeInWsShell(command: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const options = {
        encoding: 'utf8',
        timeout: 0,
        cwd: this.getLeafWorkspaceDirectory()
      };
      exec(`${command}`, options, (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => {
        if (stderr) {
          reject(new Error(stderr.toString().trim()));
        } else if (error) {
          reject(error);
        } else {
          let stdoutStr = stdout.toString().trim();
          let out = stdoutStr.length === 0 ? undefined : stdoutStr;
          resolve(out);
        }
      });
    });
  }

  private watchCurrentProfile() {
    // 'watch' is recomanded and have better performance than 'watchfFile', but it seems that it does not work with symlinks
    watchFile(this.currentProfilePath, async (_curr, _prev) => {
      this.emit(LEAF_EVENT.profileChanged, this.getCurrentProfileName());
    });
  }

  public async getLeafPath(): Promise<string> {
    return this.leafPath;
  }

  public async getLeafVersion(): Promise<string> {
    return this.leafVersion;
  }

  public getLeafWorkspaceDirectory(): string {
    if (workspace.rootPath) {
      return workspace.rootPath;
    }
    throw new Error('workspace.rootPath is undefined');
  }

  public getCurrentProfileName(): string {
    return readlinkSync(this.currentProfilePath);
  }

  public async requestInstalledPackages(): Promise<any> {
    return this.leafInterface.send(LEAF_INTERFACE_COMMANDS.INSTALLED_PACKAGES);
  }

  public async requestAvailablePackages(): Promise<any> {
    return this.leafInterface.send(LEAF_INTERFACE_COMMANDS.AVAILABLE_PACKAGES);
  }

  public async requestRemotes(): Promise<any> {
    return this.leafInterface.send(LEAF_INTERFACE_COMMANDS.REMOTES);
  }

  public async listProfiles(): Promise<any[]> {
    let info = await this.leafInterface.send(LEAF_INTERFACE_COMMANDS.WORKSPACE_INFO);
    let out = { ...info.profiles };
    return out;
  }

  public async switchProfile(profile: string): Promise<void> {
    return this.taskManager.executeAsTask(`Switching to profile ${profile}`, `leaf profile switch ${profile}`);
  }

  public async createProfile(profile?: string, pack?: string): Promise<void> {
    let cmd = 'leaf setup';
    if (pack) {
      cmd += ` -p ${pack}`;
    }
    if (profile) {
      cmd += ` ${profile}`;
    }
    return this.taskManager.executeAsTask(`Create new profile`, cmd);
  }

  public async addPackageToProfile(pack: string, profileId: string, profile?: any): Promise<void> {
    let cmd: string;
    if (profile && profile.current) {
      cmd = `leaf update -p ${pack}`;
    } else {
      cmd = `leaf profile config -p ${pack} ${profileId} && leaf profile sync ${profileId}`;
    }
    return this.taskManager.executeAsTask(`Add ${pack} to profile ${profileId}`, cmd);
  }

  public async enableRemote(remoteId: string, enabled: boolean = true): Promise<void> {
    return this.taskManager.executeAsTask(`${enabled ? "Enable" : "Disable"} remote ${remoteId}`, `leaf remote ${enabled ? "enable" : "disable"} ${remoteId}`);
  }

  public async fetchRemote(): Promise<void> {
    return this.taskManager.executeAsTask("Fetch remotes", "leaf remote fetch");
  }

  public async getEnvVars(): Promise<any> {
    try {
      return await this.leafInterface.send(LEAF_INTERFACE_COMMANDS.RESOLVE_VAR);
    } catch (e) {
      throw new Error(`Failed to get leaf env`);
    }
  }

  public async getEnvValue(envvar: string): Promise<string> {
    let envVariables = await this.getEnvVars();
    return envVariables[envvar];
  }

  public setEnvValue(envar: string, value: string) {
    let command = `leaf env profile --set ${envar}=\"${value}\"`;
    return this.taskManager.executeAsTask(LEAF_TASKS.setEnv, command);
  }

  public async addRemote(alias: string, url: string) {
    return this.taskManager.executeAsTask(`Add remote ${alias} (${url})`, `leaf remote add --insecure ${alias} ${url}`);
  }

  public async removeRemote(...alias: string[]) {
    return this.taskManager.executeAsTask(`Remove remote ${alias}`, `leaf remote remove ${alias.join(' ')}`);
  }

  public async dispose() {
    unwatchFile(this.currentProfilePath);
    this.taskManager.dispose();
  }
}
