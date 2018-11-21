'use strict';
import * as vscode from 'vscode';
import { LeafTerminalManager } from './leaf/leafTerminal';
import { LeafProfileStatusBar } from './leaf/leafProfiles';
import { LeafManager } from './leaf/leafCore';
import { LegatoUiManager } from './legato/legatoAssist';
import { LeafPackagesView } from './leaf/leafPackages';
import { LeafRemotesView } from './leaf/leafRemotes';
import { TargetUiManager } from './tm/tmAssist';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
    // This line of code will only be executed once when your extension is activated
    console.log('Extension "Legato Plugin" is now active!');

    // Register LeafManage to stop file watching on deactivate
    context.subscriptions.push(LeafManager.INSTANCE);

    // Check if leaf is available
    let leafVersion = await LeafManager.INSTANCE.getLeafVersion();
    vscode.window.showInformationMessage(`Found: ${leafVersion}`);

    // Exclude leaf-data from file watcher
    let config = vscode.workspace.getConfiguration(undefined, null);
    config.update("files.watcherExclude", { "**/leaf-data/**": true }, vscode.ConfigurationTarget.Global);

    // Start Leaf UI
    context.subscriptions.push(new LeafTerminalManager());
    context.subscriptions.push(new LeafProfileStatusBar());
    context.subscriptions.push(new LeafPackagesView());
    context.subscriptions.push(new LeafRemotesView());

    // Start Legato UI
    context.subscriptions.push(new LegatoUiManager());

    // Start Target Management UI
    context.subscriptions.push(new TargetUiManager());
}

// this method is called when your extension is deactivated
export function deactivate() {
}