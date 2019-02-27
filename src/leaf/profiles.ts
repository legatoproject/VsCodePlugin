'use strict';

import { window, StatusBarItem, StatusBarAlignment } from "vscode";
import { LeafManager, LeafEvent } from './core';
import { Command, View } from '../commons/identifiers';
import { ProfileQuickPickItem, ProfileTreeItem, PackageTreeItem } from './uiComponents';
import { showMultiStepQuickPick, toItems, TreeDataProvider2, QuickPickItem2 } from '../commons/uiUtils';

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

  private leafStatusbar: StatusBarItem;

  /**
	 * Listen to profile and envvar changes
   * Create commands and status bar
   */
  public constructor(private readonly leafManager: LeafManager) {
    super(View.LeafProfiles);
    // So lets add status bar
    this.leafStatusbar = window.createStatusBarItem(StatusBarAlignment.Left, 11);
    this.toDispose(this.leafStatusbar);
    this.leafStatusbar.text = `${WARNING_ICON} Loading current profile...`;
    this.leafStatusbar.tooltip = "Current Leaf profile";
    this.leafStatusbar.show();

    // Also, let's register leaf command
    this.createCommand(Command.LeafProfileRemove, this.deleteProfile);
    this.createCommand(Command.LeafProfilePackageRemove, this.removePackage);
    this.createCommand(Command.LeafProfileSwitch, this.switchProfile);
    this.leafStatusbar.command = Command.LeafProfileSwitch;

    // Subscribe to leaf events
    this.leafManager.addListener(LeafEvent.CurrentProfileChanged, this.onProfileChanged, this);
    this.leafManager.addListener(LeafEvent.ProfilesChanged, this.refresh, this);
    this.leafManager.addListener(LeafEvent.onProfileOutOfSync, this.refreshStatusbar, this);

    // Set initial state
    this.refreshStatusbar();
  }

  /**
   * Refresh the profile name in the status bar
   */
  private async refreshStatusbar() {
    try {
      await this.onProfileChanged(undefined, await this.leafManager.getCurrentProfileName());
    } catch (reason) {
      // Catch and log because this method is never awaited
      console.error(reason);
    }
  }

  /**
   * Ask user to select a profile then switch to it
   */
  private async switchProfile(): Promise<void> {
    let profiles = await this.leafManager.getProfiles();
    let items: QuickPickItem2[] = toItems(profiles, ProfileQuickPickItem);
    let syncProfileItem: QuickPickItem2 = {
      id: "cmd",
      properties: undefined,
      label: "Fix profile",
      description: "Execute 'leaf profile sync'",
      compareTo: () => 0
    };
    if (await this.leafManager.isOutOfSync()) {
      items.push(syncProfileItem);
    }
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
      let profiles = await this.leafManager.getProfiles();
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
   * Profile has changed, let's update status bar
   */
  private async onProfileChanged(_oldProfileName: string | undefined, newProfileName: string | undefined) {
    if (this.leafStatusbar) {
      let state = newProfileName && !(await this.leafManager.isOutOfSync());
      let stateIcon = state ? OK_ICON : WARNING_ICON;
      let profile = newProfileName || 'No profile';
      this.leafStatusbar.text = `${stateIcon} ${profile}`;
    }
  }

  /**
   * @returns the list of items that will be shown at the root of the tree view
   */
  protected async getRootElements(): Promise<ProfileTreeItem[]> {
    let lm = this.leafManager;
    return toItems(await lm.getProfiles(), class extends ProfileTreeItem {
      constructor(id: any, properties: any) {
        super(lm, id, properties);
      }
    });
  }
}