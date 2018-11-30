'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { CommandRegister } from './utils';

/**
 * Dialog labels
 */
export const ACTION_LABELS = {
	APPLY: "Apply",
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
		public readonly properties: any // Parsed JSON properties from leaf interface)
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
		properties: any,
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
export abstract class TreeItem2 extends IUiItems implements vscode.TreeItem {
	constructor(
		public readonly id: string,
		public readonly properties: any,
		public readonly label: string,
		public readonly tooltip: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly contextValue: string,
		private iconFileName?: string,
		public readonly command?: vscode.Command
	) {
		super(id, properties);
	}

	public async getChildren(): Promise<TreeItem2[]> {
		return [];
	}

	iconPath = this.iconFileName ? {
		light: path.join(__filename, '..', '..', 'resources', this.iconFileName),
		dark: path.join(__filename, '..', '..', 'resources', this.iconFileName)
	} : undefined;
}

/**
* Base for TreeDataProvider
*/
export abstract class TreeDataProvider2 extends CommandRegister implements vscode.TreeDataProvider<TreeItem2> {
	private _onDidChangeTreeData: vscode.EventEmitter<TreeItem2 | undefined> = new vscode.EventEmitter<TreeItem2 | undefined>();
	readonly onDidChangeTreeData: vscode.Event<TreeItem2 | undefined> = this._onDidChangeTreeData.event;

	constructor(viewId: string) {
		super();
		this.toDispose(vscode.window.registerTreeDataProvider(viewId, this));
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: TreeItem2): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: TreeItem2): Promise<TreeItem2[]> {
		if (element) {
			return element.getChildren();
		}
		return this.getRootElements();
	}

	async abstract getRootElements(): Promise<TreeItem2[]>;
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
	validator?: (value: string) => string | undefined
): Promise<string | undefined> {

	let box: vscode.InputBox = vscode.window.createInputBox();
	box.title = title;
	box.step = step;
	box.totalSteps = totalSteps;
	box.placeholder = placeholder;
	box.prompt = prompt;
	let result: string | undefined = undefined;

	if (validator) {
		box.onDidChangeValue(value => box.validationMessage = validator(value));
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
	ItemClass: new (id: string, properties: any) => T
): T[] {
	let out: T[] = [];
	for (let id in model) {
		out.push(new ItemClass(id, model[id]));
	}
	out.sort((itemA, itemB) => itemA.compareTo(itemB));
	return out;
}