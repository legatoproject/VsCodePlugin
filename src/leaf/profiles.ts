'use strict';

import { window, StatusBarItem, StatusBarAlignment } from "vscode";
import { LeafManager, LeafEvent } from './core';
import { Command, View } from '../commons/identifiers';
import { ProfileQuickPickItem, ProfileTreeItem, PackageTreeItem } from './uiComponents';
import { showMultiStepQuickPick, toItems, TreeDataProvider2 } from '../commons/uiUtils';

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
    this.leafStatusbar.text = "Loading current profile...";
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
    this.setInitialState();
  }

  /**
   * Async initialisation
   */
  private async setInitialState() {
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
    let items: ProfileQuickPickItem[] = toItems(profiles, ProfileQuickPickItem);
    let result = await showMultiStepQuickPick(
      "leaf profile switch",
      undefined,
      undefined,
      "Please select the profile you want to switch to...",
      items
    );
    if (result) {
      return this.leafManager.switchProfile(result.id);
    }
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

  private async removePackage(packageItem: PackageTreeItem | undefined) {
    if (!packageItem || !packageItem.parent) {
      throw new Error('Command not available from the palette; try the Leaf Profiles view');
    }
    return this.leafManager.removePackagesFromProfile(packageItem.parent.id, packageItem.packId);
  }

  /**
   * Profile has changed, let's update status bar
   */
  private onProfileChanged(_oldProfileName: string | undefined, newProfileName: string | undefined) {
    if (this.leafStatusbar) {
      this.leafStatusbar.text = newProfileName ? newProfileName : 'No profile';
    }
  }

  protected async getRootElements(): Promise<ProfileTreeItem[]> {
    let lm = this.leafManager;
    return toItems(await lm.getProfiles(), class extends ProfileTreeItem {
      constructor(id: any, properties: any) {
        super(lm, id, properties);
      }
    });
  }
}