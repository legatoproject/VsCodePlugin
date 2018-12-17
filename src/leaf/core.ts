'use strict';

import * as fs from "fs";
import * as vscode from "vscode";
import { LeafBridge, LeafBridgeCommands } from './bridge';
import { AbstractLeafTaskManager, SequencialLeafTaskManager } from './taskManager';
import { ACTION_LABELS } from '../uiUtils';
import { executeInShell, EnvVars, AbstractManager, debounce, removeDuplicates } from '../utils';
import { join } from 'path';
import { Commands } from '../identifiers';

export const enum LeafEnvScope {
  Package = "package",
  Workspace = "workspace",
  Profile = "profile",
  User = "user"
}
export const enum LeafEvent { // Events with theirs parameters
  CurrentProfileChanged = "currentProfileChanged", // oldProfileName: string | undefined, newProfileName: string | undefined
  ProfilesChanged = "leafProfilesChanged", // oldProfiles: any | undefined, newProfiles: any | undefined
  RemotesChanged = "leafRemotesChanged", // oldRemotes: any | undefined, newRemotes: any | undefined
  EnvVarChanged = "leafEnvVarChanged", // oldEnvVar: any | undefined, newEnvVar: any | undefined
  PackagesChanged = "leafPackagesChanged", // oldPackages: any | undefined, newPackages: any | undefined
  WorkspaceInfoChanged = "leafWorkspaceInfoChanged", // oldWSInfo: any | undefined, new WSInfo: any | undefined
  onInLeafWorkspaceChange = "onInLeafWorkspaceChange" // oldIsLeafWorkspace: boolean, newIsLeafWorkspace: boolean
}
export const LEAF_TASKS = {
  setEnv: "set Leaf env"
};
const LEAF_FILES = {
  DATA_FOLDER: 'leaf-data',
  WORKSPACE_FILE: 'leaf-workspace.json',
  REMOTE_CACHE_FILE: 'remotes.json'
};

/**
 * LeafManager is responsible for the leaf lifecycle.
 */
export class LeafManager extends AbstractManager<LeafEvent> {

  // Singleton instance
  private static INSTANCE: LeafManager;

  // Task management
  public readonly taskManager: AbstractLeafTaskManager = this.disposables.toDispose(new SequencialLeafTaskManager());

  // Leaf Bridge
  private readonly leafInterface: LeafBridge = new LeafBridge();

  // Read-only leaf data
  private readonly leafPath: string;
  private readonly leafInfo: Promise<any>;

  // Cache data from leaf bridge
  private leafWorkspaceInfo: Promise<any | undefined> = Promise.resolve(undefined);
  private leafRemotes: Promise<any | undefined> = Promise.resolve(undefined);
  private leafEnvVar: Promise<EnvVars | undefined> = Promise.resolve(undefined);
  private leafPackages: Promise<any | undefined> = Promise.resolve(undefined);

