'use strict';
import * as vscode from 'vscode';
import { LeafUiManager } from './leaf/leafAssist';
import { LeafManager } from './leaf/leafCore';
import { LegatoUiManager } from './legato/legatoAssist';
import { LeafPackagesDataProvider } from './leaf/leafPackages';
import { LeafRemotesDataProvider } from './leaf/leafRemotes';
import { IDS } from './identifiers';
import { TargetUiManager } from './tm/tmAssist';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // This line of code will only be executed once when your extension is activated
    console.log('Extension "Legato Plugin" is now active!');

    // Register LeafManage to stop file watching on deactivate
    context.subscriptions.push(LeafManager.INSTANCE);

    // Start Leaf UI
    new LeafUiManager().start(context);
    new LegatoUiManager().start(context);

    // Start Target Management UI
    new TargetUiManager().start(context);


    // Exclude leaf-data from file watcher
    let config = vscode.workspace.getConfiguration(undefined, null);
    config.update("files.watcherExclude", { "**/leaf-data/**": true }, vscode.ConfigurationTarget.Global);

	vscode.window.registerTreeDataProvider(IDS.VIEWS.PACKAGES, new LeafPackagesDataProvider(context));
	vscode.window.registerTreeDataProvider(IDS.VIEWS.REMOTES, new LeafRemotesDataProvider(context));
}

// this method is called when your extension is deactivated
export function deactivate() {
}