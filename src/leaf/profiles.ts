'use strict';

import { window, StatusBarItem, StatusBarAlignment } from "vscode";
import { LeafManager, LeafEvent } from './core';
import { Commands, Views } from '../identifiers';
import { ProfileQuickPickItem, ProfileTreeItem, PackageTreeItem } from './uiComponents';
import { showMultiStepQuickPick, toItems, TreeDataProvider2 } from '../uiUtils';

/**
 * Leaf manager.
 * Used to create "create leaf shell" and "switch profile" commands
 * Show current profile in the status bar binded to the "switch profile" command
 */
export class LeafProfileStatusBar extends TreeDataProvider2 {

  private leafStatusbar: StatusBarItem;

  public constructor() {
    super(Views.LeafProfiles);
    // So lets add status bar
    this.leafStatusbar = window.createStatusBarItem(StatusBarAlignment.Left, 11);
    this.toDispose(this.leafStatusbar);
    this.leafStatusbar.text = "Loading current profile...";
    this.leafStatusbar.tooltip = "Current Leaf profile";
    this.leafStatusbar.show();

    // Also, let's register leaf command
    this.createCommand(Commands.LeafProfileRemove, this.deleteProfile);
    this.createCommand(Commands.LeafProfilePackageRemove, this.removePackage);
    this.createCommand(Commands.LeafProfileSwitch, this.switchProfile);
    this.leafStatusbar.command = Commands.LeafProfileSwitch;

    // Subscribe to leaf events
    LeafManager.getInstance().addListener(LeafEvent.CurrentProfileChanged, this.onProfileChanged, this);
    LeafManager.getInstance().addListener(LeafEvent.ProfilesChanged, this.refresh, this);
    this.setInitialState();
  }

  /**
   * Async initialisation
   */
  private async setInitialState() {
    this.onProfileChanged(undefined, await LeafManager.getInstance().getCurrentProfileName());
  }

  /**
   * Ask user to select a profile then switch to it
   */
  private async switchProfile(): Promise<void> {
    let profiles = await LeafManager.getInstance().getProfiles();
    let items: ProfileQuickPickItem[] = toItems(profiles, ProfileQuickPickItem);
    let result = await showMultiStepQuickPick(
      "leaf profile switch",
      undefined,
      undefined,
      "Please select the profile you want to switch to...",
      items
    );
    if (result) {
      console.log(`Switch to profile: ${result.id}`);
      return LeafManager.getInstance().switchProfile(result.id);
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
      let profiles = await LeafManager.getInstance().getProfiles();
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
      console.log(`Delete profile: ${profileId}`);
      return LeafManager.getInstance().deleteProfile(profileId);
    }
  }

  private async removePackage(packageItem: PackageTreeItem | undefined) {
    if (!packageItem || !packageItem.parent) {
      throw new Error('Command not available from the palette; try the Leaf Profiles view');
    }
    if (packageItem) {
      let profileItem = packageItem.parent;
      console.log(`Remove package ${packageItem.packId} from profile: ${profileItem.id}`);
      return LeafManager.getInstance().configProfile(profileItem.id, undefined, packageItem.packId);
    }
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
    let profiles = await LeafManager.getInstance().getProfiles();
    return toItems(profiles, ProfileTreeItem);
  }
}