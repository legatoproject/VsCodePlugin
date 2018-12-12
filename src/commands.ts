
'use strict';

import * as vscode from "vscode";
import { CommandRegister } from "./utils";

export enum CommandId {
    //device commands
    DEVICE_IP_COMMAND_PALETTE = "_legato.cmd.device.availablecommands",
    DEVICE_SHELL = "legato.cmd.device.shell",
    SET_DEVICE_IP = "legato.cmd.device.ip",
    DEVICE_LOGS = "legato.cmd.device.logs",
    DEVICE_INSTALL_ON = "legato.cmd.device.install.on"
}

export interface CommandDeclaration extends vscode.QuickPickItem {
    id: CommandId;
    callback: Function;
}
/**
 * Define a contextual command palette triggered on an item click
 */
export class ContextualCommandPalette extends CommandRegister {
    private itemListener: vscode.StatusBarItem;
    private commands: CommandDeclaration[];
    private placeHolder?: string;

    constructor(itemListener: vscode.StatusBarItem, paletteId: CommandId, commands: CommandDeclaration[], placeHolder?: string) {
        super();
        this.itemListener = itemListener;
        this.itemListener.command = paletteId;
        this.commands = commands;
        this.placeHolder = placeHolder;
    }

    public register() {
        this.createCommand(CommandId.DEVICE_IP_COMMAND_PALETTE, () => this.onItemClick());
        // contextual commands registering
        this.commands.forEach((cmdDef: CommandDeclaration) => this.createCommand(cmdDef.id, (args:any[]) => cmdDef.callback(args)));
    }

    private onItemClick(): any {
        let commandPalette = vscode.window.createQuickPick();
        commandPalette.placeholder = this.placeHolder;
        const executeSelectedCommand = (e: vscode.QuickPickItem[]) => {
            (<CommandQuickPickItem>e[0]).execute();
            commandPalette.dispose();
        };
        commandPalette.onDidChangeSelection(executeSelectedCommand);
        commandPalette.items = this.commands.map((cmdDef: CommandDeclaration) => new CommandQuickPickItem(cmdDef));
        commandPalette.show();
    }
}

export class CommandQuickPickItem implements vscode.QuickPickItem {
    label!: string;
    description!: string;
    detail?: string | undefined;
    protected command: CommandId | undefined;
    protected args: any[] | undefined;

    constructor(item: CommandDeclaration) {
        this.command = item.id;
        Object.assign(this, item);
    }

    execute(): Promise<{} | undefined> {
        if (this.command === undefined) { return Promise.resolve(undefined); }
        return vscode.commands.executeCommand(this.command, ...(this.args || [])) as Promise<{} | undefined>;
    }
}