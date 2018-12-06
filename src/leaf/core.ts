'use strict';

import * as fs from "fs";
import * as vscode from "vscode";
import { LeafInterface, LEAF_INTERFACE_COMMANDS } from './bridge';
import { AbstractLeafTaskManager, SequencialLeafTaskManager } from './taskManager';
import { ACTION_LABELS } from '../uiUtils';
import { executeInShell, EnvVars, AbstractManager, debounce } from '../utils';
import { join } from 'path';

export const LEAF_ENV_SCOPE = {
  package: "package",
  workspace: "workspace",
  profile: "profile",
  user: "user"
};
export const LEAF_EVENT = { // Events with theirs parameters
  profileChanged: "profileChanged", // oldProfileName: string | undefined, newProfileName: string | undefined
  leafRemotesChanged: "leafRemotesChanged", // oldRemotes: any | undefined, newRemotes: any | undefined
  leafEnvVarChanged: "leafEnvVarChanged", // oldEnvVar: any | undefined, newEnvVar: any | undefined
  leafWorkspaceInfoChanged: "leafWorkspaceInfoChanged", // oldWSInfo: any | undefined, new WSInfo: any | undefined
  onInLeafWorkspaceChange: "onInLeafWorkspaceChange" // oldIsLeafWorkspace: boolean, newIsLeafWorkspace: boolean
};
export const LEAF_TASKS = {
  setEnv: "set Leaf env"
};
const LEAF_FILES = {
  DATA_FOLDER: 'leaf-data',
  WORKSPACE_FILE: 'leaf-workspace.json'
};

/**
 * LeafManager is responsible for the leaf lifecycle.
 */
export class LeafManager extends AbstractManager {

  // Singleton instance
  private static INSTANCE: LeafManager;

  // Task management
  private readonly taskManager: AbstractLeafTaskManager = this.disposables.toDispose(new SequencialLeafTaskManager());

  // Leaf Bridge
  private readonly leafInterface: LeafInterface = new LeafInterface();

  // Read-only leaf data
  private readonly leafPath: string;
  private readonly leafInfo: Promise<any>;

  // Cache data from leaf bridge
  private leafWorkspaceInfo: Promise<any | undefined> = Promise.resolve(undefined);
  private leafRemotes: Promise<any | undefined> = Promise.resolve(undefined);
  private leafEnvVar: Promise<EnvVars | undefined> = Promise.resolve(undefined);

  /**
   * Initialize model infos and start watching leaf files
   */
  private constructor(leafPath: string) {
    super();

    // Get leaf path
    this.leafPath = leafPath;

    // Get info node from leaf bridge
    this.leafInfo = this.requestBridgeInfo();

    // Subscribe to workspaceInfo bridge node modification to trig leaf workspace event and profiles event if necessary
    this.addListener(LEAF_EVENT.leafWorkspaceInfoChanged, this.checkCurrentProfileChangeAndEmit, this.disposables);
    this.addListener(LEAF_EVENT.leafWorkspaceInfoChanged, this.checkIsLeafWorkspaceChangeAndEmit, this.disposables);

    // Start watching leaf file and set initial values
    this.watchLeafFiles();
    this.onLeafFileChange(); // Trig first model refreshing
  }

  /**
   * Return singleton's instance
   * you must call and await LeafManager.checkLeafInstalled before calling this method
   */
  public static getInstance(): LeafManager {
    if (!LeafManager.INSTANCE) {
      throw new Error("createInstance must be called and awaited before calling this singleton's instance");
    }
    return LeafManager.INSTANCE;
  }

  /**
   * Check leaf installation, ask user to install it then check again
   */
  public static async checkLeafInstalled() {
    let leafPath = undefined;
    do {
      try {
        leafPath = await executeInShell(`which leaf`);
      } catch {
        let userChoice = await vscode.window.showErrorMessage(
          `Leaf is not installed. Please install Leaf and click on '${ACTION_LABELS.CHECK_AGAIN}'.`,
          ACTION_LABELS.CHECK_AGAIN,
          ACTION_LABELS.IGNORE);
        if (!userChoice || userChoice === ACTION_LABELS.IGNORE) {
          throw new Error("Leaf is not installed");
        }
      }
    } while (!leafPath);

    // Initialized singletion
    LeafManager.INSTANCE = new LeafManager(leafPath);
  }

