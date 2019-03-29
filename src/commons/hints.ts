'use strict';

import * as vscode from 'vscode';
import { Configuration } from "./configuration";

/**
 * An action added to all hints
 */
const HideHints = "Hide hints";

/**
 * Show an hint with possible actions. Add a last action 'Hide hints'.
 * If the user click on this last action it will switch off the hints setting
 * @param message The message to show in th popup
 * @param actions the list of possible actions
 * @returns the choosen action or undefined
 */
export async function showHint<T extends string>(message: string, ...actions: T[]): Promise<T | undefined> {
    let actionsAndHide = (actions as string[]).concat(HideHints);
    let result = await vscode.window.showInformationMessage(message, ...actionsAndHide);
    if (result === HideHints) {
        Configuration.Common.showHints.update(false, vscode.ConfigurationTarget.Global);
    }
    return result as T;
}


