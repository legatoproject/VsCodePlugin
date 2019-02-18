'use strict';

import * as vscode from 'vscode';
import { CommandRegister } from './manager';
import { View, Command, Context } from './identifiers';
import { extPromise, ExtensionPaths } from '../extension';

/**
 * Dialog labels
 */
export const ACTION_LABELS = {
	APPLY: "Apply",
	OK: "OK",
	CANCEL: "Cancel",
	REMOVE: "Remove",
	ADD_TO_QUEUE: "Queue",
	FORGET: "Forget",
	CHECK_AGAIN: "Check again",
	IGNORE: "Ignore"
};

/**
 * Base for QuickPickItem2 and TreeItem2
 */
export abstract class IUiItems {
	constructor(
		public readonly id: string, // Object identifier
		public readonly properties: any | undefined // Parsed JSON properties from leaf interface)
	) { }

	public compareTo(other: IUiItems) {
		if (this.id < other.id) { return -1; }
		if (this.id > other.id) { return 1; }
		return 0;
	}
}

/**
 * Base for QuickPickItem
 */
export abstract class QuickPickItem2 extends IUiItems implements vscode.QuickPickItem {
	constructor(
		id: string,
		properties: any | undefined,
		public readonly label: string,
		public readonly description?: string,
		public readonly details?: string
	) {
		super(id, properties);
	}
}

/**
 * Base for TreeItem
 */
export class TreeItem2 extends IUiItems implements vscode.TreeItem {
	public parent: TreeItem2 | undefined;
	public iconPath?: string;
	constructor(
		id: string,
		properties: any | undefined,
		public readonly label: string,
		public description: string,
		public tooltip: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly contextValue?: Context,
		iconFileName?: string,
		public command?: vscode.Command
	) {
		super(id, properties);
		this.setIcon(iconFileName);
	}

	protected async setIcon(iconFileName?: string) {
		if (iconFileName) {
			let ext = await extPromise;
			this.iconPath = await ext.getExtensionPath(ExtensionPaths.Resources, iconFileName);
		} else {
			this.iconPath = undefined;
		}
	}

	public async getChildren(): Promise<TreeItem2[]> {
		return [];
	}
}


/**
 * Checkbox
 */
export class CheckboxTreeItem extends TreeItem2 {
	private checked: boolean = true;

	constructor(
		id: string,
		properties: any | undefined,
		public label: string,
		public description: string,
		public tooltip: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly contextValue: Context,
		commandId: Command
	) {
		super(id, properties, label, description, tooltip, collapsibleState, contextValue);
		this.command = {
			title: "Toggle checkbox",
			command: commandId,
			arguments: [this]
		};
		this.setChecked(this.checked); // Set initial icon
	}

	public setChecked(value: boolean) {
		this.checked = value;
		this.setIcon(value ? 'CheckedCheckbox.svg' : 'UncheckedCheckbox.svg');
	}

	public isChecked(): boolean {
		return this.checked;
	}
}

/**
* Base for TreeDataProvider
*/
export abstract class TreeDataProvider2 extends CommandRegister implements vscode.TreeDataProvider<TreeItem2> {
	private _onDidChangeTreeData: vscode.EventEmitter<TreeItem2 | undefined> = new vscode.EventEmitter<TreeItem2 | undefined>();
	readonly onDidChangeTreeData: vscode.Event<TreeItem2 | undefined> = this._onDidChangeTreeData.event;

	constructor(viewId: View) {
		super();
		console.log(`[TreeDataProvider2] Register tree data provider: ${viewId}`);
		this.toDispose(vscode.window.registerTreeDataProvider(viewId, this));
	}

	protected refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	public getTreeItem(element: TreeItem2): vscode.TreeItem {
		return element;
	}

	public async getChildren(element?: TreeItem2): Promise<TreeItem2[]> {
		if (element) {
			return element.getChildren();
		}
		return this.getRootElements();
	}

	protected async abstract getRootElements(): Promise<TreeItem2[]>;
}

/**
 * Show a multi-step input box
 */
export async function showMultiStepInputBox(
	title: string | undefined,
	step: number | undefined,
	totalSteps: number | undefined,
	placeholder: string | undefined,
	prompt: string | undefined,
	validator?: (value: string) => Promise<string | undefined> | string | undefined
): Promise<string | undefined> {

	let box: vscode.InputBox = vscode.window.createInputBox();
	box.title = title;
	box.step = step;
	box.totalSteps = totalSteps;
	box.placeholder = placeholder;
	box.prompt = prompt;
	let result: string | undefined = undefined;

	if (validator) {
		box.onDidChangeValue(async value => box.validationMessage = await validator(value));
	}

	box.onDidAccept(() => {
		if (!box.validationMessage) {
			result = box.value;
			box.hide();
		}
	});

	return new Promise<string | undefined>((resolve, reject) => {
		box.onDidHide(() => resolve(result));
		box.show();
	});
}

/**
 * Show a multi-step quick pick
 */
export async function showMultiStepQuickPick<T extends QuickPickItem2>(
	title: string | undefined,
	step: number | undefined,
	totalSteps: number | undefined,
	placeholder: string | undefined,
	items: T[] | Promise<T[]>
): Promise<T | undefined> {

	let box: vscode.QuickPick<T> = vscode.window.createQuickPick();
	box.title = title;
	box.step = step;
	box.totalSteps = totalSteps;
	box.placeholder = placeholder;
	box.busy = true;
	box.show();
	box.items = await items;
	box.busy = false;

	let result: T | undefined = undefined;

	box.onDidAccept(() => {
		result = box.activeItems[0];
		box.hide();
	});

	return new Promise<T | undefined>((resolve, reject) => {
		box.onDidHide(() => resolve(result));
	});
}

/**
 * Convert model object to a UiItem array
 */
export function toItems<T extends IUiItems>(
	model: any,
	ItemClass: new (id: string, properties: any | undefined) => T,
	parent?: TreeItem2
): T[] {
	let out: T[] = [];
	for (let id in model) {
		let newItem = new ItemClass(id, model[id]);
		if (parent && newItem instanceof TreeItem2) {
			newItem.parent = parent;
		}
		out.push(newItem);
	}
	out.sort((itemA, itemB) => itemA.compareTo(itemB));
	return out;
}