'use strict';
import * as vscode from 'vscode';
import { LeafTerminalManager } from './leaf/leafTerminal';
import { LeafProfileStatusBar } from './leaf/leafProfiles';
import { LeafManager } from './leaf/leafCore';
import { LegatoManager } from './legato/legatoCore';
import { LegatoUiManager } from './legato/legatoAssist';
import { LeafPackagesView } from './leaf/leafPackages';
import { LeafRemotesView } from './leaf/leafRemotes';
import { TargetUiManager } from './tm/tmAssist';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
    // This line of code will only be executed once when your extension is activated
    console.log('Extension "Legato Plugin" is now active!');

    // Check Leaf installation
    await LeafManager.checkLeafInstalled();

    // Exclude leaf-data from file watcher
    let config = vscode.workspace.getConfiguration(undefined, null);
    config.update("files.watcherExclude", { "**/leaf-data/**": true }, vscode.ConfigurationTarget.Global);

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
        TargetUiManager);
}

// this method is called when your extension is deactivated
export function deactivate() {
}