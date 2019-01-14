'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

const EXCLUDED_FOLDER = "**/leaf-data/*";
export interface FileChooserMessage {
  noFileFoundMessage: string;
  quickPickPlaceHolder: string;
}

/**
 * Patterns for Legato files
 */
export enum LegatoFilesPatterns {
  DefinitionsFiles = "**/*.[as]def",
  UpdateFiles = "**/*.update",
  leafDataFolder = "**/leaf-data",
  ImageFiles = "**/*.{cwe,spk}",
  CurrentImagesFiles = "leaf-data/current/**/*.{cwe,spk}"
}

/**
 * Lists .adef and .sdef files in project
 */
export function listDefinitionFiles(): Thenable<vscode.Uri[]> {
  return vscode.workspace.findFiles(LegatoFilesPatterns.DefinitionsFiles, EXCLUDED_FOLDER);
}

/**
* Lists .update files in project
*/
export function listUpdateFiles(): Thenable<vscode.Uri[]> {
  return vscode.workspace.findFiles(LegatoFilesPatterns.UpdateFiles, EXCLUDED_FOLDER);
}

/**
* Lists image (.cwe and .spk) files  in project
*/
export async function listImageFiles(): Promise<vscode.Uri[]> {
  const uris = await vscode.workspace.findFiles(LegatoFilesPatterns.ImageFiles, LegatoFilesPatterns.leafDataFolder);
  const leafdataUris = await vscode.workspace.findFiles(LegatoFilesPatterns.CurrentImagesFiles);
  return uris.concat(leafdataUris);
}

/**
 * @param legatoFiles files among to choose
 * @param messages define messages of the file chooser
 */
export async function chooseFile(legatoFiles: vscode.Uri[], messages: FileChooserMessage): Promise<vscode.Uri | undefined> {
  // No files
  if (legatoFiles.length === 0) {
    vscode.window.showErrorMessage(messages.noFileFoundMessage);
    return undefined;
  }

  // One file
  if (legatoFiles.length === 1) {
    console.log(`File set to the only one - ${legatoFiles[0].path}`);
    return legatoFiles[0];
  }

  // Let user choose file
  let item = await vscode.window.showQuickPick<UriQuickPickItem>(
    legatoFiles.map(uri => new UriQuickPickItem(uri)), // items
    { placeHolder: messages.quickPickPlaceHolder }); // options
  return item ? item.uri : undefined;
}

class UriQuickPickItem implements vscode.QuickPickItem {
  label!: string;
  public uri: vscode.Uri;

  constructor(uri: vscode.Uri) {
    this.uri = uri;
    this.label = path.basename(uri.path).concat(' (', vscode.workspace.asRelativePath(path.dirname(uri.path)), ')');
  }
}