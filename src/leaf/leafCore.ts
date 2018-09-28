'use strict';

import { execFileSync, execSync } from "child_process";
import { workspace } from "vscode";

export const LEAF_COMMANDS = {
  version: "--version",
  shell: "shell"
};

/**
 * LeafManager is responsible for the leaf lifecycle.
 */
export class LeafManager {
  private static instance: LeafManager;

  private leafPath: string | undefined;
  private leafWorkspaceDirectory: string | undefined;
  private constructor() {
  }

  static getInstance(): LeafManager {
    LeafManager.instance = LeafManager.instance || new LeafManager();
    return LeafManager.instance;
  }

  public getLeafBinPath(): string | undefined {
    if (this.leafPath === undefined) {
      try {
        this.leafPath = execSync("which leaf").toString().trim();
      } catch {
        this.leafPath = undefined;
      }
    }
    return this.leafPath;
  }

  public getLeafVersion(leafPath?: string): string | undefined {
    let leafExecutable: string | undefined = leafPath || this.getLeafBinPath();
    if (leafExecutable) {
      return execFileSync(leafExecutable, [
        LEAF_COMMANDS.version
      ]).toString();
    }
    return undefined;
  }

  public isLeafInstalled(): boolean {
    try {
      this.getLeafVersion();
      return true;
    } catch (err) {
      {
        console.log(err);
      }
    }
    return false;
  }

  public getCwd(): string | undefined {
    return workspace.rootPath;
  }

  public getLeafWorkspaceDirectory(cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.leafWorkspaceDirectory) {
        resolve(this.leafWorkspaceDirectory);
      } else {
        var command = `leaf shell -c 'echo $LEAF_WORKSPACE'`;
        const options = {
          encoding: 'utf8',
          timeout: 0,
          cwd: cwd ? cwd : this.getCwd()
        };
        var childp = require('child_process');
        childp.exec(`${command}`, options, (error: string, stdout: string, stderr: string) => {
          if (stderr) {
            reject(stderr);
          } else if (error) {
            reject(error);
          } else {
            let leafWorkspace = stdout.trim().length === 0 ? undefined : stdout.trim();
            resolve(leafWorkspace);
          }
        });
      }
    });
  }
}