  /**
   * Get info node from leaf bridge. Show notification if any.
   */
  private async requestBridgeInfo() {
    let info = await this.leafInterface.send(LEAF_INTERFACE_COMMANDS.INFO);
    console.log(`Found Leaf version ${info.version}`);
    return info;
  }

  /**
   * Called when workspaceinfo from leaf bridge change
   */
  private checkCurrentProfileChangeAndEmit(oldWorkspaceInfo: any | undefined, newWorkspaceInfo: any | undefined) {
    // Emit profile change if any
    let oldProfileName = this.getCurrentProfileNameFrom(oldWorkspaceInfo);
    let newProfileName = this.getCurrentProfileNameFrom(newWorkspaceInfo);
    if (oldProfileName !== newProfileName) {
      this.emit(LEAF_EVENT.profileChanged, oldProfileName, newProfileName);
    }
  }

  /**
   * Called when envars from leaf bridge change.
   * Check if workspace became leaf or not
   * Emit event if it change
   */
  private checkIsLeafWorkspaceChangeAndEmit(oldWorkspaceInfo: any | undefined, newWorkspaceInfo: any | undefined) {
    let oldInitialized = this.isLeafWorkspace(oldWorkspaceInfo);
    let newInitialized = this.isLeafWorkspace(newWorkspaceInfo);
    if (!oldWorkspaceInfo || oldInitialized !== newInitialized) {
      this.emit(LEAF_EVENT.onInLeafWorkspaceChange, oldInitialized, newInitialized);
    }
  }

  /**
   * Watch all Leaf files
   */
  private async watchLeafFiles() {
    // Listen to leaf-data folder creation/deletion
    let leafDataContentWatcher: fs.FSWatcher | undefined = undefined;
    this.watchLeafFileByVsCodeWatcher(
      new vscode.RelativePattern(this.getLeafWorkspaceDirectory(), LEAF_FILES.DATA_FOLDER),
      // On leaf-data creation, create watcher for content
      () => leafDataContentWatcher = this.watchLeafFolderByFsWatch(join(this.getLeafWorkspaceDirectory(), LEAF_FILES.DATA_FOLDER), this.onLeafFileChange),
      // Do nothing on change (it's filtered by configuration 'files.watcherExclude'  anyway)
      undefined,
      // On leaf-data deletion, close watcher for content
      () => leafDataContentWatcher ? leafDataContentWatcher.close() : undefined
    );

    // Listen leaf-workspace.json (creation/deletion/change)
    this.watchLeafFileByVsCodeWatcher(
      join(this.getLeafWorkspaceDirectory(), LEAF_FILES.WORKSPACE_FILE),
      this.onLeafFileChange, this.onLeafFileChange, this.onLeafFileChange);

    // Listen config folder
    this.watchLeafFolderByFsWatch(
      (await this.leafInfo).configFolder,
      this.onLeafFileChange);
  }

  /**
  * Watch one Leaf file
  * globPattern: The file to watch
  * WARNING: This watcher cannot listen a folder outside the workspace.
  * WARNING: This watcher cannot listen a folder touch.
  */
  private watchLeafFileByVsCodeWatcher(
    globPattern: vscode.GlobPattern,
    onDidCreateCb: (() => any) | undefined,
    onDidChangeCb: (() => any) | undefined,
    onDidDeleteCb: (() => any) | undefined
  ): vscode.FileSystemWatcher {
    console.log(`[FileWatcher] Watch folder using vscode watcher '${globPattern}'`);
    let watcher: vscode.FileSystemWatcher = vscode.workspace.createFileSystemWatcher(globPattern);
    this.disposables.toDispose(watcher);
    if (onDidCreateCb) {
      watcher.onDidCreate((uri: vscode.Uri) => {
        console.log(`[FileWatcher] Created File: uri=${uri.fsPath}`);
        onDidCreateCb.apply(this);
      }, this);
    }
    if (onDidChangeCb) {
      watcher.onDidChange((uri: vscode.Uri) => {
        console.log(`[FileWatcher] Changed File: uri=${uri.fsPath}`);
        onDidChangeCb.apply(this);
      }, this);
    }
    if (onDidDeleteCb) {
      watcher.onDidDelete((uri: vscode.Uri) => {
        console.log(`[FileWatcher] Deleted File: uri=${uri.fsPath}`);
        onDidDeleteCb.apply(this);
      }, this);
    }
    return watcher;
  }

