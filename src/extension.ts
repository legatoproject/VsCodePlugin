'use strict';
import * as vscode from 'vscode';
import { LeafUiManager } from './leaf/leafAssist';
import { LeafManager } from './leaf/leafCore';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // This line of code will only be executed once when your extension is activated
    console.log('Extension "Legato Plugin" is now active!');

    LeafManager.getInstance().init(context);
    LeafUiManager.getInstance().init(context);
}

// this method is called when your extension is deactivated
export function deactivate() {
}