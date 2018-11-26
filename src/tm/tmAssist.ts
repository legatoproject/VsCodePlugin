'use strict';

import { StatusBarAlignment, StatusBarItem, Terminal, window } from "vscode";
import { LeafManager, LEAF_EVENT } from "../leaf/leafCore";
import { LEGATO_ENV } from "../legato/legatoCore";
import { CommandRegister } from '../uiUtils';
import { LEGATO_IDS } from '../identifiers';

const TARGET_SHELL_LABEL = `Remote shell`;

export class TargetUiManager extends CommandRegister {
  private remoteTerminal: Terminal | undefined;
  private targetStatusbar: StatusBarItem;

  public constructor() {
    super();

    // Status bar
    this.targetStatusbar = window.createStatusBarItem(StatusBarAlignment.Left, 5);
    this.disposables.push(this.targetStatusbar); // Dispose status bar on deactivate
    this.targetStatusbar.text = "<Unknown>";
    this.targetStatusbar.tooltip = "Legato device IP address";
    this.targetStatusbar.command = LEGATO_IDS.COMMANDS.TM.SET_DEVICE_IP;
    this.targetStatusbar.show();

    // Listen to profile changes
    const profileListener = (_selectedProfile: string) =>
      LeafManager.INSTANCE.getEnvValue(LEGATO_ENV.DEST_IP).then((ip: string | undefined) => this.updateIPStatusBar(ip));
    LeafManager.INSTANCE.addListener(LEAF_EVENT.profileChanged, profileListener);
    this.disposeOnDeactivate(() => LeafManager.INSTANCE.removeListener(LEAF_EVENT.profileChanged, profileListener));

    // Listen to env changes
    const envListener = async (env: any) => {
      await this.onEnvChanged(env);
    };
    LeafManager.INSTANCE.addListener(LEAF_EVENT.envChanged, envListener);
    this.disposeOnDeactivate(() => LeafManager.INSTANCE.removeListener(LEAF_EVENT.envChanged, envListener));

    // Read DEST_IP on start
    LeafManager.INSTANCE.getEnvValue(LEGATO_ENV.DEST_IP).then(ip => this.updateIPStatusBar(ip));

    // Create commands
    this.createCommand(LEGATO_IDS.COMMANDS.TM.SHOW_TERMINAL, () => this.showRemoteTerminal());
    this.createCommand(LEGATO_IDS.COMMANDS.TM.SET_DEVICE_IP, () => this.askForNewIP());
  }

  private async onEnvChanged(env: any) {
    let legatoDeviceIpChange = await LeafManager.INSTANCE.getEnvValue(LEGATO_ENV.DEST_IP, env);
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
        cwd: LeafManager.INSTANCE.getLeafWorkspaceDirectory(),
        env: await LeafManager.INSTANCE.getEnvVars()
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
    let ip = await LeafManager.INSTANCE.getEnvValue(LEGATO_ENV.DEST_IP);
    let newIP = await window.showInputBox({
      prompt: "Please set the Legato device IP address",
      placeHolder: ip
    });
    if (newIP) {
      this.targetStatusbar.text = newIP;
      LeafManager.INSTANCE.setEnvValue(LEGATO_ENV.DEST_IP, newIP);
    }
  }

  private async updateIPStatusBar(this: any, ip: string | undefined) {
    if (ip) {
      this.targetStatusbar.text = ip;
    }
  }
}