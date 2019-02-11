'use strict';

import * as fs from "fs";
import * as vscode from "vscode";
import * as compareVersions from 'compare-versions';
import { LeafBridgeCommands, LeafBridgeElement } from './bridge';
import { LeafIOManager, ExecKind } from './ioManager';
import { ACTION_LABELS } from '../commons/uiUtils';
import { executeInShell, EnvVars, debounce, removeDuplicates } from '../commons/utils';
import { AbstractManager } from '../commons/manager';
import { join } from 'path';
import { Command } from '../commons/identifiers';

const LEAF_MIN_VERSION = '1.6';

export const enum LeafEnvScope {
  Package = "package",
  Workspace = "workspace",
  Profile = "profile",
  User = "user"
}

export enum LeafEvent { // Events with theirs parameters
  CurrentProfileChanged = "currentProfileChanged", // oldProfileName: string | undefined, newProfileName: string | undefined
  ProfilesChanged = "leafProfilesChanged", // oldProfiles: any | undefined, newProfiles: any | undefined
  RemotesChanged = "leafRemotesChanged", // oldRemotes: any | undefined, newRemotes: any | undefined
  EnvVarsChanged = "leafEnvVarsChanged", // oldEnvVar: any | undefined, newEnvVar: any | undefined
  PackagesChanged = "leafPackagesChanged", // oldPackages: any | undefined, newPackages: any | undefined
  WorkspaceInfosChanged = "leafWorkspaceInfoChanged", // oldWSInfo: any | undefined, new WSInfo: any | undefined
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

  // Version regex
  private static readonly versionRegex: RegExp = /leaf version (.*)/;

  // Task management
  private readonly ioManager: LeafIOManager;

  // Read-only leaf data
  private readonly leafPath: string;
  private readonly leafInfo: Promise<LeafBridgeElement>;

  // Cache data from leaf bridge
  private leafWorkspaceInfo: Promise<LeafBridgeElement | undefined> = Promise.resolve(undefined);
  private leafRemotes: Promise<LeafBridgeElement | undefined> = Promise.resolve(undefined);
  private leafEnvVar: Promise<EnvVars | undefined> = Promise.resolve(undefined);
  private leafPackages: Promise<{ installedPackages: LeafBridgeElement, availablePackages: LeafBridgeElement } | undefined> = Promise.resolve(undefined);

  // leaf-data folder content watcher
  private leafDataContentWatcher: fs.FSWatcher | undefined = undefined;

