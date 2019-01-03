'use strict';
import * as vscode from 'vscode';
import { LeafTerminalManager } from './leaf/terminal';
import { LeafProfileStatusBar } from './leaf/profiles';
import { LeafManager } from './leaf/core';
import { LegatoManager } from './legato/core';
import { LegatoUiManager } from './legato/assist';
import { LeafPackagesView } from './leaf/packages';
import { LeafRemotesView } from './leaf/remotes';
import { TargetUiManager } from './tm/assist';
import { LegatoLanguageManager } from './legato/language';
import { ConfigurationManager } from './configuration';


/**
 * this method is called when your extension is activated
 * your extension is activated the very first time the command is executed
 */
export async function activate(context: vscode.ExtensionContext) {
    // This line of code will only be executed once when your extension is activated
    console.log('[Extension] "Legato Plugin" is now active!');

    // Check Leaf installation
    await LeafManager.checkLeafInstalled(context);

    // Check vscode configuration
    ConfigurationManager.getInstance().checkConfiguration();

    // Register manager to dispose it on deactivate
    context.subscriptions.push(LeafManager.getInstance());
    context.subscriptions.push(LegatoManager.getInstance());
    context.subscriptions.push(ConfigurationManager.getInstance());

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
}