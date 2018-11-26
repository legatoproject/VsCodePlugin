'use strict';

import { exec } from 'child_process';
import { EventEmitter } from "events";
import { readlinkSync, unwatchFile, watch } from "fs";
import { join } from "path";
import { workspace } from "vscode";
import { LeafInterface, LEAF_INTERFACE_COMMANDS } from './leafInterface';
import { AbstractLeafTaskManager, SequencialLeafTaskManager } from './leafTaskManager';
export const LEAF_ENV_SCOPE = {
  package: "package",
  workspace: "workspace",
  profile: "profile",
  user: "user"
};
export const LEAF_COMMANDS = {
  shell: "shell"
};
export const LEAF_EVENT = {
  profileChanged: "profileChanged",
  envChanged: "envChanged"
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
  private readonly leafInfo: Promise<any>;
  private readonly currentProfilePath: string;
  public readonly taskManager: AbstractLeafTaskManager = new SequencialLeafTaskManager();
  private readonly leafInterface: LeafInterface = new LeafInterface();
  private watchedLeafFiles: string[] = [];
  private lastProfileName: string | undefined;
  private lastLeafEnv: any | undefined;

  private constructor() {
    super();
    this.leafPath = this.executeInWsShell(`which leaf`);
    this.leafInfo = this.leafInterface.send(LEAF_INTERFACE_COMMANDS.INFO);
    this.currentProfilePath = join(this.getLeafWorkspaceDirectory(), 'leaf-data', 'current');
    this.leafInfo.then((info: any) => this.startWatchingLeafFiles(info));
  }

  private startWatchingLeafFiles(info: any) {
    //leaf files to watch initialized below
    this.watchedLeafFiles = [join(this.getLeafWorkspaceDirectory(), 'leaf-workspace.json'), join(info.configFolder, 'config.json')];
    this.watchLeafState();
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

  public async getLeafPath(): Promise<string> {
    return this.leafPath;
  }

  public async getLeafInfo(): Promise<any> {
    return this.leafInfo;
  }

  public getLeafWorkspaceDirectory(): string {
    if (workspace.rootPath) {
      return workspace.rootPath;
    }
    throw new Error('workspace.rootPath is undefined');
  }

  public getCurrentProfileName(): string {
    this.lastProfileName = readlinkSync(this.currentProfilePath);
    return this.lastProfileName;
  }

  public async requestInstalledPackages(): Promise<any> {
    return this.leafInterface.send(LEAF_INTERFACE_COMMANDS.INSTALLED_PACKAGES);
  }

  public async requestAvailablePackages(): Promise<any> {
    return this.leafInterface.send(LEAF_INTERFACE_COMMANDS.AVAILABLE_PACKAGES);
  }

  public async requestMasterPackages(): Promise<any> {
    let out: { [key: string]: any } = {};
    let ap = await this.requestAvailablePackages();
    for (let packId in ap) {
      let pack = ap[packId];
      if (pack.info.master) {
        out[packId] = pack;
        out[packId].installed = false;
      }
    }
    let ip = await this.requestInstalledPackages();
    for (let packId in ip) {
      let pack = ip[packId];
      if (pack.info.master) {
        out[packId] = pack;
        out[packId].installed = true;
      }
    }
    return out;
  }

  public async requestRemotes(): Promise<any> {
    return this.leafInterface.send(LEAF_INTERFACE_COMMANDS.REMOTES);
  }

  public async requestProfiles(): Promise<any[]> {
    let info = await this.leafInterface.send(LEAF_INTERFACE_COMMANDS.WORKSPACE_INFO);
    let out: any[] = { ...info.profiles };
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
    return this.leafInterface.send(LEAF_INTERFACE_COMMANDS.RESOLVE_VAR);
  }

  public async getEnvValue(envvar: string, env?: any): Promise<string | undefined> {
    return env ? env[envvar] : await this.getEnvVars().then(envVariables => envVariables[envvar]);
  }

  public setEnvValue(envar: string, value: string, scope: string = LEAF_ENV_SCOPE.profile) {
    let command = `leaf env ${scope} --set ${envar}=\'${value}\'`;
    return this.taskManager.executeAsTask(LEAF_TASKS.setEnv, command);
  }

  public async addRemote(alias: string, url: string): Promise<void> {
    return this.taskManager.executeAsTask(`Add remote ${alias} (${url})`, `leaf remote add --insecure ${alias} ${url}`);
  }

  public async removeRemote(...alias: string[]): Promise<void> {
    return this.taskManager.executeAsTask(`Remove remote ${alias}`, `leaf remote remove ${alias.join(' ')}`);
  }

  private async watchLeafState() {
    this.lastLeafEnv = await this.getEnvVars();
    this.watchedLeafFiles.forEach(file => {
      let path = require('path');
      let fsWait: any = false;
      let directory = path.dirname(file);
      let watchedFilename = path.basename(file);
      let fsWatcher = watch(directory);
      const onLeafFileChange: (eventType: string, filename: string | Buffer) => void = async (_eventType, filename) => {
        if (filename === watchedFilename) {
          // debouncing to prevent multiple event
          if (fsWait) {
            return;
          }
          fsWait = setTimeout(() => {
            fsWait = false;
          }, 100);
          let currentProfileName = this.getCurrentProfileName();
          if (this.lastProfileName !== currentProfileName) {
            this.lastProfileName = currentProfileName;
            this.emit(LEAF_EVENT.profileChanged, currentProfileName);
          }
          else {
            let currentLeafEnv: any = await this.getEnvVars();
            //check if env has changed
            if (JSON.stringify(currentLeafEnv) !== JSON.stringify(this.lastLeafEnv)) {
              this.emit(LEAF_EVENT.envChanged, await this.getEnvVars());
              this.lastLeafEnv = currentLeafEnv;
            }
          }
        }
      };
      fsWatcher.addListener("change", onLeafFileChange);
    });
  }

  public async dispose() {
    let path = require('path');
    this.watchedLeafFiles.forEach(file => {
      unwatchFile(path.dirname(file));
    });
    this.taskManager.dispose();
  }
}