  /**
   * Initialize model infos and start watching leaf files
   */
  private constructor(leafPath: string, public readonly context: vscode.ExtensionContext) {
    super();

    // Get leaf path
    this.leafPath = leafPath;

    // Get info node from leaf bridge
    this.leafInfo = this.requestBridgeInfo();

    // Subscribe to workspaceInfo bridge node modification to trig leaf workspace event and profiles event if necessary
    this.addListener(LeafEvent.WorkspaceInfoChanged, this.checkCurrentProfileChangeAndEmit, this, this.disposables);
    this.addListener(LeafEvent.WorkspaceInfoChanged, this.checkProfilesChangeAndEmit, this, this.disposables);
    this.addListener(LeafEvent.WorkspaceInfoChanged, this.checkIsLeafWorkspaceChangeAndEmit, this, this.disposables);

    // Create fetch command
    this.createCommand(Commands.LeafPackagesFetch, this.fetchRemote);

    // Start watching leaf file and set initial values
    this.watchLeafFiles();

    // Trig first model refreshing
    this.refreshInfosFromBridge();
    this.refreshPackagesFromBridge();
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
  public static async checkLeafInstalled(context: vscode.ExtensionContext) {
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
    LeafManager.INSTANCE = new LeafManager(leafPath, context);
  }

  /**
   * Get info node from leaf bridge. Show notification if any.
   */
  private async requestBridgeInfo() {
    let info = await this.leafInterface.send(LeafBridgeCommands.Info);
    console.log(`Found Leaf version ${info.version}`);
    return info;
  }

  /**
   * Called when workspaceinfo from leaf bridge change
   * Emit event if current profile change
   */
  private checkCurrentProfileChangeAndEmit(oldWorkspaceInfo: any | undefined, newWorkspaceInfo: any | undefined) {
    let oldProfileName = this.getCurrentProfileNameFrom(oldWorkspaceInfo);
    let newProfileName = this.getCurrentProfileNameFrom(newWorkspaceInfo);
    if (oldProfileName !== newProfileName) {
      this.emit(LeafEvent.CurrentProfileChanged, oldProfileName, newProfileName);
    }
  }

  /**
   * Called when workspaceinfo from leaf bridge change
   * Emit event if something change in profiles
   */
  private checkProfilesChangeAndEmit(oldWorkspaceInfo: any | undefined, newWorkspaceInfo: any | undefined) {
    let oldProfiles = oldWorkspaceInfo ? oldWorkspaceInfo.profiles : undefined;
    let newProfiles = newWorkspaceInfo ? newWorkspaceInfo.profiles : undefined;
    this.compareAndTrigEvent(LeafEvent.ProfilesChanged, oldProfiles, newProfiles);
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
      this.emit(LeafEvent.onInLeafWorkspaceChange, oldInitialized, newInitialized);
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
      () => leafDataContentWatcher = this.watchLeafFolderByFsWatch(join(this.getLeafWorkspaceDirectory(), LEAF_FILES.DATA_FOLDER), this.refreshInfosFromBridge),
      // Do nothing on change (it's filtered by configuration 'files.watcherExclude' anyway)
      undefined,
      // On leaf-data deletion, close watcher for content
      () => leafDataContentWatcher ? leafDataContentWatcher.close() : undefined
    );

    // Listen leaf-workspace.json (creation/deletion/change)
    this.watchLeafFileByVsCodeWatcher(
      join(this.getLeafWorkspaceDirectory(), LEAF_FILES.WORKSPACE_FILE),
      this.refreshInfosFromBridge, this.refreshInfosFromBridge, this.refreshInfosFromBridge);

    // Listen config folder
    let info = await this.leafInfo;
    this.watchLeafFolderByFsWatch(info.configFolder, this.refreshInfosFromBridge);

    // Listen remotes.json in leaf cache folder
    this.watchLeafFolderByFsWatch(
      info.cacheFolder,
      filename => filename === LEAF_FILES.REMOTE_CACHE_FILE ? this.refreshPackagesFromBridge() : undefined);
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
  private watchLeafFolderByFsWatch(folder: string, callback: (filename: string) => any): fs.FSWatcher {
    console.log(`[FileWatcher] Watch folder using fs '${folder}' for changes in any files}`);
    let watcher = fs.watch(folder);
    this.disposables.onDispose(() => watcher.close());
    watcher.addListener("change", (eventType: string, filename: string | Buffer) => {
      console.log(`[FileWatcher] File watcher from fs fire an event: type=${eventType} filename=${filename.toString()}`);
      callback.call(this, filename);
    });
    return watcher;
  }

  /**
   * Called when something change in leaf files
   * Check workspace change and emit event if necessary
   */
  @debounce(100) // This method call is debounced (100ms)
  private refreshInfosFromBridge() {
    console.log("[LeafManager] Refresh workspaceInfo, envars and remotes from leaf bridge");
    this.leafWorkspaceInfo = this.compareAndTrigEvent(
      LeafEvent.WorkspaceInfoChanged,
      this.leafWorkspaceInfo,
      this.leafInterface.send(LeafBridgeCommands.WorkspaceInfo));
    this.leafEnvVar = this.compareAndTrigEvent(
      LeafEvent.EnvVarChanged,
      this.leafEnvVar,
      this.leafInterface.send(LeafBridgeCommands.ResolveVar));
    this.leafRemotes = this.compareAndTrigEvent(
      LeafEvent.RemotesChanged,
      this.leafRemotes,
      this.leafInterface.send(LeafBridgeCommands.Remotes));
  }

  /**
   * Called when something change in remote.json in leaf cache folder
   * Check packages change and emit event if necessary
   */
  @debounce(100) // This method call is debounced (100ms)
  private refreshPackagesFromBridge() {
    console.log("[LeafManager] Refresh packages from leaf bridge");
    this.leafPackages = this.compareAndTrigEvent(LeafEvent.PackagesChanged, this.leafPackages, this.requestMasterPackages());
  }

  /**
   * Send request from leaf bridge and emit the correspoding event if something change
   */
  private async compareAndTrigEvent(
    event: LeafEvent,
    oldValue: Promise<any | undefined> | any | undefined,
    newValue: Promise<any | undefined> | any | undefined
  ): Promise<any> {
    if (oldValue instanceof Promise) {
      oldValue = await oldValue;
    }
    if (newValue instanceof Promise) {
      newValue = await newValue;
    }
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
      LeafEvent.onInLeafWorkspaceChange,
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
  private async requestMasterPackages(): Promise<any> {

    // Get all packages available.
    let out: { [key: string]: any } = {};
    let packs = await this.leafInterface.send(LeafBridgeCommands.Packages);
    let ap = packs.availablePackages;
    for (let packId in ap) {
      // Get available package
      let pack = ap[packId];
      // Add to out
      out[packId] = pack;
      // Mark as not installed (available)
      out[packId].installed = false;
    }

    // Get installed packages to override available packages with.
    let ip = packs.installedPackages;
    for (let packId in ip) {
      // Get installed package
      let pack = ip[packId];
      // Get available package with the same id
      let overiddenPack = out[packId];
      if (overiddenPack) {
        // Copy tags from overridden one
        this.mergeAvailableAndInstalledInfoField("tags", overiddenPack, pack);
        this.mergeAvailableAndInstalledInfoField("customTags", overiddenPack, pack);
      }

      // Mark as installed
      pack.installed = true;

      // Add to out (and maybe override an available)
      out[packId] = pack;
    }

    // Merge tags and customTags into Tags
    for (let packId in out) {
      let tags: string[] = out[packId].info.tags;
      if (!tags) {
        tags = [];
      }
      let customTags = out[packId].info.customTags;
      if (customTags) {
        tags.push(...customTags);
      }
      out[packId].info.tags = removeDuplicates(tags); // Avoid duplicates
    }

    return out;
  }

  /**
   * Populate tags from available to corresponding install package
   */
  private mergeAvailableAndInstalledInfoField(infoField: string, fromPack: any, toPack: any) {
    if (fromPack.info[infoField]) {
      if (toPack.info[infoField]) {
        toPack.info[infoField].push(...fromPack.info[infoField]);
      } else {
        toPack.info[infoField] = fromPack.info[infoField];
      }
    }
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
   * @return master available and installed packages as a object
   */
  public async getAllPackages(): Promise<any> {
    return this.leafPackages;
  }

  /**
   * Return tags with package count
   */
  public async getTags(): Promise<{ [key: string]: number }> {
    let packs = await this.leafPackages;
    let out: { [key: string]: number } = {};
    if (packs) {
      for (let packId in packs) {
        for (let tag of packs[packId].info.tags) {
          tag in out ? out[tag]++ : out[tag] = 1;
        }
      }
    }
    return out;
  }

  /**
   * Switch to another profile
   * profile: profile name to switch to
   */
  public async switchProfile(profile: string): Promise<void> {
    return this.taskManager.executeAsTask(`Switching to profile ${profile}`, `leaf profile switch ${profile}`);
  }

  /**
   * Delete profile(s)
   * profile: profile(s) name(s) to delete
   */
  public async deleteProfile(...profile: string[]): Promise<void> {
    return this.taskManager.executeAsTask(`Deleting profile ${profile}`, `leaf profile delete ${profile.join(' ')}`);
  }

  /**
   * Delete profile(s)
   * profile: profile(s) name(s) to delete
   */
  public async configProfile(profile: string, packToAdd: string | undefined, packToRemove: string | undefined): Promise<void> {
    let taskName = `Configure profile ${profile}:`;
    let leafCmd = `leaf profile config `;
    if (!packToAdd && !packToRemove) {
      throw new Error('No package to add nor remove');
    }
    if (packToAdd) {
      taskName += ` add package ${packToAdd}`;
      leafCmd += ` --add-package ${packToAdd}`;
    }
    if (packToRemove) {
      if (packToAdd) {
        taskName += " and";
      }
      taskName += ` remove package ${packToRemove}`;
      leafCmd += ` --rm-package ${packToRemove}`;
    }
    leafCmd += ` ${profile}`;
    return this.taskManager.executeAsTask(taskName, leafCmd);
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
  public setEnvValue(envar: string, value: string, scope: LeafEnvScope = LeafEnvScope.Profile) {
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
    this.emit(LeafEvent.onInLeafWorkspaceChange, true, false);
  }
}

