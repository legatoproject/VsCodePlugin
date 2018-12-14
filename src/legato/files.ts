'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

const EXCLUDED_FOLDER = "**/leaf-data/*";
export interface FileChooserMessage {
  noFileFoundMessage: string;
  quickPickPlaceHolder: string;
}

/**
 * Lists .adef and .sdef files in project
 */
export function listDefinitionFiles(): Thenable<vscode.Uri[]> {
  return vscode.workspace.findFiles("**/*.[as]def", EXCLUDED_FOLDER);
}

/**
* Lists .update files in project
*/
export function listUpdateFiles(): Thenable<vscode.Uri[]> {
  return vscode.workspace.findFiles("**/*.update", EXCLUDED_FOLDER);
}

/**
* Lists image (.cwe and .spk) files  in project
*/
export async function listImageFiles(): Promise<vscode.Uri[]> {
  const uris = await vscode.workspace.findFiles("**/*.{cwe,spk}", "**/leaf-data");
  const leafdataUris = await vscode.workspace.findFiles("leaf-data/current/**/*.{cwe,spk}");
  return uris.concat(leafdataUris);
}

/**
 * @param legatoFiles files among to choose
 * @param messages define messages of the file chooser
 */
export function chooseFile(legatoFiles: vscode.Uri[], messages: FileChooserMessage): Promise<vscode.Uri | undefined> {
  return new Promise((resolve, _reject) => {
    if (legatoFiles.length === 0) {
      vscode.window.showErrorMessage(messages.noFileFoundMessage);
      resolve(undefined);
    } else if (legatoFiles.length === 1) {
      console.log(`File set to the only one - ${legatoFiles[0].path}`);
      resolve(legatoFiles[0]);
    } else {
      let uriToSelect = vscode.window.createQuickPick();
      uriToSelect.placeholder = messages.quickPickPlaceHolder;
      uriToSelect.items = legatoFiles.map(uri => new UriQuickPickItem(uri));
      uriToSelect.onDidChangeSelection((e: vscode.QuickPickItem[]) => {
        resolve((<UriQuickPickItem>e[0]).uri);
        uriToSelect.dispose();
      });
      uriToSelect.show();
    }
  });
}

class UriQuickPickItem implements vscode.QuickPickItem {
  label!: string;
  public uri: vscode.Uri;

  constructor(uri: vscode.Uri) {
    this.uri = uri;
    this.label = path.basename(uri.path).concat(' (', vscode.workspace.asRelativePath(path.dirname(uri.path)), ')');
  }
}