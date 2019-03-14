'use strict';

import { basename } from 'path';
import * as vscode from "vscode";
import { ContextualCommandPalette } from "./commands";
import { LeafManager, LeafEvent } from "../leaf/core";
import { LEGATO_ENV } from "../legato/core";
import { chooseFile, listUpdateFiles, listImageFiles, FileChooserMessage } from "../legato/files";
import { CommandRegister } from '../commons/manager';
import { ACTION_LABELS } from '../commons/uiUtils';
import { Command, TaskDefinitionType } from '../commons/identifiers';
import { TaskProcessLauncher } from '../commons/process';
import { Configuration } from '../commons/configuration';
import { TerminalKind, ReSpawnableTerminal } from '../commons/terminal';
import { getWorkspaceDirectory } from '../commons/files';
import { EnvVars } from '../commons/utils';

export class TargetUiManager extends CommandRegister {

  private readonly targetStatusbar: vscode.StatusBarItem;
  private readonly remoteShellTerminal: ReSpawnableTerminal;
  private readonly remoteLogTerminal: ReSpawnableTerminal;
  private readonly paletteOnDeviceIP: ContextualCommandPalette;
  private readonly legatoTaskProcessLauncher: TaskProcessLauncher;

  public constructor(private readonly leafManager: LeafManager) {
    super();

    // Create terminals
    this.remoteShellTerminal = new RemoteShellTerminal(this.leafManager);
    this.remoteLogTerminal = new RemoteLogsTerminal(this.leafManager);

    // Create the task process launcher (this class can launch a process as a vscode task)
    this.legatoTaskProcessLauncher = this.toDispose(new TaskProcessLauncher(
      TaskDefinitionType.LegatoTm, // Task type 
      {
        defaultCwd: getWorkspaceDirectory(),
        envProvider: this.leafManager.getEnvVars,
        thisArg: this.leafManager
      }));

    // Status bar
    this.targetStatusbar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5);
    this.toDispose(this.targetStatusbar); // Dispose status bar on deactivate
    this.targetStatusbar.tooltip = "Legato Device commands";
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
          callback: this.remoteShellTerminal.show,
          thisArg: this.remoteShellTerminal
        },
        {
          id: Command.LegatoTmLogs,
          label: "Open Device logs",
          callback: this.remoteLogTerminal.show,
          thisArg: this.remoteLogTerminal
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
    this.leafManager.addListener(LeafEvent.EnvVarsChanged, this.onEnvVarsChange, this);

    // Show DEST_IP on start
    this.setInitialState();
  }

  /**
   * Async initialisation
   */
  private async setInitialState(): Promise<void> {
    try {
      this.onEnvVarsChange(undefined, await this.leafManager.getEnvVars());
    } catch (reason) {
      // Catch and log because this method is never awaited
      console.error(reason);
    }
  }

  private onEnvVarsChange(oldEnvVar: EnvVars | undefined, newEnvVar: EnvVars | undefined) {
    let oldDestIp = oldEnvVar ? oldEnvVar[LEGATO_ENV.DEST_IP] : undefined;
    let newDestIp = newEnvVar ? newEnvVar[LEGATO_ENV.DEST_IP] : undefined;
    if (oldDestIp !== newDestIp) {
      this.targetStatusbar.text = newDestIp ? newDestIp : "<Unknown>";
    }
  }

  private async askForNewIP(): Promise<void> {
    let ip = await this.leafManager.getEnvValue(LEGATO_ENV.DEST_IP);
    let newIP = await vscode.window.showInputBox({
      prompt: "Please set the Legato device IP address",
      placeHolder: ip
    });
    if (newIP) {
      return this.leafManager.setEnvValue(LEGATO_ENV.DEST_IP, newIP);
    }
  }

  private async installOnDevice(selectedFile?: vscode.Uri, selectedFiles?: vscode.Uri[]): Promise<void> {
    let selectedUpdateFile = await this.getSelectedFiles(selectedFile, selectedFiles, listUpdateFiles, {
      noFileFoundMessage: "No *.update files found in workspace.",
      quickPickPlaceHolder: "Please select an update file among ones available in the workspace..."
    });
    if (selectedUpdateFile) {
      return this.legatoTaskProcessLauncher.executeProcess(
        `Install ${basename(selectedUpdateFile.path)}`,
        ['update', selectedUpdateFile.path]);
    }
  }

  private async flashImage(selectedFile?: vscode.Uri, selectedFiles?: vscode.Uri[]): Promise<void> {
    let selectedUpdateFile = await this.getSelectedDefFiles(selectedFile, selectedFiles);
    if (selectedUpdateFile) {
      let name = `Flash ${basename(selectedUpdateFile.path)}`;
      return this.legatoTaskProcessLauncher.executeProcess(name, ['fwupdate', 'download', selectedUpdateFile.path]);
    }
  }

  private async flashImageRecovery(selectedFile?: vscode.Uri, selectedFiles?: vscode.Uri[]): Promise<void> {
    let selectedUpdateFile = await this.getSelectedDefFiles(selectedFile, selectedFiles);
    if (selectedUpdateFile) {
      let name = `[Recovery] Flash ${basename(selectedUpdateFile.path)}`;
      return this.legatoTaskProcessLauncher.executeInShell(name, `swiflash -m $LEGATO_TARGET -i '${selectedUpdateFile.path}'`);
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

  private async resetUserPartition(): Promise<void> {
    let confirmed = ACTION_LABELS.OK === await vscode.window.showWarningMessage(
      "This will restore the device file system by erasing all user files.",
      ACTION_LABELS.CANCEL,
      ACTION_LABELS.OK);
    if (confirmed) {
      return this.legatoTaskProcessLauncher.executeInShell('[Recovery] Reset the user partition', 'swiflash -m $LEGATO_TARGET -r');
    }
  }
}

/**
 * Parent of RemoteShellTerminal & RemoteLogsTerminal
 * Give destIP
 */
abstract class DeviceTerminal extends ReSpawnableTerminal {
  constructor(name: string, protected readonly leafManager: LeafManager) {
    super(name);
  }
  protected async getDestIp(): Promise<string> {
    let destIp = await this.leafManager.getEnvValue(LEGATO_ENV.DEST_IP);
    if (!destIp) {
      throw Error('Cannot launch this command, $DEST_IP is not set');
    }
    return destIp;
  }
}

/**
 * Remote device shell terminal
 */
class RemoteShellTerminal extends DeviceTerminal {
  constructor(leafManager: LeafManager) {
    super('Device shell', leafManager); // Name
  }

  /**
   * Connect to device using ssh
   */
  protected async createCommand(): Promise<string> {
    return `ssh root@${await this.getDestIp()}`;
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
class RemoteLogsTerminal extends DeviceTerminal {
  constructor(leafManager: LeafManager) {
    super('Device logs', leafManager); // Name
  }

  /**
   * Execute '/sbin/logread -f' via ssh
   */
  protected async createCommand(): Promise<string> {
    return `ssh root@${await this.getDestIp()} /sbin/logread -f`;
  }

  /**
   * @returns kind from [Configuration](#Configuration)
   */
  protected getKind(): TerminalKind {
    return Configuration.Legato.Tm.Log.Kind.getValue();
  }
}