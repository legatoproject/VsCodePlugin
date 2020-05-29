'use strict';

import * as vscode from "vscode";
import { join, dirname, basename } from 'path';

/**
 * Leaf file names
 */
export const LEAF_FILES = {
    DATA_FOLDER: 'leaf-data',
    WORKSPACE_FILE: 'leaf-workspace.json',
    REMOTE_CACHE_FOLDER: 'remotes',
    CONFIG_FILE: 'config.json',
};

/**
 * Workspace root knwon folders
 */
export const enum WorkspaceResource {
    VsCode = '.vscode'
}

function validateFolders(folders: vscode.WorkspaceFolder[]): boolean {
    let regex = new RegExp('[^-_.A-Za-z0-9]');
    for (var folder of folders) {
        if (regex.test(folder.name)) {
            return false;
        }
    }
    return true;
}

/**
 * @returns the root workspace folder as a vscode.WorkspaceFolder
 * @throws an Error if not workspace folder is open
 */
export function getWorkspaceFolder(): vscode.WorkspaceFolder {
    let wsFolders = vscode.workspace.workspaceFolders;
    if (wsFolders && wsFolders.length > 0) {
        if (validateFolders(wsFolders)) {
            return wsFolders[0];
        } else {
            vscode.window.showWarningMessage(
                "Invalid Workspace folder name. " +
                "Only the following characters are permitted: a-z, A-Z, 0-9, ., - and _.");
            throw new Error('Workspace folder name is invalid');
        }
    }
    throw new Error('There is no workspace folder');
}

/**
 * @param path an optional argument which will be appened to the workspace directory
 * @return the root workspace folder path as a string
 */
export function getWorkspaceFolderPath(...path: string[]): string {
    let rootPath = getWorkspaceFolder().uri.fsPath;
    if (path.length > 0) {
        return join(rootPath, ...path);
    }
    return rootPath;
}

/**
 * @return the default folder path as a string
 */
export function getDefaultCwd(): string {
    let defaultPath = "";
    try {
        defaultPath = getWorkspaceFolderPath();
    } catch {
        //defaultPath is empty
    }
    return defaultPath;
}

/**
 * Messages used by chooseFile function
 */
export interface FileChooserMessage {
    noFileFoundMessage: string;
    quickPickPlaceHolder: string;
}

/**
 * Return a selection from the given list of uri
 * @param possibleFiles files among to choose
 * @param messages define messages of the file chooser
 * @returns the selected file or undefined if the user canceled this operation
 */
export async function chooseFile(possibleFiles: vscode.Uri[], messages: FileChooserMessage): Promise<vscode.Uri | undefined> {
    // No files
    if (possibleFiles.length === 0) {
        vscode.window.showErrorMessage(messages.noFileFoundMessage);
        return undefined;
    }

    // One file
    if (possibleFiles.length === 1) {
        console.log(`File set to the only one - ${possibleFiles[0].path}`);
        return possibleFiles[0];
    }

    // Let user choose file
    let item = await vscode.window.showQuickPick<UriQuickPickItem>(
        possibleFiles.map(uri => new UriQuickPickItem(uri)), // items
        { placeHolder: messages.quickPickPlaceHolder }); // options
    return item ? item.uri : undefined;
}

/**
 * Show uri as a quickpick item
 * format: 'filename (relativepath)'
 */
class UriQuickPickItem implements vscode.QuickPickItem {
    public readonly label: string;

    constructor(public readonly uri: vscode.Uri) {
        let uriPath = uri.fsPath;
        let fileName = basename(uriPath);
        let relativePath = vscode.workspace.asRelativePath(dirname(uriPath));
        this.label = `${fileName} (${relativePath})`;
    }
}