  /**
   * Watch one Leaf folder
   * folder: The folder to watch
   * WARNING: This watcher is closed forever when the folder is deleted.
   */
  private watchLeafFolderByFsWatch(folder: string, callback: () => any): fs.FSWatcher {
    console.log(`[FileWatcher] Watch folder using fs '${folder}' for changes in any files}`);
    let watcher = fs.watch(folder);
    this.disposables.onDispose(() => watcher.close());
    watcher.addListener("change", (eventType: string, filename: string | Buffer) => {
      console.log(`[FileWatcher] File watcher from fs fire an event: type=${eventType} filename=${filename.toString()}`);
      callback.apply(this);
    });
    return watcher;
  }

  /**
   * Called when something change in leaf files
   * Check workspace change and emit event if necessary
   */
  @debounce(100) // This method call is debounced (100ms)
  private onLeafFileChange() {
    console.log("[LeafManager] Refresh infos from leaf bridge");
    this.leafWorkspaceInfo = this.compareAndTrigEvent(LEAF_EVENT.leafWorkspaceInfoChanged, LEAF_INTERFACE_COMMANDS.WORKSPACE_INFO, this.leafWorkspaceInfo);
    this.leafEnvVar = this.compareAndTrigEvent(LEAF_EVENT.leafEnvVarChanged, LEAF_INTERFACE_COMMANDS.RESOLVE_VAR, this.leafEnvVar);
    this.leafRemotes = this.compareAndTrigEvent(LEAF_EVENT.leafRemotesChanged, LEAF_INTERFACE_COMMANDS.REMOTES, this.leafRemotes);
  }

  /**
   * Send request from leaf bridge and emit the correspoding event if something change
   */
  private async compareAndTrigEvent(event: string, cmd: string, currentPromise: Promise<any | undefined>): Promise<any> {
    let oldValue = await currentPromise;
    let newValue = await this.leafInterface.send(cmd);
    if (!oldValue || JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
      this.emit(event, oldValue, newValue);
    }
    return newValue;
  }

  /**
   * Instanciate or dispose Disposable elements on workspace becoming leaf or not
   * Immediatly instanciate if already in a leaf workspace
   */
  public createAndDisposeOnLeafWorkspace(...newComponents: { new(): vscode.Disposable }[]) {
    this.createAndDisposeOn(
      LEAF_EVENT.onInLeafWorkspaceChange,
      async () => this.isLeafWorkspace(await this.leafWorkspaceInfo),
      ...newComponents);
  }

  /**
   * @return true if the given info node came from a leaf workspace
   */
  private isLeafWorkspace(info: any | undefined): boolean {
    if ((info !== undefined) && 'initialized' in info) {
      return info.initialized;
    }
    return false;
  }

  /**
   * @return current leaf path
   */
  public async getLeafPath(): Promise<string | undefined> {
    return this.leafPath;
  }

  /**
   * @return current leaf workpace path
   */
  public getLeafWorkspaceDirectory(): string {
    if (vscode.workspace.rootPath) {
      return vscode.workspace.rootPath;
    }
    throw new Error('workspace.rootPath is undefined');
  }

  /**
   * @return current profile name
   */
  public async getCurrentProfileName(): Promise<string | undefined> {
    return this.getCurrentProfileNameFrom(await this.leafWorkspaceInfo);
  }

