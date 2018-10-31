'use strict';

import { EventEmitter } from "events";
import { join } from "path";
import { workspace } from "vscode";
import { unwatchFile, watchFile, readlinkSync } from "fs";
export const LEAF_ENV = {
  LEAF_PROFILE: 'LEAF_PROFILE'
};
export const LEAF_COMMANDS = {
  shell: "shell"
};
export const LEAF_EVENT = {
  profileChanged: "profileChanged"
};


/**
 * LeafManager is responsible for the leaf lifecycle.
 */
export class LeafManager extends EventEmitter {
  private static instance: LeafManager;
  private leafPath: Promise<string>;
  private leafVersion: Promise<string>;
  private leafWorkspaceDirectory: Promise<string>;
  private currentProfilePath: Promise<string>;

  static getInstance(): LeafManager {
    LeafManager.instance = LeafManager.instance || new LeafManager();
    return LeafManager.instance;
  }

  private constructor() {
    super();
    this.leafPath = this.executeInWsShell(`which leaf`);
    this.leafVersion = this.executeInWsShell(`leaf --version`);
    this.leafWorkspaceDirectory = this.computeWorkspacePath();
    this.currentProfilePath = this.computeCurrentProfilePath();
    this.watchCurrentProfile();
  }

  private async executeInWsShell(command: string, cwd = workspace.rootPath): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      var childp = require('child_process');
      const options = {
        encoding: 'utf8',
        timeout: 0,
        cwd: cwd
      };
      childp.exec(`${command}`, options, (error: string, stdout: string, stderr: string) => {
        if (stderr) {
          reject(new Error(stderr));
        } else if (error) {
          reject(new Error(error));
        } else {
          let out = stdout.trim().length === 0 ? undefined : stdout.trim();
          resolve(out);
        }
      });
    });
  }

  private async computeWorkspacePath(): Promise<string> {
    let statusOut = await this.executeInWsShell(`leaf status -q`);
    let m = statusOut.match(/^Workspace (.*)$/);
    if (m === null || m.length !== 2) {
      throw new Error("Impossible to parse leaf output: " + statusOut);
    }
    return m[1];
  }

  private async computeCurrentProfilePath(): Promise<string> {
    return join(await this.leafWorkspaceDirectory, 'leaf-data', 'current');
  }

  private async watchCurrentProfile() {
    // 'watch' is recomanded and have better performance than 'watchfFile', but it seems that it does not work with symlinks
    watchFile(await this.currentProfilePath, async (_curr, _prev) => {
      this.emit(LEAF_EVENT.profileChanged, await this.getCurrentProfileName());
    });
  }

  public async getLeafPath(): Promise<string> {
    return this.leafPath;
  }

  public async getLeafVersion(): Promise<string> {
    return this.leafVersion;
  }

  public async getLeafWorkspaceDirectory(): Promise<string> {
    return this.leafWorkspaceDirectory;
  }

  public async getCurrentProfileName(): Promise<string> {
    return readlinkSync(await this.currentProfilePath);
  }

  public async dispose() {
    unwatchFile(await this.currentProfilePath);
  }

  public switchProfile(profile: string) {
    this.executeInWsShell(`leaf profile switch ${profile}`);
  }

  public async listProfiles(): Promise<string[]> {
    let stdout = await this.executeInWsShell(`leaf profile list -q`);
    return stdout.split('\n');
  }
}
