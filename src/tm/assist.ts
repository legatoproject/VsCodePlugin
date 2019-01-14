'use strict';

import { basename } from 'path';
import * as vscode from "vscode";
import { ContextualCommandPalette } from "./commands";
import { LeafManager, LeafEvent } from "../leaf/core";
import { LEGATO_ENV } from "../legato/core";
import { chooseFile, listUpdateFiles, listImageFiles, FileChooserMessage } from "../legato/files";
import { CommandRegister } from '../commons/utils';
import { ACTION_LABELS } from '../commons/uiUtils';
import { Command, TaskDefinitionType } from '../commons/identifiers';
import { TaskProcessLauncher } from '../commons/process';

const TARGET_SHELL_LABEL = 'Device shell';
const LOG_SHELL_LABEL = 'Device logs';

export class TargetUiManager extends CommandRegister {

  private targetStatusbar: vscode.StatusBarItem;
  private remoteTerminal = new RemoteTerminal(TARGET_SHELL_LABEL, "/bin/sh", ["-c", "ssh root@$DEST_IP"]);
  private logTerminal = new RemoteTerminal(LOG_SHELL_LABEL, "/bin/sh", ["-c", "ssh root@$DEST_IP \"/sbin/logread -f\""]);
  private paletteOnDeviceIP: ContextualCommandPalette;
  private legatoTaskProcessLauncher: TaskProcessLauncher = this.toDispose(new TaskProcessLauncher(
    TaskDefinitionType.LegatoTm,
    LeafManager.getInstance().getLeafWorkspaceDirectory(),
    undefined, // No scheduler
    LeafManager.getInstance().getEnvVars,
    LeafManager.getInstance()));

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
      Command.LegatoTmCommandPalette,
      [
        {
          id: Command.LegatoTmSetIp,
          label: "Set Device IP address...",
          callback: this.askForNewIP,
          thisArg: this
        },
        {
          id: Command.LegatoTmShell,
          label: 'Open Device shell',
          callback: this.remoteTerminal.show,
          thisArg: this.remoteTerminal
        },
        {
          id: Command.LegatoTmLogs,
          label: "Open Device logs",
          callback: this.logTerminal.show,
          thisArg: this.logTerminal
        },
        {
          id: Command.LegatoTmInstallOn,
          label: "Install app/system on device...",
          callback: this.installOnDevice,
          thisArg: this
        },
        {
          id: Command.LegatoTmDeviceFlashImage,
          label: "Flash image to device...",
          callback: this.flashImage,
          thisArg: this
        },
        {
          id: Command.LegatoTmFlashImageRecovery,
          label: "Flash image to device (recovery mode)...",
          callback: this.flashImageRecovery,
          thisArg: this
        },
        {
          id: Command.LegatoTmResetUserPartition,
          label: "Reset user partition (recovery mode)",
          callback: this.resetUserPartition,
          thisArg: this
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

  private async installOnDevice(selectedFile?: vscode.Uri, selectedFiles?: vscode.Uri[]) {
    let selectedUpdateFile = await this.getSelectedFiles(selectedFile, selectedFiles, listUpdateFiles, {
      noFileFoundMessage: "No *.update files found in workspace.",
      quickPickPlaceHolder: "Please select an update file among ones available in the workspace..."
    });
    if (selectedUpdateFile) {
      this.legatoTaskProcessLauncher.executeProcess(
        `Install ${basename(selectedUpdateFile.path)}`,
        'update', selectedUpdateFile.path);
    }
  }

  private async flashImage(selectedFile?: vscode.Uri, selectedFiles?: vscode.Uri[]) {
    let selectedUpdateFile = await this.getSelectedDefFiles(selectedFile, selectedFiles);
    if (selectedUpdateFile) {
      let name = `Flash ${basename(selectedUpdateFile.path)}`;
      this.legatoTaskProcessLauncher.executeProcess(name, 'fwupdate', 'download', selectedUpdateFile.path);
    }
  }

  private async flashImageRecovery(selectedFile?: vscode.Uri, selectedFiles?: vscode.Uri[]) {
    let selectedUpdateFile = await this.getSelectedDefFiles(selectedFile, selectedFiles);
    if (selectedUpdateFile) {
      let name = `[Recovery] Flash ${basename(selectedUpdateFile.path)}`;
      this.legatoTaskProcessLauncher.executeInShell(name, `swiflash -m $LEGATO_TARGET -i '${selectedUpdateFile.path}'`);
    }
  }

  /**
   * Check current def file selection and use it if valid
   * Ask user to pick one if not
   */
  private async getSelectedDefFiles(selectedFile?: vscode.Uri, selectedFiles?: vscode.Uri[]): Promise<vscode.Uri | undefined> {
    return this.getSelectedFiles(selectedFile, selectedFiles, listImageFiles, {
      noFileFoundMessage: "Neither *.cwe nor .spk files found in workspace.",
      quickPickPlaceHolder: "Please select either .cwe or .spk file among ones available in the workspace..."
    });
  }

  /**
   * Check current selection and use it if valid
   * Ask user to pick one if not
   */
  private async getSelectedFiles(
    selectedFile: vscode.Uri | undefined,
    selectedFiles: vscode.Uri[] | undefined,
    fileProvider: () => Thenable<vscode.Uri[]>,
    messages: FileChooserMessage): Promise<vscode.Uri | undefined> {
    let possibleFiles: vscode.Uri[] = await fileProvider();

    // If one file is selected and is selectable, return it
    if (selectedFile && selectedFiles && selectedFiles.length === 1
      && possibleFiles.map(uri => uri.toString()).indexOf(selectedFile.toString()) >= 0) {
      return selectedFile;
    }

    // If not, ask user to pick one
    let userSelection = await chooseFile(possibleFiles, messages);
    return userSelection;
  }

  private async resetUserPartition() {
    let confirmed = ACTION_LABELS.OK === await vscode.window.showWarningMessage(
      "This will restore the device file system by erasing all user files.",
      ACTION_LABELS.CANCEL,
      ACTION_LABELS.OK);
    if (confirmed) {
      this.legatoTaskProcessLauncher.executeInShell(`[Recovery] Reset the user partition`, 'swiflash -m $LEGATO_TARGET -r');
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