'use strict';

import * as vscode from "vscode";
import { Configuration } from '../../commons/configuration';
import { Command } from '../../commons/identifiers';
import { CommandRegister } from '../../commons/manager';
import { ReSpawnableTerminal, TerminalKind } from '../../commons/terminal';
import { ACTION_LABELS } from '../../commons/uiUtils';
import { listImageFiles, listUpdateFiles } from "../../legato/api/files";
import { CommandsQuickPick } from "../../commons/commands";
import { DeviceManager } from '../api/device';
import { LegatoManager } from "../../legato/api/core";
import { FileChooserMessage, chooseFile } from "../../commons/files";

/**
 * This status bar show the current device ip and show a list of command on click
 */
export class DeviceStatusBar extends CommandRegister {

  /**
   * The vscode status bar element
   */
  private readonly statusbar: vscode.StatusBarItem;

  /**
   * A reusable (external or integrated) terminal representation used to open a remote shell to the device
   */
  private readonly remoteShellTerminal: ReSpawnableTerminal;

  /**
   * A reusable (external or integrated) terminal representation used to open a remote logs to the device
   */
  private readonly remoteLogTerminal: ReSpawnableTerminal;

  /**
   * This component need 2 managers
   */
  public constructor(
    private readonly legatoManager: LegatoManager,
    private readonly deviceManager: DeviceManager
  ) {
    super();

    // Create terminals
    this.remoteShellTerminal = new RemoteShellTerminal(this.deviceManager);
    this.remoteLogTerminal = new RemoteLogsTerminal(this.deviceManager);

    // Create device commands
    this.createCommand(Command.LegatoTmSetIp, this.askForNewIP, this);
    this.createCommand(Command.LegatoTmShell, this.remoteShellTerminal.show, this.remoteShellTerminal);
    this.createCommand(Command.LegatoTmLogs, this.remoteLogTerminal.show, this.remoteLogTerminal);
    this.createCommand(Command.LegatoTmInstallOn, this.installOnDevice, this);
    this.createCommand(Command.LegatoTmDeviceFlashImage, this.flashImage, this);
    this.createCommand(Command.LegatoTmFlashImageRecovery, this.flashImageRecovery, this);
    this.createCommand(Command.LegatoTmResetUserPartition, this.resetUserPartition, this);

    // Create commands quick pick
    let quickPick = this.toDispose(new CommandsQuickPick(
      'Select the command to apply on device...',
      Command.LegatoTmSetIp,
      Command.LegatoTmShell,
      Command.LegatoTmLogs,
      Command.LegatoTmInstallOn,
      Command.LegatoTmDeviceFlashImage,
      Command.LegatoTmFlashImageRecovery,
      Command.LegatoTmResetUserPartition
    ));

    // Create Status bar
    this.statusbar = this.toDispose(vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5));
    this.statusbar.tooltip = "Legato Device commands";

    // Bind quick pick to status bar click
    let statusbarClickCommand = Command.LegatoTmCommandPalette;
    this.createCommand(statusbarClickCommand, quickPick.show, quickPick);
    this.statusbar.command = statusbarClickCommand;

    // Listen to dest ip changes to update status bar
    this.legatoManager.destIp.addListener(this.refreshStatusBar, this);

