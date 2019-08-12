'use strict';

import * as vscode from 'vscode';
import { extPromise } from '../extension';
import { Command, View } from './identifiers';
import { CommandRegister } from './manager';
import { ExtensionPaths } from './resources';
import { LeafBridgeElement } from './utils';

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
 * Base class to enable dynamic context.
 */
export abstract class NamespaceContext {

	protected values: string[] = ['context'];
	constructor(readonly prefix: string, particles: string[]) {
		this.values.push(prefix, ...particles);
	}

	/**
	 * The context value will be joined together with '-' character
	 */
	public getValue(): string {
		return this.values.join('-');
	}
}

/**
 * Base for QuickPickItem2 and TreeItem2
 */
export abstract class IUiItems {
	constructor(
		public readonly id: string, // Object identifier
		public readonly parent: TreeItem2 | undefined,
		public readonly properties: any | undefined // Parsed JSON properties from leaf interface)
	) { }

	/**
	 * Used only in 'toItems' function to sort items
	 */
	public compareTo(other: IUiItems) {
		if (this.id < other.id) { return -1; }
		if (this.id > other.id) { return 1; }
		return 0;
	}
}

/**
 * Base for QuickPickItem
 */
export class QuickPickItem2 extends IUiItems implements vscode.QuickPickItem {
	constructor(
		id: string,
		parent: TreeItem2 | undefined,
		properties: any | undefined,
		public readonly label: string,
		public readonly description?: string,
		public readonly details?: string,
		public readonly alwaysShow?: boolean
	) {
		super(id, parent, properties);
	}
}

/**
 * Create a quickpick item that is always shown with a light bulb icon
 * Useful to show actions after a list of selectable elements
 * @param label A human readable string which is rendered prominent.
 * @param description A human readable string which is rendered less prominent.
 */
export function createActionAsQuickPickItem(label: string, description?: string): QuickPickItem2 {
	return new QuickPickItem2(
		label, // label as Id
		undefined, undefined, // No parent or properties
		`$(light-bulb) ${label}`, // label with light bulb icon
		description, // description
		"Additional action", // details (not shown in UI currently)
		true); // always show this item.
}

/**
 * Base for TreeItem
 */
export class TreeItem2 extends IUiItems implements vscode.TreeItem {
	public iconPath?: string;
	public contextValue?: string;
	constructor(
		id: string,
		parent: TreeItem2 | undefined,
		properties: any | undefined,
		public readonly label: string,
		public description: string,
		public tooltip: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly context?: NamespaceContext,
		iconFileName?: string,
		public command?: vscode.Command
	) {
		super(parent ? parent.id + id : id, parent, properties);
		this.contextValue = this.context ? this.context.getValue() : undefined;
		this.setIcon(iconFileName);
	}

	protected async setIcon(iconFileName?: string) {
		if (iconFileName) {
			this.iconPath = (await extPromise).resourcesManager.getExtensionPath(ExtensionPaths.Resources, iconFileName);
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
		parent: TreeItem2 | undefined,
		properties: any | undefined,
		public label: string,
		public description: string,
		public tooltip: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly context: NamespaceContext,
		commandId: Command
	) {
		super(id, parent, properties, label, description, tooltip, collapsibleState, context);
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

	let box = vscode.window.createQuickPick<T>();
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
	model: LeafBridgeElement,
	ItemClass: new (id: string, parent: TreeItem2 | undefined, properties: any | undefined) => T,
	parent?: TreeItem2
): T[] {
	let out: T[] = [];
	for (let id in model) {
		let newItem = new ItemClass(id, parent, model[id]);
		out.push(newItem);
	}
	out.sort((itemA, itemB) => itemA.compareTo(itemB));
	return out;
}