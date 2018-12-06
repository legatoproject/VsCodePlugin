'use strict';

import { StatusBarAlignment, StatusBarItem, Terminal, window } from "vscode";
import { LeafManager, LEAF_EVENT } from "../leaf/core";
import { LEGATO_ENV } from "../legato/core";
import { CommandRegister } from '../utils';
import { LEGATO_IDS } from '../identifiers';

const TARGET_SHELL_LABEL = `Remote shell`;

export class TargetUiManager extends CommandRegister {
  private remoteTerminal: Terminal | undefined;
  private targetStatusbar: StatusBarItem;

  public constructor() {
    super();

    // Status bar
    this.targetStatusbar = window.createStatusBarItem(StatusBarAlignment.Left, 5);
    this.toDispose(this.targetStatusbar); // Dispose status bar on deactivate
    this.targetStatusbar.text = "<Unknown>";
    this.targetStatusbar.tooltip = "Legato device IP address";
    this.targetStatusbar.command = LEGATO_IDS.COMMANDS.TM.SET_DEVICE_IP;
    this.targetStatusbar.show();

    // Listen to env changes
    LeafManager.getInstance().addListener(
      LEAF_EVENT.leafEnvVarChanged,
      (oldEnvVar, newEnvVar) => this.onEnvVarsChange(oldEnvVar, newEnvVar),
      this);

    // Create commands
    this.createCommand(LEGATO_IDS.COMMANDS.TM.SHOW_TERMINAL, () => this.showRemoteTerminal());
    this.createCommand(LEGATO_IDS.COMMANDS.TM.SET_DEVICE_IP, () => this.askForNewIP());

    // Show DEST_IP on start
    this.setInitialState();
  }

  /**
   * Async initialisation
   */
  private async setInitialState() {
    this.onEnvVarsChange(undefined, await LeafManager.getInstance().getEnvVars());
  }

  private async onEnvVarsChange(oldEnvVars?: any, newEnvVars?: any) {
    let legatoDeviceIpChange = newEnvVars ? newEnvVars[LEGATO_ENV.DEST_IP] : undefined;
    if (legatoDeviceIpChange) {
      this.updateIPStatusBar(legatoDeviceIpChange);
    }
  }

  private async showRemoteTerminal() {
    if (!this.remoteTerminal) {
      this.remoteTerminal = window.createTerminal({
        name: TARGET_SHELL_LABEL,
        shellPath: "/bin/sh",
        shellArgs: ["-c", "ssh root@$DEST_IP"],
        cwd: LeafManager.getInstance().getLeafWorkspaceDirectory(),
        env: await LeafManager.getInstance().getEnvVars()
      });
      window.onDidCloseTerminal((closedTerminal: Terminal) => {
        if (closedTerminal.name === TARGET_SHELL_LABEL) {
          closedTerminal.dispose();
          this.remoteTerminal = undefined;
        }
      }, this);
    }
    this.remoteTerminal.show();
  }

  private async askForNewIP() {
    let ip = await LeafManager.getInstance().getEnvValue(LEGATO_ENV.DEST_IP);
    let newIP = await window.showInputBox({
      prompt: "Please set the Legato device IP address",
      placeHolder: ip
    });
    if (newIP) {
      this.targetStatusbar.text = newIP;
      LeafManager.getInstance().setEnvValue(LEGATO_ENV.DEST_IP, newIP);
    }
  }

  private async updateIPStatusBar(this: any, ip: string | undefined) {
    if (ip) {
      this.targetStatusbar.text = ip;
    }
  }
}