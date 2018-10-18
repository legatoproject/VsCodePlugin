'use strict';

import { EventEmitter } from "events";
import { join } from "path";
import { workspace, ExtensionContext } from "vscode";
import { unwatchFile, watchFile, readlinkSync } from "fs";
export const LEAF_ENV = {
  LEAF_PROFILE: 'LEAF_PROFILE'
};
export const LEAF_COMMANDS = {
  shell: "shell"
};
export const LEAF_EVENT = {
  leafEnvReady: "leafEnvReady",
  profileChanged: "profileChanged"
};


/**
 * LeafManager is responsible for the leaf lifecycle.
 */
export class LeafManager extends EventEmitter {
  private static instance: LeafManager;
  private currentProfile: LeafProfile | undefined;
  private leafPath: Promise<string> = LeafManager.executeInWsShell(`which leaf`);
  private leafVersion: Promise<string> = LeafManager.executeInWsShell(`leaf --version`);
  private leafWorkspaceDirectory: Promise<string> = LeafManager.computeWorkspacePath();

  private constructor() {
    super();
    this.watchCurrentProfile();
  }

  static getInstance(): LeafManager {
    LeafManager.instance = LeafManager.instance || new LeafManager();
    return LeafManager.instance;
  }

  public init(context: ExtensionContext) {
    context.subscriptions.push(this);  // Dispose on extension/deactivate
  }

  private static async computeWorkspacePath(): Promise<string> {
    let statusOut = await LeafManager.executeInWsShell(`leaf status -q`);
    let m = statusOut.match(/^Workspace (.*)$/);
    if (m === null || m.length !== 2) {
      throw new Error("Impossible to parse leaf output: " + statusOut);
    }
    return m[1];
  }

  private static async executeInWsShell(command: string, cwd = workspace.rootPath): Promise<string> {
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

  public async getLeafPath(): Promise<string> {
    return this.leafPath;
  }

  public async getLeafVersion(): Promise<string> {
    return this.leafVersion;
  }

  /**
   * @event leafEnvReady event triggered to inform that the envionnement has been sourced from
   * a new leaf profile.
   */
  private async prepareLeafEnv() {
    try {
      this.currentProfile = await this.sourceLeafEnv();
      this.emit(LEAF_EVENT.leafEnvReady, this.currentProfile);
    } catch (e) {
      console.log(`Leaf workspace not found! - reason:${e}`);
    }
  }

  private async sourceLeafEnv() {
    let leafWs = await this.leafWorkspaceDirectory;
    let stdout = await LeafManager.executeInWsShell('eval \`leaf env print -q\` && env', leafWs);
    console.log(`Leaf workspace initialized to: ${leafWs}`);
    const dotenv = require('dotenv');
    const config = dotenv.parse(Buffer.from(stdout));
    return new LeafProfile(config);
  }

  public getCurrentProfile(): LeafProfile | undefined {
    return this.currentProfile;
  }

  public async watchCurrentProfile() {
    let currentProfilePath = LeafProfile.getCurrentProfileSymlink(await this.leafWorkspaceDirectory);
    // 'watch' is recomanded and have better performance than 'watchfFile', but it seems that it does not work with symlinks
    watchFile(currentProfilePath, (_curr, _prev) => this.readCurrentProfile(currentProfilePath));
    // Read current state
    this.readCurrentProfile(currentProfilePath);
  }

  private readCurrentProfile(currentProfilePath: string) {
    let target = readlinkSync(currentProfilePath);
    this.emit(LEAF_EVENT.profileChanged, target);
    this.prepareLeafEnv();
  }

  public async dispose() {
    if (this.leafWorkspaceDirectory) {
      unwatchFile(await this.leafWorkspaceDirectory);
    }
  }

  public switchProfile(profile: string) {
    LeafManager.executeInWsShell(`leaf profile switch ${profile}`);
  }

  public async listProfiles(): Promise<string[]> {
    let stdout = await LeafManager.executeInWsShell(`leaf profile list -q`);
    return stdout.split('\n');
  }
}

interface LeafEnv {
  [key: string]: string;
}

export class LeafProfile {
  public name: string;
  public env: LeafEnv;
  constructor(env: LeafEnv) {
    this.env = env;
    this.name = this.getEnvValue(LEAF_ENV.LEAF_PROFILE);
  }

  public hasEnvVar(envVar: string): boolean {
    return this.listEnvVars().indexOf(envVar) !== -1;
  }

  public listEnvVars(): string[] {
    return Object.keys(this.env);
  }
  public getEnvValue(envVar: string): string {
    return this.env[envVar].toString();
  }

  public static getCurrentProfileSymlink(leafWorkspace: string): string {
    return join(leafWorkspace, 'leaf-data', 'current');
  }
}