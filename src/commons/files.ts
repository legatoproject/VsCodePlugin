'use strict';

import * as vscode from "vscode";
import { join } from 'path';

export const LEAF_FILES = {
    DATA_FOLDER: 'leaf-data',
    WORKSPACE_FILE: 'leaf-workspace.json',
    REMOTE_CACHE_FILE: 'remotes.json'
};

export const enum WorkspaceResource {
    VsCode = '.vscode'
}

/**
 * filename an optional argument which will be appened to the workspace directory
 * @return current workpace path
 */
export function getWorkspaceDirectory(...path: string[]): string {
    if (vscode.workspace.rootPath) {
        if (path.length > 0) {
            return join(vscode.workspace.rootPath, ...path);
        }
        return vscode.workspace.rootPath;
    }
    throw new Error('workspace.rootPath is undefined');
}
