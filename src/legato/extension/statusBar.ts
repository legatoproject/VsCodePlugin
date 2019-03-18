'use strict';

import * as path from 'path';
import * as vscode from 'vscode';
import { Command } from '../../commons/identifiers';
import { CommandRegister } from '../../commons/manager';
import { listDefinitionFiles } from '../api/files';
import { LegatoManager } from '../api/core';
import { chooseFile } from '../../commons/files';

/**
 * This status bar show the current def file
 */
export class LegatoStatusBar extends CommandRegister {
  /**
   * The vscode status bar
   */
  private readonly statusbar: vscode.StatusBarItem;

  /**
   * Need one manager
   */
  public constructor(private readonly legatoManager: LegatoManager) {
    super();

    // Create command
    this.createCommand(Command.LegatoBuildPickDefFile, this.onPickDefFileCommand);

    // Status bar
    this.statusbar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    this.toDispose(this.statusbar);  // Dispose on extension/deactivate
    this.statusbar.command = Command.LegatoBuildPickDefFile;
    this.statusbar.text = "Searching sdef file...";
    this.statusbar.tooltip = "Active definition file";
    this.statusbar.show();

    // Update status bar on env var change
    this.legatoManager.defFile.addListener(this.updateStatusBar, this);
  }

  /**
   * Ask user to select a def file from a list
   */
  private async onPickDefFileCommand(): Promise<void> {
    let xdefs: vscode.Uri[] = await listDefinitionFiles();
    let defFile: vscode.Uri | undefined = undefined;
    if (xdefs.length > 0) {
      defFile = await chooseFile(xdefs,
        {
          noFileFoundMessage: "Neither *.sdef nor *.adef files found in workspace.",
          quickPickPlaceHolder: "Please select active definition file among ones available in the workspace..."
        });
      if (!defFile) {
        return; // User cancellation
      }
    }
    return this.legatoManager.saveActiveDefFile(defFile);
  }

  /**
   * Update status bar text using the given def file
   */
  private updateStatusBar(defFile: vscode.Uri | undefined) {
    this.statusbar.text = defFile ? path.basename(defFile.path) : '<No def file selected>';
  }
}