    // Show status bar
    this.statusbar.show();
  }

  /**
   * Refresh status bar using the given dest ip
   * @param destIp the dest ip to show in status bar
   */
  private refreshStatusBar(destIp: string | undefined) {
    this.statusbar.text = destIp ? destIp : "<Unknown>";
  }

  /**
   * Ask user for new IP then set it in legato
   */
  private async askForNewIP(): Promise<void> {
    let newIP = await vscode.window.showInputBox({
      prompt: "Please set the Legato device IP address",
      placeHolder: await this.legatoManager.destIp.get() // show dest ip as place holder
    });
    if (newIP) {
      return this.legatoManager.setDestIp(newIP);
    }
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

  /**
   * Check current def file selection and use it if valid
   * Ask user to pick one if not
   */
  private async getSelectedImagesFiles(selectedFile?: vscode.Uri, selectedFiles?: vscode.Uri[]): Promise<vscode.Uri | undefined> {
    return this.getSelectedFiles(selectedFile, selectedFiles, listImageFiles, {
      noFileFoundMessage: "Neither *.cwe nor .spk files found in workspace.",
      quickPickPlaceHolder: "Please select either .cwe or .spk file among ones available in the workspace..."
    });
  }

  /**
   * This command handler can be called from quick pick or from contextual explorer menu
   * @param selectedFile the first selected file
   * @param selectedFiles the list of all selected files in explorer
   */
  private async installOnDevice(selectedFile?: vscode.Uri, selectedFiles?: vscode.Uri[]): Promise<void> {
    let selectedUpdateFile = await this.getSelectedFiles(selectedFile, selectedFiles, listUpdateFiles, {
      noFileFoundMessage: "No *.update files found in workspace.",
      quickPickPlaceHolder: "Please select an update file among ones available in the workspace..."
    });
    if (selectedUpdateFile) {
      return this.deviceManager.installOnDevice(selectedUpdateFile.path);
    }
  }

  /**
   * This command handler can be called from quick pick or from contextual explorer menu
   * @param selectedFile the first selected file
   * @param selectedFiles the list of all selected files in explorer
   */
  private async flashImage(selectedFile?: vscode.Uri, selectedFiles?: vscode.Uri[]): Promise<void> {
    let selectedUpdateFile = await this.getSelectedImagesFiles(selectedFile, selectedFiles);
    if (selectedUpdateFile) {
      return this.deviceManager.flashImage(selectedUpdateFile.path);
    }
  }

  /**
   * This command handler can be called from quick pick or from contextual explorer menu
   * @param selectedFile the first selected file
   * @param selectedFiles the list of all selected files in explorer
   */
  private async flashImageRecovery(selectedFile?: vscode.Uri, selectedFiles?: vscode.Uri[]): Promise<void> {
    let selectedUpdateFile = await this.getSelectedImagesFiles(selectedFile, selectedFiles);
    if (selectedUpdateFile) {
      return this.deviceManager.flashImageRecovery(selectedUpdateFile.path);
    }
  }

  /**
   * Only called from the quickpick
   */
  private async resetUserPartition(): Promise<void> {
    let confirmed = ACTION_LABELS.OK === await vscode.window.showWarningMessage(
      "This will restore the device file system by erasing all user files.",
      ACTION_LABELS.CANCEL,
      ACTION_LABELS.OK);
    if (confirmed) {
      return this.deviceManager.resetUserPartition();
    }
  }
}

/**
 * Remote device shell terminal
 */
class RemoteShellTerminal extends ReSpawnableTerminal {
  constructor(private readonly deviceManager: DeviceManager) {
    super('Device shell'); // Name
  }

  /**
   * Connect to device using ssh
   */
  protected async createCommand(): Promise<string> {
    return this.deviceManager.remoteShellCmd.get();
  }

  /**
   * @returns kind from [Configuration](#Configuration)
   */
  protected getKind(): TerminalKind {
    return Configuration.Legato.Tm.Terminal.Kind.getValue();
  }
}

/**
 * Remote device logs terminal
 */
class RemoteLogsTerminal extends ReSpawnableTerminal {
  constructor(private readonly deviceManager: DeviceManager) {
    super('Device logs'); // Name
  }

  /**
   * Execute '/sbin/logread -f' via ssh
   */
  protected async createCommand(): Promise<string> {
    return this.deviceManager.remoteLogsCmd.get();
  }

  /**
   * @returns kind from [Configuration](#Configuration)
   */
  protected getKind(): TerminalKind {
    return Configuration.Legato.Tm.Log.Kind.getValue();
  }
}