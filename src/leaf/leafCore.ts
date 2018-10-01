'use strict';

import { execFileSync, execSync } from "child_process";
import { EventEmitter } from "events";
import { join } from "path";
import { workspace } from "vscode";
import { unwatchFile, watchFile, readlink } from "fs";
export const LEAF_ENV = {
  LEAF_PROFILE: 'LEAF_PROFILE'
};
export const LEAF_COMMANDS = {
  version: "--version",
  shell: "shell"
};

/**
 * LeafManager is responsible for the leaf lifecycle.
 */
export class LeafManager extends EventEmitter {
  private static instance:LeafManager;
  private currentProfile: LeafProfile | undefined;
  private leafPath:string|undefined;
  private leafWorkspaceDirectory: string | undefined;
  private constructor() {
    super();
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
    /**
   * @event leafEnvReady event triggered to inform that the envionnement has been sourced from
   * a new leaf profile.
   */
  public prepareLeafEnv() {
    this.getLeafWorkspaceDirectory()
      .then(path => {
        this.leafWorkspaceDirectory = path;
        this.sourceLeafEnv(path)
            .then(leafProfile => {
              this.emit('leafEnvReady', leafProfile);
          }).catch((reason) => console.log(`Leaf workspace not found! - reason:${reason}`)); }
        )
      .catch((reason) => {
        console.log(`It was impossible to source from leaf env. Reason: ${reason}`);
      });
  }

  public sourceLeafEnv(cwd:string ) {
      return new Promise<LeafProfile>((resolve, reject) => {
        let command = `cd ${cwd} && eval \`leaf env print -q\` && env`;
        var childp = require('child_process');
        console.log(`Leaf workspace initialized to: ${cwd}`);
        const dotenv = require('dotenv');
        childp.exec(`${command}`, (error:string, stdout:string, stderr:string) => {
          if( error ) {
            console.log(`ERROR:${error}`);
            reject(error);
          }
          if( stderr ) {
            console.log(`stderr:${stderr}`);
            reject(stderr);
          }
          const config = dotenv.parse(Buffer.from(stdout));
          this.currentProfile = new LeafProfile(config);
          resolve(this.currentProfile);
        });
      });
  }

  public getCwd(): string|undefined {
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

    public getCurrentProfile():LeafProfile | undefined {
      return this.currentProfile;
    }

    public watchCurrentProfile() {
      this.getLeafWorkspaceDirectory().then( (leafWorkspace:string) =>
        {
          let currentProfilePath = LeafProfile.getCurrentProfileSymlink(leafWorkspace);
          watchFile(currentProfilePath, (curr, prev) => {
            readlink(currentProfilePath, (error, target)=> {
                this.emit('profileChanged', target);
            });
          });          
      });
    }
  
    public stopWatchCurrentProfile() {
      if(this.leafWorkspaceDirectory ) {
        unwatchFile(this.leafWorkspaceDirectory);
      }
    }
  }
  
  interface LeafEnv {
    [key: string]: string;
  }

  export class LeafProfile {
    public name : string;
    public env : LeafEnv;
    constructor(env : LeafEnv){
      this.env = env;
      this.name = this.getEnvValue(LEAF_ENV.LEAF_PROFILE);
    }
  
    public hasEnvVar(envVar:string): boolean {
      return this.listEnvVars().indexOf(envVar)!==-1;
    }
  
    public listEnvVars(): string[] {
      return Object.keys(this.env);
    }
    public getEnvValue(envVar:string):string {
      return this.env[envVar].toString();
    }
  
    public static getCurrentProfileSymlink(leafWorkspace:string):string {
      return join(leafWorkspace, 'leaf-data','current');
    }
}