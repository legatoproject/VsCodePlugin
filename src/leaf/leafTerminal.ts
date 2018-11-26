'use strict';

import { Terminal, window } from "vscode";
import { LeafManager, LEAF_COMMANDS, LEAF_EVENT } from './leafCore';
import { LEAF_IDS } from '../identifiers';
import { CommandRegister, ACTION_LABELS } from '../uiUtils';

const LEAF_SHELL_LABEL = `Leaf shell`;

/**
 * Leaf Terminal
 * Used to create "create leaf shell" commands
 */
export class LeafTerminalManager extends CommandRegister {

  private leafTerminal: Terminal | undefined;
  private terminalCreated = false;

  public constructor() {
    super();

    // Subscribe to leaf events
    let profileChangeListener = (selectedProfile: string) => this.onProfileChanged(selectedProfile);
    LeafManager.INSTANCE.addListener(LEAF_EVENT.profileChanged, profileChangeListener);
    this.disposeOnDeactivate(() => LeafManager.INSTANCE.removeListener(LEAF_EVENT.profileChanged, profileChangeListener));

    //on env change, update leaf terminal
    let envChangeListener = async (_env: any) => await this.onLeafChange();
    LeafManager.INSTANCE.addListener(LEAF_EVENT.envChanged, envChangeListener);
    this.disposeOnDeactivate(() => LeafManager.INSTANCE.removeListener(LEAF_EVENT.envChanged, envChangeListener));

    // Also, let's add leaf commands
    this.createCommand(LEAF_IDS.COMMANDS.TERMINAL.OPENLEAF, () => this.showTerminal());

    // Listen to terminal closing (by user) and launch terminal
    this.disposables.push(window.onDidCloseTerminal(this.onCloseTerminal, this));

    // Set current profile
    this.onProfileChanged(LeafManager.INSTANCE.getCurrentProfileName());
  }

  private async onLeafChange() {
    if (this.leafTerminal
      && ACTION_LABELS.APPLY === await window.showWarningMessage("Leaf environment has changed; Click to update the Leaf shell terminal.", ACTION_LABELS.CANCEL, ACTION_LABELS.APPLY)) {
      this.leafTerminal.sendText("leaf status");
    }
  }

  private async showTerminal() {
    this.terminalCreated = true;
    if (!this.leafTerminal) {
      this.leafTerminal = await this.newLeafShellTerminal();
    }
    this.leafTerminal.show();
  }

  private onCloseTerminal(closedTerminal: Terminal): void {
    if (closedTerminal.name === LEAF_SHELL_LABEL) {
      closedTerminal.dispose();
      this.leafTerminal = undefined;
    }
  }

  private async newLeafShellTerminal(args?: string[]) {
    console.log(`Create Leaf shell named \'${LEAF_SHELL_LABEL}\'`);
    let leafBinPath = await LeafManager.INSTANCE.getLeafPath();
    return window.createTerminal(LEAF_SHELL_LABEL, leafBinPath, [LEAF_COMMANDS.shell]);
  }

  private onProfileChanged(selectedProfile: string) {
    if (!this.terminalCreated) {
      window.showInformationMessage(`Preparing Leaf shell based on ${selectedProfile}`);
      this.showTerminal();
    } else {
      this.onLeafChange();
    }
  }
}