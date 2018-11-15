'use strict';

import { Terminal, window, commands, ExtensionContext, StatusBarItem, StatusBarAlignment } from "vscode";
import { LeafManager, LEAF_COMMANDS, LEAF_EVENT } from './leafCore';
import { IDS } from '../identifiers';

const LEAF_SHELL_LABEL = `Leaf shell`;
export class LeafUiManager {

  private leafManager: LeafManager = LeafManager.INSTANCE;
  private leafTerminal: Terminal | undefined;
  private leafStatusbar: StatusBarItem | undefined;
  private terminalCreated = false;

  public async start(context: ExtensionContext) {
    try {
      // Check if leaf is available
      let leafVersion = await this.leafManager.getLeafVersion();
      window.showInformationMessage(`Found: ${leafVersion}`);

      // It's available !

      // So lets add status bar
      this.leafStatusbar = window.createStatusBarItem(StatusBarAlignment.Left, 11);
      context.subscriptions.push(this.leafStatusbar); // Dispose status bar on deactivate
      this.leafStatusbar.text = "Loading current profile...";
      this.leafStatusbar.show();

      // Also, let's add leaf commands
      context.subscriptions.push(commands.registerCommand(IDS.COMMANDS.TERMINAL.OPENLEAF, () => this.showTerminal(), this));
      context.subscriptions.push(commands.registerCommand(IDS.COMMANDS.PROFILE.SWITCH, () => this.switchProfile(), this));
      this.leafStatusbar.command = IDS.COMMANDS.PROFILE.SWITCH;

      // Subscribe to leaf events
      this.leafManager.addListener(LEAF_EVENT.profileChanged, (selectedProfile: string) => this.onProfileChanged(selectedProfile));

      // Set current profile
      this.onProfileChanged(this.leafManager.getCurrentProfileName());
    } catch (e) {
      window.showErrorMessage(`Leaf not found! Please install leaf and ensure a profile is set: ${e}`);
    }
  }

  private async switchProfile() {
    let profiles = await this.leafManager.listProfiles();
    let result = await window.showQuickPick(Object.keys(profiles), {
      placeHolder: 'Please select the profile you want to  switch to...'
    });
    if (result) {
      window.showInformationMessage("Switching to: " + result);
      this.leafManager.switchProfile(result);
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
    if (!this.terminalCreated) {
      window.showInformationMessage(`Preparing Leaf shell based on ${selectedProfile}`);
      this.showTerminal();
    } else if (this.leafTerminal) {
      window.showInformationMessage(`Update Leaf shell based on ${selectedProfile}`);
      this.leafTerminal.sendText("leaf status");
    }
  }

  public static async newLeafShellTerminal(labelTerminal:string, args?: string[]) {
      console.log(`Create Leaf shell named \'${labelTerminal}\'`)
      let leafBinPath = await LeafManager.INSTANCE.getLeafPath();
      let leafTerminal = window.createTerminal(LEAF_SHELL_LABEL, leafBinPath, [LEAF_COMMANDS.shell].concat(args?args:[]));
      return leafTerminal;
  }

  private async showTerminal() {
    this.terminalCreated = true;
    if (!this.leafTerminal) {
      this.leafTerminal = await LeafUiManager.newLeafShellTerminal(LEAF_SHELL_LABEL);
      window.onDidCloseTerminal((closedTerminal: Terminal) => {
        if (closedTerminal.name === LEAF_SHELL_LABEL) {
          closedTerminal.dispose();
          this.leafTerminal = undefined;
        }
      }, this);
    }
    this.leafTerminal.show();
  }
}