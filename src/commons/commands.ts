'use strict';

import * as vscode from "vscode";
import { DisposableBag } from "./manager";
import { Command, extensionQualifiedId } from './identifiers';

/**
 * Define a contextual command palette triggered on an item click
 */
export class CommandsQuickPick extends DisposableBag {
    /**
     * The list of quickpick items to show
     * We need to store them because the quickpick clear its list on hide event
     */
    private readonly items: CommandQuickPickItem[];

    /**
     * The quickpick used to show the list of commands
     */
    private readonly quickPick: vscode.QuickPick<CommandQuickPickItem>;

    /**
     * Create te quickpick without showing it
     * @param placeHolder the placeholder to use
     * @param commands a list of command ids
     */
    constructor(
        private readonly placeHolder: string,
        ...commands: Command[]
    ) {
        super();

        // Create and store items
        this.items = commands.map(cmdDef => new CommandQuickPickItem(cmdDef));

        // Create and store quickpick
        this.quickPick = this.toDispose(vscode.window.createQuickPick<CommandQuickPickItem>());
        this.quickPick.placeholder = this.placeHolder;
        this.quickPick.onDidAccept(e => {
            let result = this.quickPick.selectedItems;
            if (result.length === 1) {
                vscode.commands.executeCommand((result[0]).command);
                this.quickPick.hide();
            }
        }, this, this);
    }

    /**
     * Show the command list
     */
    public show(): void {
        // Items are cleared on hide event, so let's set items here
        this.quickPick.items = this.items;
        this.quickPick.show();
    }
}

/**
 * Show the title of the command from package.json
 */
class CommandQuickPickItem implements vscode.QuickPickItem {
    /**
     * The visible label
     */
    label: string;

    /**
     * @param command the id of the command to show
     */
    constructor(public readonly command: Command) {
        this.label = this.findCommandLabelFromPackageJsonFile();
    }

    /**
     * @returns the title of the command from package.json
     */
    private findCommandLabelFromPackageJsonFile(): string {
        let extension = vscode.extensions.getExtension(extensionQualifiedId);
        if (!extension) {
            throw new Error(`Extension not found ${extensionQualifiedId}`);
        }
        for (let cmd of extension.packageJSON.contributes.commands) {
            if (cmd.command === this.command) {
                return cmd.title;
            }
        }
        throw new Error(`Command not found ${this.command}`);
    }
}