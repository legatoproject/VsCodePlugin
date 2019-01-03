'use strict';

import * as vscode from 'vscode';

export interface FileChooserMessage {
  noFileFoundMessage: string;
  quickPickPlaceHolder: string;
}


const EXCLUDED_FOLDER = "**/leaf-data/*";
// Lists def files in project, and if there's only one, set it as the active one.
export function listDefinitionFiles(): Thenable<vscode.Uri[]> {
  return vscode.workspace.findFiles("**/*.[as]def", EXCLUDED_FOLDER);
}

// Lists update files in project, and if there's only one, set it as the active one.
export function listUpdateFiles(): Thenable<vscode.Uri[]> {
  return vscode.workspace.findFiles("**/*.update", EXCLUDED_FOLDER);
}

export async function chooseFile(legatoFiles: vscode.Uri[], messages: FileChooserMessage): Promise<vscode.Uri | undefined> {
  if (legatoFiles.length === 0) {
    vscode.window.showErrorMessage(messages.noFileFoundMessage);
    return undefined;
  } else if (legatoFiles.length === 1) {
    console.log(`[Files] File set to the only one - ${legatoFiles[0].path}`);
    return legatoFiles[0];
  } else {
    let filePath: string | undefined = await vscode.window.showQuickPick(
      legatoFiles.map(s => s.path),
      { placeHolder: messages.quickPickPlaceHolder });
    return filePath !== undefined ? vscode.Uri.file(filePath) : undefined;
  }
}