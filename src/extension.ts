'use strict';
import * as vscode from 'vscode';
import { join } from 'path';
import { LeafTerminalManager } from './leaf/terminal';
import { LeafProfileStatusBar } from './leaf/profiles';
import { LeafManager } from './leaf/core';
import { LegatoManager } from './legato/core';
import { LegatoUiManager } from './legato/assist';
import { LeafPackagesView } from './leaf/packages';
import { LeafRemotesView } from './leaf/remotes';
import { TargetUiManager } from './tm/assist';
import { LegatoLanguageManager } from './legato/language';
import { Configuration } from './commons/configuration';
import { VersionManager } from './commons/version';

let _context: vscode.ExtensionContext | undefined = undefined;

/**
 * this method is called when your extension is activated
 * your extension is activated the very first time the command is executed
 */
export async function activate(context: vscode.ExtensionContext) {
    // Set current context
    _context = context;

    // Set previous and current version
    VersionManager.check();

    // Check Leaf installation
    await LeafManager.checkLeafInstalled();

    // Check vscode configuration
    context.subscriptions.push(Configuration.launchChecker());

    // Register manager to dispose it on deactivate
    context.subscriptions.push(LeafManager.getInstance());
    context.subscriptions.push(LegatoManager.getInstance());

    // Launch data providers for packages and remotes view
    context.subscriptions.push(new LeafPackagesView());
    context.subscriptions.push(new LeafRemotesView());

    // Launch/Dispose on In/Out of LeafWorkspace
    LeafManager.getInstance().createAndDisposeOnLeafWorkspace(
        LeafTerminalManager,
        LeafProfileStatusBar);

    // Launch/Dispose on In/Out of LegatoWorkspace
    LegatoManager.getInstance().createAndDisposeOnLegatoWorkspace(
        LegatoUiManager,
        TargetUiManager,
        LegatoLanguageManager);
}

// this method is called when your extension is deactivated
export function deactivate() {
    _context = undefined;
}

export function getContext(): vscode.ExtensionContext {
    if (!_context) {
        throw new Error('Extension is not active anymore'); // Should not be called
    }
    return _context;
}

export const enum ExtensionPaths {
    Resources = 'resources'
}

export function getExtensionPath(...path: string[]) {
    let out = getContext().extensionPath;
    if (path && path.length > 0) {
        out = join(out, ...path);
    }
    return out;
}
