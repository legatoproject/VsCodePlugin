'use strict';

import { window, commands, StatusBarItem, StatusBarAlignment } from "vscode";
import { LeafManager, LEAF_EVENT } from './leafCore';
import { LEAF_IDS } from '../identifiers';
import { ProfileQuickPickItem } from './leafUiComponents';
import { showMultiStepQuickPick, toItems, CommandRegister } from '../uiUtils';

/**
 * Leaf manager.
 * Used to create "create leaf shell" and "switch profile" commands
 * Show current profile in the status bar binded to the "switch profile" command
 */
export class LeafProfileStatusBar extends CommandRegister {

  private leafStatusbar: StatusBarItem | undefined;

  public constructor() {
    super();
    // So lets add status bar
    this.leafStatusbar = window.createStatusBarItem(StatusBarAlignment.Left, 11);
    this.disposables.push(this.leafStatusbar); // Dispose status bar on deactivate
    this.leafStatusbar.text = "Loading current profile...";
    this.leafStatusbar.tooltip = "Current Leaf profile";
    this.leafStatusbar.show();

    // Also, let's register leaf command
    this.disposables.push(commands.registerCommand(LEAF_IDS.COMMANDS.PROFILE.SWITCH, () => this.switchProfile(), this));
    this.leafStatusbar.command = LEAF_IDS.COMMANDS.PROFILE.SWITCH;

    // Subscribe to leaf events
    let profileChangeListener = (selectedProfile: string) => this.onProfileChanged(selectedProfile);
    LeafManager.INSTANCE.addListener(LEAF_EVENT.profileChanged, profileChangeListener);
    this.disposeOnDeactivate(() => LeafManager.INSTANCE.removeListener(LEAF_EVENT.profileChanged, profileChangeListener));

    // Set current profile
    this.onProfileChanged(LeafManager.INSTANCE.getCurrentProfileName());
  }

  private async switchProfile(): Promise<void> {
    let profiles = await LeafManager.INSTANCE.requestProfiles();
    let items: ProfileQuickPickItem[] = toItems(profiles, ProfileQuickPickItem);
    let result = await showMultiStepQuickPick(
      "leaf profile switch",
      undefined,
      undefined,
      "Please select the profile you want to switch to...",
      items
    )
    if (result) {
      window.showInformationMessage(`Switch to profile: ${result.id}`);
      return LeafManager.INSTANCE.switchProfile(result.id);
    }
  }

  private onProfileChanged(selectedProfile: string) {
    if (selectedProfile === undefined) {
      window.showErrorMessage(`No current profile is set. Please start by this step.`);
    } else {
      window.showInformationMessage(`Profile ${selectedProfile} selected`);
    }
    if (this.leafStatusbar) {
      this.leafStatusbar.text = selectedProfile ? selectedProfile : 'No profile';
    }
  }
}