'use strict';

import * as vscode from 'vscode';
import { join } from 'path';

/**
 * Folder/Files names of extension resources
 */
export const enum ExtensionPaths {
    Resources = 'resources',
    Vscode = '.vscode',
    WelcomePage = 'webview/welcomepage',
    ChangeLog = 'CHANGELOG.md',
    Bridge = 'python-src/leaf-bridge.py',
    DebugSshWrapper = 'bash-src/sshWrapper.sh'
}

/**
 * Manage the entire extension life-cycle
 */
export class ResourcesManager {

    /**
     * The resource manager need the extension context
     */
    public constructor(
        private readonly context: vscode.ExtensionContext
    ) { }

    /**
     * Get the absolute path of a resource contained in the extension.
     *
     * @param path A relative path to a resource contained in the extension.
     * @return The absolute path of the resource.
     */
    public getExtensionPath(...path: string[]) {
        return this.context.asAbsolutePath(join(...path));
    }
}
