'use strict';

import { Terminal, window, commands, ExtensionContext, StatusBarItem, StatusBarAlignment } from "vscode";
import { LeafManager, LEAF_COMMANDS, LeafProfile, LEAF_EVENT } from './leafCore';
const EXTENSION_COMMANDS = {
  showTerminal: "leaf.openShell",
  switchProfile: "leaf.switchProfile"
};

const LEAF_SHELL_LABEL = `Leaf shell`;
export class LeafUiManager {

  private static instance: LeafUiManager;
  private leafManager: LeafManager = LeafManager.getInstance();
  private leafTerminal: Terminal | undefined;
  private leafStatusbar: StatusBarItem;
  private terminalCreated = false;

  private constructor() {
    this.leafStatusbar = window.createStatusBarItem(StatusBarAlignment.Left, 11);
    this.leafStatusbar.text = "Loading current profile...";
    this.leafStatusbar.show();
  }

  static getInstance(): LeafUiManager {
    LeafUiManager.instance = LeafUiManager.instance || new LeafUiManager();
    return LeafUiManager.instance;
  }

  public async init(context: ExtensionContext) {
    try {
      window.showInformationMessage(`Found: ${await this.leafManager.getLeafVersion()}`);
      this.leafManager.addListener(LEAF_EVENT.profileChanged, (selectedProfile: string) => this.onProfileChanged(selectedProfile));
      this.leafManager.addListener(LEAF_EVENT.leafEnvReady, (leafProfile: LeafProfile) => this.onLeafEnvReady(leafProfile));
      this.registerCommands(context);
      context.subscriptions.push(this);  // Dispose on extension/deactivate
    } catch {
      window.showErrorMessage(`Leaf not found! Please install leaf and ensure a profile is set`);
    }
  }

  private registerCommands(context: ExtensionContext) {
    context.subscriptions.push(commands.registerCommand(EXTENSION_COMMANDS.showTerminal, () => this.showTerminal(), this));
    context.subscriptions.push(commands.registerCommand(EXTENSION_COMMANDS.switchProfile, () => this.switchProfile(), this));
    this.leafStatusbar.command = EXTENSION_COMMANDS.switchProfile;
  }

  private async switchProfile() {
    let profiles = await this.leafManager.listProfiles();
    let result = await window.showQuickPick(profiles, {
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
    if (this.leafStatusbar !== undefined) {
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

  private async onLeafEnvReady(_leafProfile: LeafProfile) {
    // This stub will be used by Samuel to implement LETOOLS-530
  }

  private async showTerminal() {
    this.terminalCreated = true;
    if (!this.leafTerminal) {
      console.log(`Create Leaf shell`);
      let leafBinPath = await this.leafManager.getLeafPath();
      this.leafTerminal = window.createTerminal(LEAF_SHELL_LABEL, leafBinPath, [LEAF_COMMANDS.shell]);
      window.onDidCloseTerminal((closedTerminal: Terminal) => {
        if (closedTerminal.name === LEAF_SHELL_LABEL) {
          closedTerminal.dispose();
          this.leafTerminal = undefined;
        }
      }, this);
    }
    this.leafTerminal.show();
  }

  dispose(): void {
    this.leafStatusbar.dispose();
  }
}