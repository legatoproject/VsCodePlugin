'use strict';

import { window, StatusBarItem, StatusBarAlignment, commands } from 'vscode';
import { LeafManager } from '../api/core';
import { Command, View } from '../../commons/identifiers';
import { ProfileQuickPickItem, ProfileTreeItem, PackageTreeItem } from './uiComponents';
import { showMultiStepQuickPick, toItems, TreeDataProvider2, QuickPickItem2, TreeItem2, createActionAsQuickPickItem } from '../../commons/uiUtils';

// The icons used in status bar
// Must be taken from the [octicon](https://octicons.github.com) icon set.
const OK_ICON = '$(check)';
const WARNING_ICON = '$(alert)';

/**
 * Leaf manager.
 * Used to create "create leaf shell" and "switch profile" commands
 * Show current profile in the status bar binded to the "switch profile" command
 */
export class LeafProfileStatusBar extends TreeDataProvider2 {

  /**
   * The vscode status bar
   */
  private statusbar: StatusBarItem;

  /**
	 * Listen profiles model
   * Create commands and status bar
   */
  public constructor(private readonly leafManager: LeafManager) {
    super(View.LeafProfiles);

    // Create statusbar
    this.statusbar = window.createStatusBarItem(StatusBarAlignment.Left, 11);
    this.toDispose(this.statusbar);
    this.statusbar.text = `${WARNING_ICON} Loading current profile...`;
    this.statusbar.tooltip = "Current Leaf profile";
    this.statusbar.show();

    // Also, let's register leaf command
    this.createCommand(Command.LeafProfileRemove, this.deleteProfile, this);
    this.createCommand(Command.LeafProfilePackageRemove, this.removePackage, this);
    this.createCommand(Command.LeafProfilePackageUpgrade, this.upgradePackage, this);
    this.createCommand(Command.LeafProfileSwitch, this.switchProfile, this);
    this.statusbar.command = Command.LeafProfileSwitch;

    // Subscribe to leaf events
    this.leafManager.profileName.addListener(this.refreshStatusbar, this);
    this.leafManager.outOfSync.addListener(this.refreshStatusbar, this);
    this.leafManager.profiles.addListener(this.refresh, this);
  }

  /**
   * Refresh the profile name in the status bar
   */
  private async refreshStatusbar() {
    try {
      if (this.statusbar) {
        let newProfileName = await this.leafManager.profileName.get();
        let state = newProfileName && !(await this.leafManager.outOfSync.get());
        let stateIcon = state ? OK_ICON : WARNING_ICON;
        let profile = newProfileName || 'No profile';
        this.statusbar.text = `${stateIcon} ${profile}`;
        this.statusbar.tooltip = `Current Leaf profile ${state ? "(sync)" : "(not sync)"}`;
      }
    } catch (reason) {
      // Catch and log because this method is never awaited
      console.error(reason);
    }
  }

  /**
   * Ask user to select a profile then switch to it
   */
  private async switchProfile(): Promise<void> {
    let profiles = await this.leafManager.profiles.get();
    let items: QuickPickItem2[] = toItems(profiles, ProfileQuickPickItem);

    // Create sync profile command item
    let syncProfileItem = createActionAsQuickPickItem(
      "Fix profile",
      "Execute 'leaf profile sync'");
    if (await this.leafManager.outOfSync.get()) {
      items.push(syncProfileItem);
    }

    // Create show leaf terminal command item
    let showLeafTerminal = createActionAsQuickPickItem(
      "Open leaf Shell",
      "Bring to top if already exist");
    items.push(showLeafTerminal);

    // Swow quickpick
    let result = await showMultiStepQuickPick(
      "leaf profile switch",
      undefined,
      undefined,
      "Please select the profile you want to switch to...",
      items
    );

    // User want to sync current profile
    if (result === syncProfileItem) {
      return this.leafManager.syncCurrentProfile();
    }

    // User want to show Leaf terminal
    if (result === showLeafTerminal) {
      return commands.executeCommand(Command.LeafTerminalOpenLeaf);
    }

    // User picked a profile to switch to
    result = result as ProfileQuickPickItem;
    return this.leafManager.switchProfile(result.id);
  }

	/**
	 * Remove filter from filter list
	 */
  private async deleteProfile(item: ProfileTreeItem | undefined) {
    let profileId: string | undefined = undefined;
    if (item) {
      profileId = item.id;
    } else {
      let profiles = await this.leafManager.profiles.get();
      let result = await showMultiStepQuickPick(
        "leaf profile switch",
        undefined,
        undefined,
        "Please select the profile you want to delete",
        toItems(profiles, ProfileQuickPickItem)
      );
      if (result) {
        profileId = result.id;
      }
    }
    if (profileId) {
      return this.leafManager.deleteProfile(profileId);
    }
  }

  /**
   * Remove a package from its profile
   * @param packageItem the package item selected in tree view
   */
  private async removePackage(packageItem: PackageTreeItem | undefined) {
    if (!packageItem || !packageItem.parent) {
      throw new Error('Command not available from the palette; try the Leaf Profiles view');
    }
    return this.leafManager.removePackagesFromProfile(packageItem.parent.id, packageItem.packId);
  }

  /**
  * Upgrade a package thath corrends to a SDK from its profile
  * @param packageItem the SDK item selected in tree view
  */
  private async upgradePackage(packageItem: PackageTreeItem | undefined) {
    if (!packageItem || !packageItem.parent) {
      throw new Error('Command not available from the palette; try the Leaf Profiles view');
    }
    return this.leafManager.upgradePackageFromProfile(packageItem.parent.id, packageItem.packName);
  }

  /**
   * @returns the list of items that will be shown at the root of the tree view
   */
  protected async getRootElements(): Promise<ProfileTreeItem[]> {
    let lm = this.leafManager;
    return toItems(await lm.profiles.get(), class extends ProfileTreeItem {
      constructor(id: any, parent: TreeItem2 | undefined, properties: any) {
        super(lm, id, parent, properties);
      }
    });
  }
}