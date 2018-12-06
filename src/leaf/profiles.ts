'use strict';

import { window, StatusBarItem, StatusBarAlignment } from "vscode";
import { LeafManager, LEAF_EVENT } from './core';
import { LEAF_IDS } from '../identifiers';
import { ProfileQuickPickItem } from './uiComponents';
import { showMultiStepQuickPick, toItems } from '../uiUtils';
import { CommandRegister } from '../utils';

/**
 * Leaf manager.
 * Used to create "create leaf shell" and "switch profile" commands
 * Show current profile in the status bar binded to the "switch profile" command
 */
export class LeafProfileStatusBar extends CommandRegister {

  private leafStatusbar: StatusBarItem;

  public constructor() {
    super();
    // So lets add status bar
    this.leafStatusbar = window.createStatusBarItem(StatusBarAlignment.Left, 11);
    this.toDispose(this.leafStatusbar);
    this.leafStatusbar.text = "Loading current profile...";
    this.leafStatusbar.tooltip = "Current Leaf profile";
    this.leafStatusbar.show();

    // Also, let's register leaf command
    this.createCommand(LEAF_IDS.COMMANDS.PROFILE.SWITCH, () => this.switchProfile());
    this.leafStatusbar.command = LEAF_IDS.COMMANDS.PROFILE.SWITCH;

    // Subscribe to leaf events
    LeafManager.getInstance().addListener(
      LEAF_EVENT.profileChanged,
      (oldProfileName, newProfileName) => this.onProfileChanged(oldProfileName, newProfileName),
      this);
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
   * Profile has changed, let's update status bar
   */
  private onProfileChanged(oldProfileName: string | undefined, newProfileName: string | undefined) {
    if (this.leafStatusbar) {
      this.leafStatusbar.text = newProfileName ? newProfileName : 'No profile';
    }
  }
}