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

    // On profile change
    LeafManager.getInstance().addListener(LeafEvent.CurrentProfileChanged, this.onEnvVarsOrCurrentProfileChanged, this);

    // On env change
    LeafManager.getInstance().addListener(LeafEvent.EnvVarsChanged, this.onEnvVarsChange, this);
    LeafManager.getInstance().addListener(LeafEvent.EnvVarsChanged, this.onEnvVarsOrCurrentProfileChanged, this);

    // Also, let's add leaf commands
    this.createCommand(Commands.LeafTerminalOpenLeaf, this.showTerminal);

    // Listen to terminal closing (by user) and launch terminal
    this.toDispose(window.onDidCloseTerminal(this.onCloseTerminal, this));

    // Set current profile
    this.onEnvVarsOrCurrentProfileChanged();
  }

  /**
   * Profile or EnvVars changed, show terminal if necessary
   */
  private async onEnvVarsOrCurrentProfileChanged() {
    if (this.terminalCreated) {
      return; // Already created
    }

    let currentProfileName = await LeafManager.getInstance().getCurrentProfileName();
    if (!currentProfileName) {
      return; // No current profile, do nothing
    }

    let enVars = await LeafManager.getInstance().getEnvVars();
    if (!enVars) {
      return; // No envars, profile out of sync, do nothing
    }

    let profiles = await LeafManager.getInstance().getProfiles();
    if (!profiles) {
      return; // No profiles, do nothing
    }

    let currentProfilePackagesList = profiles[currentProfileName].packages;
    if (!currentProfilePackagesList || currentProfilePackagesList.lenght === 0) {
      return; // No packages in current profile, do nothing
    }

    // Everything is ready, let's show terminal
    console.log(`[LeafTerminal] Profile and Env ready, show shell based on ${currentProfileName}`);
    this.showTerminal();
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
      console.log(`[LeafTerminal] Create Leaf shell named \'${LEAF_SHELL_LABEL}\'`);
      let leafBinPath = await LeafManager.getInstance().getLeafPath();
      this.leafTerminal = window.createTerminal(LEAF_SHELL_LABEL, leafBinPath, ["shell"]);
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