  /**
   * @return current profile name from the given workspaceInfo from leaf bridge
   */
  private getCurrentProfileNameFrom(workspaceInfo: any | undefined): string | undefined {
    if (workspaceInfo) {
      let profiles = workspaceInfo.profiles;
      if (profiles) {
        for (let profileName in profiles) {
          if (profiles[profileName].current) {
            return profileName;
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Return master packages (available and installed)
   * Set installed property on returned object
   */
  public async requestMasterPackages(): Promise<any> {
    let out: { [key: string]: any } = {};
    let ap = await this.leafInterface.send(LEAF_INTERFACE_COMMANDS.AVAILABLE_PACKAGES);
    for (let packId in ap) {
      let pack = ap[packId];
      if (pack.info.master) {
        out[packId] = pack;
        out[packId].installed = false;
      }
    }
    let ip = await this.leafInterface.send(LEAF_INTERFACE_COMMANDS.INSTALLED_PACKAGES);
    for (let packId in ip) {
      let pack = ip[packId];
      if (pack.info.master) {
        out[packId] = pack;
        out[packId].installed = true;
      }
    }
    return out;
  }

  /**
   * @return current remotes node from leaf bridge
   */
  public async getRemotes(): Promise<any> {
    return this.leafRemotes;
  }

  /**
   * @return an array of profiles
   */
  public async getProfiles(): Promise<any> {
    let wsInfo = await this.leafWorkspaceInfo;
    return wsInfo ? wsInfo.profiles : undefined;
  }

  /**
   * Switch to another profile
   * profile: profile name to switch to
   */
  public async switchProfile(profile: string): Promise<void> {
    return this.taskManager.executeAsTask(`Switching to profile ${profile}`, `leaf profile switch ${profile}`);
  }

  /**
   * Create a new profile
   * profile: the new profile name (can be undefined for default name)
   * packs: the list of packages id to add to the created profile
   */
  public async createProfile(profile?: string, ...packs: string[]): Promise<void> {
    let cmd = `leaf setup`;
    let packageArgs = packs.map(id => `-p ${id}`).join(' ');
    if (packageArgs) {
      cmd += ` ${packageArgs}`;
    }
    if (profile) {
      cmd += ` ${profile}`;
    }
    return this.taskManager.executeAsTask(`Create new profile`, cmd);
  }

  /**
   * Add packages to an existing profile
   * packs: the list of packages id to add to the created profile
   * profileId: the target profile name
   * profileProperties: the target profile properties (from leaf bridge)
   */
  public async addPackagesToProfile(packs: string[], profileId: string, profileProperties?: any): Promise<void> {
    let cmd: string;
    let packageArgs = packs.map(id => `-p ${id}`).join(' ');
    if (profileProperties && profileProperties.current) {
      cmd = `leaf update ${packageArgs}`;
    } else {
      cmd = `leaf profile config ${packageArgs} ${profileId} && leaf profile sync ${profileId}`;
    }
    return this.taskManager.executeAsTask(`Add [${packs.join(' ')}] to profile ${profileId}`, cmd);
  }

  /**
   * Enable or disable remote
   */
  public async enableRemote(remoteId: string, enabled: boolean = true): Promise<void> {
    return this.taskManager.executeAsTask(`${enabled ? "Enable" : "Disable"} remote ${remoteId}`, `leaf remote ${enabled ? "enable" : "disable"} ${remoteId}`);
  }

  /**
   * Fetch all remotes
   */
  public async fetchRemote(): Promise<void> {
    return this.taskManager.executeAsTask("Fetch remotes", "leaf remote fetch");
  }

  /**
   * @return current env vars from leaf bridge
   */
  public async getEnvVars(): Promise<EnvVars | undefined> {
    return this.leafEnvVar;
  }

  /**
   * @return specified current env vars from leaf bridge
   */
  public async getEnvValue(envvar: string): Promise<string | undefined> {
    let env = await this.leafEnvVar;
    if (env) {
      return env[envvar];
    }
    return undefined;
  }

  /**
   * Set leaf env value
   */
  public setEnvValue(envar: string, value: string, scope: string = LEAF_ENV_SCOPE.profile) {
    let command = `leaf env ${scope} --set ${envar}=\'${value}\'`;
    return this.taskManager.executeAsTask(LEAF_TASKS.setEnv, command);
  }

  /**
   * Add new leaf remote
   */
  public async addRemote(alias: string, url: string): Promise<void> {
    return this.taskManager.executeAsTask(`Add remote ${alias} (${url})`, `leaf remote add --insecure ${alias} ${url}`);
  }

  /**
   * Remove leaf remote
   */
  public async removeRemote(...alias: string[]): Promise<void> {
    return this.taskManager.executeAsTask(`Remove remote ${alias}`, `leaf remote remove ${alias.join(' ')}`);
  }

  /**
   * Dispose all resources
   */
  public async dispose() {
    super.dispose();
    this.emit(LEAF_EVENT.onInLeafWorkspaceChange, true, false);
  }
}

