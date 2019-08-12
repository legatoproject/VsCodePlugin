'use strict';

import { Terminal, window } from "vscode";
import { LeafManager } from '../api/core';
import { Command } from '../../commons/identifiers';
import { ACTION_LABELS } from '../../commons/uiUtils';
import { CommandRegister } from '../../commons/manager';
import { EnvVars } from "../../commons/utils";

/**
 * Leaf Terminal
 * Used to create "create leaf shell" commands
 */
export class LeafTerminalManager extends CommandRegister {

  private leafTerminal: Terminal | undefined;

	/**
	 * Create leaf terminal when available
	 * Listen to profile and envvar changes
	 * Create commands
	 */
  public constructor(private readonly leafManager: LeafManager) {
    super();

    // On env change
    this.leafManager.envVars
      .addListener(this.onEnvVarsChange, this);

    // Also, let's add leaf commands
    this.createCommand(Command.LeafTerminalOpenLeaf, this.showTerminal, this);

    // Listen to terminal closing (by user) and launch terminal
    this.toDispose(window.onDidCloseTerminal(this.onCloseTerminal, this));
  }

  /**
   * EnVars have been modified
   */
  private async onEnvVarsChange(newEnvVars: EnvVars, oldEnvVars: EnvVars) {
    if (this.leafTerminal && oldEnvVars && oldEnvVars !== newEnvVars && ACTION_LABELS.APPLY === await window.showWarningMessage(
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
  private showTerminal() {
    if (!this.leafTerminal) {
      let shellName = 'Leaf shell';
      console.log(`[LeafTerminal] Create Leaf shell named \'${shellName}\'`);
      this.leafTerminal = window.createTerminal(shellName, this.leafManager.leafPath, ["shell"]);
    }
    this.leafTerminal.show();
  }

  /**
   * Dispose terminal on user close action
   */
  private onCloseTerminal(closedTerminal: Terminal): void {
    if (closedTerminal === this.leafTerminal) {
      this.leafTerminal.dispose();
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
      this.leafTerminal = undefined;
    }
  }
}