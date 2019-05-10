'use strict';

import * as vscode from "vscode";
import { Command } from '../../commons/identifiers';
import { CommandRegister } from '../../commons/manager';
import { ModelElement, StateModelElement } from "../../commons/model";
import { ACTION_LABELS } from '../../commons/uiUtils';
import { deepClone, executeInShell, removeDuplicates, EnvVars, LeafBridgeElement } from '../../commons/utils';
import { VersionManager } from "../../commons/version";
import { AllPackages, LeafInterface } from "./interface";
import { ExecKind, LeafProcessLauncher } from './process';
import { ResourcesManager } from "../../commons/resources";

/**
 * Lock the extension if leaf is older than that
 * Ask user to update
 */
const LEAF_MIN_VERSION = '1.9';

/**
 * Leaf scope used to set an envvar
 */
export const enum LeafEnvScope {
  Package = "package",
  Workspace = "workspace",
  Profile = "profile",
  User = "user"
}

/**
 * Used in tests
 */
export const LEAF_TASKS = {
  setEnv: "set Leaf env"
};

/**
 * Structure of returned tags with respective count
 */
export class Tags { [key: string]: number }

/**
 * LeafManager is responsible for the leaf lifecycle.
 */
export class LeafManager extends CommandRegister {

  /**
   * Leaf version regex
   */
  private static readonly versionRegex: RegExp = /leaf version (.*)/;

  /**
   * Leaf Bridge and file watcher
   */
  private readonly interface: LeafInterface;

  /**
   * Launch processes as tasks or output channel
   */
  private readonly processLauncher: LeafProcessLauncher;

  // Exposed Model
  public readonly packages = new ModelElement<AllPackages>("leaf.packages", this);
  public readonly mergedPackages = new ModelElement<LeafBridgeElement>("leaf.packages.merged", this);
  public readonly tags = new ModelElement<Tags>("leaf.packages.tags", this);
  public readonly profileName = new ModelElement<string | undefined>("leaf.profile.name", this);
  public readonly profiles = new ModelElement<LeafBridgeElement>("leaf.profile.list", this);
  public readonly workspaceReady = new StateModelElement("leaf.workspace.state", this);
  public readonly remotes = new ModelElement<LeafBridgeElement>("leaf.remotes", this);
  public readonly envVars = new ModelElement<EnvVars>("leaf.envvars", this);
  // Exposed model deleguated to interface
  public readonly outOfSync: ModelElement<boolean>;

  /**
   * Check leaf installation, ask user to install it then check again
   */
  public static async checkLeafInstallation(versionManager: VersionManager): Promise<string> {
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
      leafVersionOk = !versionManager.versionsLowerThan(leafVersion, LEAF_MIN_VERSION);
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

    return leafPath;
  }

  /**
   * Initialize model infos and start watching leaf files
   */
  public constructor(public readonly leafPath: string, resourcesManager: ResourcesManager) {
    super();
    this.interface = this.toDispose(new LeafInterface(resourcesManager));
    this.outOfSync = this.interface.outOfSync;

    // Get leaf path
    this.processLauncher = this.toDispose(new LeafProcessLauncher());

    // Subscribe to interface model to update leaf model
    this.interface.envVars
      .addDependency(this.envVars, env => env || {});
    this.interface.remotes
      .addDependency(this.remotes, rem => rem || {});
    this.interface.workspace
      .addDependency(this.profileName, this.getCurrentProfileNameFrom, this)
      .addDependency(this.profiles, w => w && w.profiles ? w.profiles : {})
      .addDependency(this.workspaceReady, this.isLeafWorkspace, this);
    this.interface.packages
      .addDependency(this.packages, this.markInstalledAndMergeCustomTags, this);
    this.packages
      .addDependency(this.mergedPackages, this.mergePackages, this)
      .addDependency(this.tags, this.listAndCountTags, this);

    // Create fetch command
    this.createCommand(Command.LeafPackagesFetch, this.fetchRemote);
  }

