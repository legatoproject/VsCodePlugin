'use strict';

import { basename } from 'path';
import * as vscode from "vscode";
import { CommandId, ContextualCommandPalette } from "../commands";
import { LeafManager, LEAF_EVENT } from "../leaf/core";
import { LEGATO_ENV } from "../legato/core";
import { chooseFile, listUpdateFiles } from "../legato/files";
import { CommandRegister } from '../utils';

const TARGET_SHELL_LABEL = 'Device shell';
const LOG_SHELL_LABEL = 'Device logs';

export class TargetUiManager extends CommandRegister {

  private targetStatusbar: vscode.StatusBarItem;
  private remoteTerminal = new RemoteTerminal(TARGET_SHELL_LABEL, "/bin/sh", ["-c", "ssh root@$DEST_IP"]);
  private logTerminal = new RemoteTerminal(LOG_SHELL_LABEL, "/bin/sh", ["-c", "ssh root@$DEST_IP \"/sbin/logread -f\""]);
  private paletteOnDeviceIP: ContextualCommandPalette;

  public constructor() {
    super();

    // Status bar
    this.targetStatusbar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5);
    this.toDispose(this.targetStatusbar); // Dispose status bar on deactivate
    this.targetStatusbar.text = "<Unknown>";
    this.targetStatusbar.tooltip = "Legato Device";
    this.targetStatusbar.show();

    // Commands declaration to be used as QuickPickItem
    this.paletteOnDeviceIP = new ContextualCommandPalette(
      this.targetStatusbar,
      CommandId.DEVICE_IP_COMMAND_PALETTE,
      [
        {
          id: CommandId.SET_DEVICE_IP,
          label: "Set Device IP address...",
          callback: () => this.askForNewIP()
        },
        {
          id: CommandId.DEVICE_SHELL,
          label: 'Open Device shell',
          callback: () => this.remoteTerminal.show()
        },
        {
          id: CommandId.DEVICE_LOGS,
          label: "Open Device logs",
          callback: () => this.logTerminal.show()
        }
        ,
        {
          id: CommandId.DEVICE_INSTALL_ON,
          label: "Install app/system on device...",
          callback: (args:any[]) => this.installOnDevice(args)
        }

      ],
      'Select the command to apply on device...');
    this.paletteOnDeviceIP.register();

    // Listen to env changes
    LeafManager.getInstance().addListener(
      LEAF_EVENT.leafEnvVarChanged,
      (oldEnvVar, newEnvVar) => this.onEnvVarsChange(oldEnvVar, newEnvVar),
      this);

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
      this.targetStatusbar.text = legatoDeviceIpChange;
    }
  }

  private async askForNewIP() {
    let ip = await LeafManager.getInstance().getEnvValue(LEGATO_ENV.DEST_IP);
    let newIP = await vscode.window.showInputBox({
      prompt: "Please set the Legato device IP address",
      placeHolder: ip
    });
    if (newIP) {
      this.targetStatusbar.text = newIP;
      LeafManager.getInstance().setEnvValue(LEGATO_ENV.DEST_IP, newIP);
    }
  }

  private async installOnDevice(...selectedFile: any[]) {
    let updateFiles: vscode.Uri[] = await listUpdateFiles();
    let selectedUpdateFile = selectedFile[0] ? selectedFile[0] :  await chooseFile(updateFiles,
      {
        noFileFoundMessage: "No *.update files found in workspace.",
        quickPickPlaceHolder: "Please select an update file among ones available in the workspace..."
      });

    if (selectedUpdateFile) {
      let command = `update ${selectedUpdateFile.path}`;
      LeafManager.getInstance().taskManager.executeAsTask(`Install ${basename(selectedUpdateFile.path)} on device`, command, await LeafManager.getInstance().getEnvVars());
    }
  }

}

export class RemoteTerminal {
  private leafTerminal: vscode.Terminal | undefined;
  private terminalLabel: string;
  private shellPath: string;
  private shellArgs: string[];
  constructor(label: string, path: string, shellArgs: string[]) {
    this.terminalLabel = label;
    this.shellPath = path;
    this.shellArgs = shellArgs;

    vscode.window.onDidCloseTerminal((closedTerminal: vscode.Terminal) => {
      if (closedTerminal.name === this.terminalLabel) {
        closedTerminal.dispose();
        this.leafTerminal = undefined;
      }
    }, this);
  }

  public async show(preserveFocus?: boolean) {
    if (!this.leafTerminal) {
      this.leafTerminal = vscode.window.createTerminal({
        name: this.terminalLabel,
        shellPath: this.shellPath,
        shellArgs: this.shellArgs,
        cwd: LeafManager.getInstance().getLeafWorkspaceDirectory(),
        env: await LeafManager.getInstance().getEnvVars()
      });
    }
    this.leafTerminal.show(true);
  }
}