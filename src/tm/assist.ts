'use strict';

import { basename } from 'path';
import * as vscode from "vscode";
import { ContextualCommandPalette } from "./commands";
import { LeafManager, LeafEvent } from "../leaf/core";
import { LEGATO_ENV } from "../legato/core";
import { chooseFile, listUpdateFiles, listImageFiles } from "../legato/files";
import { CommandRegister } from '../utils';
import { Commands } from '../identifiers';
import { ACTION_LABELS } from '../uiUtils';

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
      Commands.LegatoTmCommandPalette,
      [
        {
          id: Commands.LegatoTmSetIp,
          label: "Set Device IP address...",
          callback: () => this.askForNewIP()
        },
        {
          id: Commands.LegatoTmShell,
          label: 'Open Device shell',
          callback: () => this.remoteTerminal.show()
        },
        {
          id: Commands.LegatoTmLogs,
          label: "Open Device logs",
          callback: () => this.logTerminal.show()
        },
        {
          id: Commands.LegatoTmInstallOn,
          label: "Install app/system on device...",
          callback: (args: any[]) => this.installOnDevice(args)
        },
        {
          id: Commands.LegatoTmDeviceFlashImage,
          label: "Flash image to device...",
          callback: (args: any[]) => this.flashImage(false, args)
        },
        {
          id: Commands.LegatoTmFlashImageRecovery,
          label: "Flash image to device (recovery mode)...",
          callback: (args: any[]) => this.flashImage(true, args)
        },
        {
          id: Commands.LegatoTmResetUserPartition,
          label: "Reset user partition (recovery mode)",
          callback: () => this.resetUserPartition()
        }
      ],
      'Select the command to apply on device...');
    this.paletteOnDeviceIP.register();
    this.toDispose(this.paletteOnDeviceIP);

    // Listen to env changes
    LeafManager.getInstance().addListener(LeafEvent.EnvVarsChanged, this.onEnvVarsChange, this);

    // Show DEST_IP on start
    this.setInitialState();
  }

  /**
   * Async initialisation
   */
  private async setInitialState() {
    this.onEnvVarsChange(undefined, await LeafManager.getInstance().getEnvVars());
  }

  private async onEnvVarsChange(_oldEnvVar: any | undefined, newEnvVar: any | undefined) {
    let legatoDeviceIpChange = newEnvVar ? newEnvVar[LEGATO_ENV.DEST_IP] : undefined;
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
    let selectedUpdateFile = selectedFile && selectedFile[0] ? selectedFile[0] : await chooseFile(updateFiles,
      {
        noFileFoundMessage: "No *.update files found in workspace.",
        quickPickPlaceHolder: "Please select an update file among ones available in the workspace..."
      });

    if (selectedUpdateFile) {
      let command = `update ${selectedUpdateFile.path}`;
      LeafManager.getInstance().taskManager.executeAsTask(`Install ${basename(selectedUpdateFile.path)}`, command, await LeafManager.getInstance().getEnvVars());
    }
  }

  private async flashImage(recovery: boolean, ...selectedFile: any[]) {
    let imageFiles: vscode.Uri[] = await listImageFiles();
    let selectedUpdateFile = selectedFile && selectedFile[0] ? selectedFile[0] : await chooseFile(imageFiles,
      {
        noFileFoundMessage: "Neither *.cwe nor .spk files found in workspace.",
        quickPickPlaceHolder: "Please select either .cwe or .spk file among ones available in the workspace..."
      });

    if (selectedUpdateFile) {
      let command = recovery ? `swiflash -m $LEGATO_TARGET -i ${selectedUpdateFile.path}` : `fwupdate download ${selectedUpdateFile.path}`;
      LeafManager.getInstance().taskManager.executeAsTask(`${recovery ? "[Recovery]" : ""} Flash ${basename(selectedUpdateFile.path)}`, command, await LeafManager.getInstance().getEnvVars());
    }
  }

  private resetUserPartition() {
    this.askUserToEraseUserPartition().then(async (confirmed: any) => {
      if (confirmed) {
        let command = "swiflash -m $LEGATO_TARGET -r";
        LeafManager.getInstance().taskManager.executeAsTask(`[Recovery] Reset the user partition`, command, await LeafManager.getInstance().getEnvVars());
      }
    });
  }

  private async askUserToEraseUserPartition(): Promise<boolean> {
    return ACTION_LABELS.OK === await vscode.window.showWarningMessage(
      "This will restore the device file system by erasing all user files.",
      ACTION_LABELS.CANCEL,
      ACTION_LABELS.OK);
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