  /**
   * @return current profile name from the given workspaceInfo from leaf bridge
   */
  private getCurrentProfileNameFrom(newWorkspaceInfo: any | undefined): string | undefined {
    if (newWorkspaceInfo) {
      let profiles = newWorkspaceInfo.profiles;
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
   * @return true if the given info node came from a leaf workspace
   */
  private isLeafWorkspace(info: LeafBridgeElement | undefined): boolean {
    if ((info !== undefined) && 'initialized' in info) {
      return info.initialized;
    }
    return false;
  }

  /**
   * Convert packages from interface to packages exposed by this manager
   * Add property installed : boolean on each package
   * Merge custom tags with regular tags
   * @param allPAckages package node from interface
   */
  private markInstalledAndMergeCustomTags(allPAckages: AllPackages | undefined): AllPackages {
    // Let use empty object instead of undefined
    let out = allPAckages ? deepClone(allPAckages) : { installedPackages: {}, availablePackages: {} };

    // Mark installed or available
    let instPacks = out.installedPackages;
    for (let packId in instPacks) {
      instPacks[packId].installed = true;
    }
    let availPacks = out.availablePackages;
    for (let packId in availPacks) {
      availPacks[packId].installed = false;
    }

    // Merge tags and customTags into Tags
    for (let packList of [out.installedPackages, out.availablePackages]) {
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
    return out;
  }

  /**
   * Return installed and available merged in a unique LeafBridgeElement
   */
  private mergePackages(allPackages: AllPackages): LeafBridgeElement {
    let out: LeafBridgeElement = {};
    let ap = allPackages.availablePackages;
    for (let packId in ap) {
      // Get available package
      let pack = ap[packId];
      // Add to out
      out[packId] = pack;
    }

    // Get installed packages to override available packages with.
    let ip = allPackages.installedPackages;
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
  private async listAndCountTags(allPackages: AllPackages | undefined): Promise<Tags> {
    let out: Tags = {};
    if (allPackages) {
      for (let packs of [allPackages.availablePackages, allPackages.installedPackages]) {
        if (packs) {
          for (let packId in packs) {
            for (let tag of packs[packId].info.tags) {
              tag in out ? out[tag]++ : out[tag] = 1;
            }
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
    return this.processLauncher.executeProcess(
      ExecKind.OutputChannel,
      `Switching to profile ${profile}`,
      'leaf', 'profile', 'switch', profile);
  }

  /**
   * Delete profile(s)
   * profile: profile(s) name(s) to delete
   */
  public async deleteProfile(...profile: string[]): Promise<void> {
    return this.processLauncher.executeProcess(
      ExecKind.OutputChannel,
      `Deleting profile ${profile}`,
      'leaf', 'profile', 'delete', profile.join(' '));
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
    return this.processLauncher.executeProcess(ExecKind.Task, `Create new profile`, ...cmd);
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
    if (profileName === await this.profileName.get()) {
      // Is current profile -> leaf update
      let cmdArray = ['leaf', 'update', ...packagesArgs];
      return this.processLauncher.executeProcess(ExecKind.Task, actionName, ...cmdArray);
    } else {
      // Is another profile -> leaf profile config then leaf profile sync
      let cmdLine = `leaf profile config ${packagesArgs.join(' ')} ${profileName} && leaf profile sync ${profileName}`;
      return this.processLauncher.executeInShell(ExecKind.Task, actionName, cmdLine);
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
    return this.processLauncher.executeInShell(
      ExecKind.OutputChannel,
      `Remove[${packIds.join(' ')}]from profile ${profileName} `,
      `leaf profile config ${packagesArgs.join(' ')} ${profileName} && leaf profile sync ${profileName}`);
  }

  /**
   * Synchronise current profile as a task
   * @returns the corresponding promise
   */
  public async syncCurrentProfile(): Promise<void> {
    return this.processLauncher.executeProcess(
      ExecKind.Task,
      "Sync current profile",
      'leaf', 'profile', 'sync');
  }

  /**
   * Enable or disable remote
   */
  public async enableRemote(remoteId: string, enabled: boolean = true): Promise<void> {
    return this.processLauncher.executeProcess(
      ExecKind.OutputChannel,
      `${enabled ? "Enable" : "Disable"} remote ${remoteId} `,
      'leaf', 'remote', enabled ? "enable" : "disable", remoteId);
  }

  /**
   * Fetch all remotes
   */
  public async fetchRemote(): Promise<void> {
    return this.processLauncher.executeProcess(
      ExecKind.OutputChannel,
      "Fetch remotes",
      'leaf', 'remote', 'fetch');
  }

  /**
   * Set or Unset leaf env value
   * if value is undefined, the var is unset
   */
  public setEnvValue(envar: string, value: string | undefined, scope: LeafEnvScope = LeafEnvScope.Profile): Promise<void> {
    let args = value ? ['--set', `${envar}=${value}`] : ['--unset', `${envar}`];
    return this.processLauncher.executeProcess(
      ExecKind.OutputChannel,
      LEAF_TASKS.setEnv,
      'leaf', 'env', scope, ...args);
  }

  /**
   * Add new leaf remote
   */
  public async addRemote(alias: string, url: string): Promise<void> {
    return this.processLauncher.executeProcess(
      ExecKind.OutputChannel,
      `Add remote ${alias} (${url})`,
      'leaf', 'remote', 'add', '--insecure', alias, url);
  }

  /**
   * Remove leaf remote
   */
  public async removeRemote(...alias: string[]): Promise<void> {
    return this.processLauncher.executeProcess(
      ExecKind.OutputChannel,
      `Remove remote ${alias}`,
      'leaf', 'remote', 'remove', alias.join(' '));
  }
}