  /**
   * Check leaf installation, ask user to install it then check again
   */
  public static async checkLeafInstallation(): Promise<string> {
    let leafPath = undefined;

    // Check leaf is installed
    do {
      try {
        leafPath = await executeInShell('which leaf');
        console.log(`[LeafManager] Leaf detected ${leafPath}`);
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

    // Check leaf min version
    let leafVersionOk = false;
    do {
      let versionCmd = 'leaf --version';
      let leafVersionOutput = await executeInShell(versionCmd);
      let regexResult = this.versionRegex.exec(leafVersionOutput);
      if (regexResult === null || regexResult.length < 2) {
        throw new Error(`Regex does not match '${versionCmd}' output`);
      }
      let leafVersion = regexResult[1];
      console.log(`[LeafManager] Leaf version ${leafVersion}`);
      leafVersionOk = regexResult && compareVersions(leafVersion, LEAF_MIN_VERSION) >= 0;
      if (!leafVersionOk) {
        let userChoice = await vscode.window.showErrorMessage(
          `Installed Leaf version is too old. Please upgrade to Leaf ${LEAF_MIN_VERSION} or higher and click on '${ACTION_LABELS.CHECK_AGAIN}'.`,
          ACTION_LABELS.CHECK_AGAIN,
          ACTION_LABELS.IGNORE);
        if (!userChoice || userChoice === ACTION_LABELS.IGNORE) {
          throw new Error("Leaf out of date");
        }
      }
    } while (!leafVersionOk);

    // Initialized singletion
    return leafPath;
  }

  /**
   * Initialize model infos and start watching leaf files
   */
  public constructor(leafPath: string) {
    super();

    // Get leaf path
    this.leafPath = leafPath;
    this.ioManager = this.disposables.toDispose(new LeafIOManager(this.getLeafWorkspaceDirectory()));

    // Get info node from leaf bridge
    this.leafInfo = this.requestBridgeInfo();

    // Subscribe to workspaceInfo bridge node modification to trig leaf workspace event and profiles event if necessary
    this.addListener(LeafEvent.WorkspaceInfosChanged, this.checkCurrentProfileChangeAndEmit, this, this.disposables);
    this.addListener(LeafEvent.WorkspaceInfosChanged, this.checkProfilesChangeAndEmit, this, this.disposables);
    this.addListener(LeafEvent.WorkspaceInfosChanged, this.checkIsLeafWorkspaceChangeAndEmit, this, this.disposables);

    // Create fetch command
    this.createCommand(Command.LeafPackagesFetch, this.fetchRemote);

    // Start watching leaf file and set initial values
    this.watchLeafFiles();

    // Trig first model refreshing
    this.refreshInfosFromBridge();
    this.refreshPackagesFromBridge();
  }

  /**
   * Get info node from leaf bridge. Show notification if any.
   */
  private async requestBridgeInfo(): Promise<LeafBridgeElement> {
    let info = await this.ioManager.sendToBridge(LeafBridgeCommands.Info);
    if (!info) {
      throw new Error("Communication issue with leaf bridge");
    }
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
    this.watchLeafFileByVsCodeWatcher(
      new vscode.RelativePattern(this.getLeafWorkspaceDirectory(), LEAF_FILES.DATA_FOLDER),
      this.startWatchingLeafDataFolder, // File creation callback
      undefined, // Do nothing on change (it's filtered by configuration 'files.watcherExclude' anyway)
      this.stopWatchingLeafDataFolder // File deletion callback
    );
    // If leaf-data already exist, listen to it
    if (fs.existsSync(this.getLeafWorkspaceDirectory(LEAF_FILES.DATA_FOLDER))) {
      this.startWatchingLeafDataFolder();
    }

    // Listen leaf-workspace.json (creation/deletion/change)
    this.watchLeafFileByVsCodeWatcher(
      this.getLeafWorkspaceDirectory(LEAF_FILES.WORKSPACE_FILE),
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
   * Create fs folder watcher on leaf-data
   */
  private startWatchingLeafDataFolder() {
    this.stopWatchingLeafDataFolder(); // Close previous listener if any (should not)
    let leafDataFolderPath = this.getLeafWorkspaceDirectory(LEAF_FILES.DATA_FOLDER);
    this.leafDataContentWatcher = this.watchLeafFolderByFsWatch(leafDataFolderPath, this.refreshInfosFromBridge);
  }

  /**
   * Close fs folder watcher on leaf-data
   */
  private stopWatchingLeafDataFolder() {
    if (this.leafDataContentWatcher) {
      this.leafDataContentWatcher.close();
      this.leafDataContentWatcher = undefined;
    }
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
    console.log(`[FileWatcher] Watch folder using vscode watcher '${globPattern.toString()}'`);
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
      console.log(`[FileWatcher] fs fire an event: type=${eventType} filename=${filename.toString()}`);
      callback.call(this, filename.toString());
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
      LeafEvent.WorkspaceInfosChanged,
      this.leafWorkspaceInfo,
      this.ioManager.sendToBridge(LeafBridgeCommands.WorkspaceInfo));
    this.leafEnvVar = this.compareAndTrigEvent(
      LeafEvent.EnvVarsChanged,
      this.leafEnvVar,
      this.ioManager.sendToBridge(LeafBridgeCommands.ResolveVar));
    this.leafRemotes = this.compareAndTrigEvent(
      LeafEvent.RemotesChanged,
      this.leafRemotes,
      this.ioManager.sendToBridge(LeafBridgeCommands.Remotes));
  }

  /**
   * Get packages from bridge
   * Fill installed property
   * Merge custom tags and tags
   */
  private async requestPackages(): Promise<any | undefined> {
    let packs = await this.ioManager.sendToBridge(LeafBridgeCommands.Packages);
    if (packs) {
      // Mark installed or available
      let instPacks = packs.installedPackages;
      for (let packId in instPacks) {
        instPacks[packId].installed = true;
      }
      let availPacks = packs.availablePackages;
      for (let packId in availPacks) {
        availPacks[packId].installed = false;
      }

      // Merge tags and customTags into Tags
      for (let packList of [packs.installedPackages, packs.availablePackages]) {
        for (let packId in packList) {
          let tags: string[] = packList[packId].info.tags;
          if (!tags) {
            tags = [];
          }
          let customTags = packList[packId].info.customTags;
          if (customTags) {
            tags.push(...customTags);
          }
          packList[packId].info.tags = removeDuplicates(tags); // Avoid duplicates
        }
      }
    }
    return packs;
  }

  /**
   * Called when something change in remote.json in leaf cache folder
   * Check packages change and emit event if necessary
   */
  @debounce(100) // This method call is debounced (100ms)
  private refreshPackagesFromBridge() {
    console.log("[LeafManager] Refresh packages from leaf bridge");
    this.leafPackages = this.compareAndTrigEvent(LeafEvent.PackagesChanged, this.leafPackages, this.requestPackages());
  }

  /**
   * Send request from leaf bridge and emit the correspoding event if something change
   */
  private async compareAndTrigEvent(
    event: LeafEvent,
    oldValue: Promise<any | undefined> | any | undefined,
    newValue: Promise<any | undefined> | any | undefined
  ): Promise<any | undefined> {
    if (oldValue instanceof Promise) {
      oldValue = await oldValue;
    }
    if (newValue instanceof Promise) {
      newValue = await newValue;
    }
    if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
      this.emit(event, oldValue, newValue);
    }
    return newValue;
  }

  /**
   * Call callbacks when entering/exiting leaf workspace
   * Immediatly call enable/disable from current value
   * @param onWillEnable callback called when the event return true to wait for component creation
   * @param onDidDisable callback called when the event return false after disposing components
   * @param thisArg The `this`-argument which will be used when calling the env vars provider.
   */
  public async onLeafWorkspace(
    activator: {
      onWillEnable: () => Promise<vscode.Disposable[]>,
      onDidDisable?: (components: vscode.Disposable[]) => any
    },
    thisArg?: any
  ): Promise<vscode.Disposable> {
    return this.onEvent(
      LeafEvent.onInLeafWorkspaceChange,
      this.isLeafWorkspace(await this.leafWorkspaceInfo),
      activator,
      thisArg);
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
   * filename an optional argument which will be appened to the workspace directory
   * @return current leaf workpace path
   */
  public getLeafWorkspaceDirectory(filename?: string): string {
    if (vscode.workspace.rootPath) {
      if (filename) {
        return join(vscode.workspace.rootPath, filename);
      }
      return vscode.workspace.rootPath;
    }
    throw new Error('workspace.rootPath is undefined');
  }

  public getVsCodeLeafWorkspaceFolder(): vscode.WorkspaceFolder {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
      return vscode.workspace.workspaceFolders[0];
    }
    throw new Error('There is no workspace folder');
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
   * @return current remotes node from leaf bridge
   */
  public async getRemotes(): Promise<LeafBridgeElement | undefined> {
    return this.leafRemotes;
  }

  /**
   * @return an array of profiles
   */
  public async getProfiles(): Promise<LeafBridgeElement | undefined> {
    let wsInfo = await this.leafWorkspaceInfo;
    return wsInfo ? wsInfo.profiles : undefined;
  }

  /**
   * @return available packages as a object
   */
  public async getAvailablePackages(): Promise<LeafBridgeElement | undefined> {
    let packs = await this.leafPackages;
    return packs ? packs.availablePackages : undefined;
  }

  /**
   * @return installed packages as a object
   */
  public async getInstalledPackages(): Promise<LeafBridgeElement | undefined> {
    let packs = await this.leafPackages;
    return packs ? packs.installedPackages : undefined;
  }

  /**
   * Return installed and available merged in a unique LeafBridgeElement
   */
  public async getMergedPackages(): Promise<LeafBridgeElement> {
    // Get all packages available.
    let out: { [key: string]: any } = {};
    let packs = await this.leafPackages;
    if (!packs) {
      return out;
    }
    let ap = packs.availablePackages;
    for (let packId in ap) {
      // Get available package
      let pack = ap[packId];
      // Add to out
      out[packId] = pack;
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
        this.mergeAvailableAndInstalledTags(overiddenPack, pack);
      }

      // Add to out (and maybe override an available)
      out[packId] = pack;
    }

    return out;
  }

  /**
   * Populate tags from available to corresponding install package
   */
  private mergeAvailableAndInstalledTags(fromPack: any, toPack: any) {
    if (fromPack.info.tags) {
      if (toPack.info.tags) {
        toPack.info.tags.push(...fromPack.info.tags);
        toPack.info.tags = removeDuplicates(toPack.info.tags);
      } else {
        toPack.info.tags = fromPack.info.tags;
      }
    }
  }

  /**
   * Return tags with package count
   */
  public async getTags(): Promise<{ [key: string]: number }> {
    let out: { [key: string]: number } = {};
    for (let packs of [await this.getAvailablePackages(), await this.getInstalledPackages()]) {
      if (packs) {
        for (let packId in packs) {
          for (let tag of packs[packId].info.tags) {
            tag in out ? out[tag]++ : out[tag] = 1;
          }
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
    return this.ioManager.executeProcess(ExecKind.OutputChannel, `Switching to profile ${profile}`, 'leaf', 'profile', 'switch', profile);
  }

  /**
   * Delete profile(s)
   * profile: profile(s) name(s) to delete
   */
  public async deleteProfile(...profile: string[]): Promise<void> {
    return this.ioManager.executeProcess(ExecKind.OutputChannel, `Deleting profile ${profile}`, 'leaf', 'profile', 'delete', profile.join(' '));
  }

  /**
   * Create a new profile
   * profile: the new profile name (can be undefined for default name)
   * packs: the list of packages id to add to the created profile
   */
  public async createProfile(profile?: string, ...packs: string[]): Promise<void> {
    let cmd = ['leaf', 'setup'];
    packs.forEach(id => cmd.push('-p', id));
    if (profile) {
      cmd.push(profile);
    }
    return this.ioManager.executeProcess(ExecKind.Task, `Create new profile`, ...cmd);
  }

  /**
   * Add packages to an existing profile
   * profileName: the profile to modify
   * packIds: the list of packages id to add to the profile
   * @return a void promise that can be wait until the operation is terminated
   */
  public async addPackagesToProfile(profileName: string, ...packIds: string[]): Promise<void> {
    if (packIds.length === 0) {
      throw new Error('No package to add');
    }
    let packagesArgs = ([] as string[]).concat(...packIds.map(packId => ['--add-package', packId]));
    let actionName = `Add [${packIds.join(' ')}] to profile ${profileName}`;
    if (profileName === await this.getCurrentProfileName()) {
      // Is current profile -> leaf update
      let cmdArray = ['leaf', 'update', ...packagesArgs];
      return this.ioManager.executeProcess(ExecKind.Task, actionName, ...cmdArray);
    } else {
      // Is another profile -> leaf profile config then leaf profile sync
      let cmdLine = `leaf profile config ${packagesArgs.join(' ')} ${profileName} && leaf profile sync ${profileName}`;
      return this.ioManager.executeInShell(ExecKind.OutputChannel, actionName, cmdLine);
    }
  }

  /**
   * Remove packages from an existing profile
   * profileName: the profile to modify
   * packIds: the list of packages id to remove from the profile
   * @return a void promise that can be wait until the operation is terminated
   */
  public async removePackagesFromProfile(profileName: string, ...packIds: string[]): Promise<void> {
    if (packIds.length === 0) {
      throw new Error('No package to remove');
    }
    let packagesArgs = ([] as string[]).concat(...packIds.map(packId => ['--rm-package', packId]));
    return this.ioManager.executeInShell(
      ExecKind.OutputChannel,
      `Remove[${packIds.join(' ')}]from profile ${profileName} `,
      `leaf profile config ${packagesArgs.join(' ')} ${profileName} && leaf profile sync ${profileName}`);
  }

  /**
   * Enable or disable remote
   */
  public async enableRemote(remoteId: string, enabled: boolean = true): Promise<void> {
    return this.ioManager.executeProcess(ExecKind.OutputChannel,
      `${enabled ? "Enable" : "Disable"} remote ${remoteId} `,
      'leaf', 'remote', enabled ? "enable" : "disable", remoteId);
  }

  /**
   * Fetch all remotes
   */
  public async fetchRemote(): Promise<void> {
    return this.ioManager.executeProcess(ExecKind.OutputChannel,
      "Fetch remotes",
      'leaf', 'remote', 'fetch');
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
   * Set or Unset leaf env value
   * if value is undefined, the var is unset
   */
  public setEnvValue(envar: string, value: string | undefined, scope: LeafEnvScope = LeafEnvScope.Profile) {
    let args = value ? ['--set', `${envar}=${value}`] : ['--unset', `${envar}`];
    return this.ioManager.executeProcess(ExecKind.OutputChannel, LEAF_TASKS.setEnv, 'leaf', 'env', scope, ...args);
  }

  /**
   * Add new leaf remote
   */
  public async addRemote(alias: string, url: string): Promise<void> {
    return this.ioManager.executeProcess(ExecKind.OutputChannel,
      `Add remote ${alias} (${url})`,
      'leaf', 'remote', 'add', '--insecure', alias, url);
  }

  /**
   * Remove leaf remote
   */
  public async removeRemote(...alias: string[]): Promise<void> {
    return this.ioManager.executeProcess(ExecKind.OutputChannel,
      `Remove remote ${alias}`,
      'leaf', 'remote', 'remove', alias.join(' '));
  }

  /**
   * Dispose all resources
   */
  public async dispose() {
    super.dispose();
    this.emit(LeafEvent.onInLeafWorkspaceChange, true, false);
    this.stopWatchingLeafDataFolder();
  }
}

