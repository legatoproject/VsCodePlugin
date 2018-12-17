'use strict';

import { Terminal, window } from "vscode";
import { LeafManager, LeafEvent } from './core';
import { Commands } from '../identifiers';
import { ACTION_LABELS } from '../uiUtils';
import { CommandRegister } from '../utils';

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

    // On profile change, 
    LeafManager.getInstance().addListener(LeafEvent.CurrentProfileChanged, this.onProfileChanged, this);

    // On env change, update leaf terminal
    LeafManager.getInstance().addListener(LeafEvent.EnvVarChanged, this.onEnvVarsChange, this);

    // Also, let's add leaf commands
    this.createCommand(Commands.LeafTerminalOpenLeaf, this.showTerminal);

    // Listen to terminal closing (by user) and launch terminal
    this.toDispose(window.onDidCloseTerminal(this.onCloseTerminal, this));

    // Set current profile
    this.setInitialState();
  }

  /**
   * Async initialisation
   */
  private async setInitialState() {
    this.onProfileChanged(undefined, await LeafManager.getInstance().getCurrentProfileName());
  }

  /**
   * EnVars have been modified
   */
  private async onEnvVarsChange(oldEnvVars: any | undefined, _newEnvVars: any | undefined) {
    if (this.leafTerminal && oldEnvVars && ACTION_LABELS.APPLY === await window.showWarningMessage(
      "Leaf environment has changed; Click to update the Leaf shell terminal.",
      ACTION_LABELS.CANCEL,
      ACTION_LABELS.APPLY)) {
      this.leafTerminal.show();
      this.leafTerminal.sendText("leaf status");
    }
  }

  /**
   * Create and show terminal
   */
  private async showTerminal() {
    this.terminalCreated = true;
    if (!this.leafTerminal) {
      this.leafTerminal = await this.newLeafShellTerminal();
    }
    this.leafTerminal.show();
  }

  /**
   * Dispose terminal on user close action
   */
  private onCloseTerminal(closedTerminal: Terminal): void {
    if (closedTerminal.name === LEAF_SHELL_LABEL) {
      closedTerminal.dispose();
      this.leafTerminal = undefined;
    }
  }

  /**
   * Create new terminal
   */
  private async newLeafShellTerminal(args?: string[]) {
    console.log(`Create Leaf shell named \'${LEAF_SHELL_LABEL}\'`);
    let leafBinPath = await LeafManager.getInstance().getLeafPath();
    return window.createTerminal(LEAF_SHELL_LABEL, leafBinPath, ["shell"]);
  }

  /**
   * Profile changed, show terminal if exist
   */
  private onProfileChanged(_oldProfileName: string | undefined, newProfileName: string | undefined) {
    if (newProfileName && !this.terminalCreated) {
      console.log(`Preparing Leaf shell based on ${newProfileName}`);
      this.showTerminal();
    }
  }

  /**
   * Hide and dispose temrinal if exist
   * Dispose resources
   */
  public dispose() {
    super.dispose();
    if (this.leafTerminal) {
      this.leafTerminal.hide();
      this.leafTerminal.dispose();
    }
  }
}