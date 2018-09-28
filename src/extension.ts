'use strict';
import * as vscode from 'vscode';
import { LeafUiManager } from './leaf/leafAssist';

let leafUiManager: LeafUiManager;
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // This line of code will only be executed once when your extension is activated
    console.log('Extension "Legato Plugin" is now active!');

    leafUiManager = LeafUiManager.getInstance();
    leafUiManager.init(context);
}

// this method is called when your extension is deactivated
export function deactivate() {
    leafUiManager.dispose();
}