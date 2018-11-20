'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { LeafManager } from './leafCore';

export const ACTION_LABELS = {
	CANCEL: "Cancel",
	REMOVE: "Remove",
	ADD_TO_QUEUE: "Queue",
	FORGET: "Forget"
};

export class TreeItem2 extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly id: string,
		public readonly tooltip: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly contextValue: string,
		private iconFileName?: string,
		public readonly command?: vscode.Command
	) {
		super(label, collapsibleState);
	}

	public async getChildren(): Promise<TreeItem2[]> {
		return [];
	}

	iconPath = this.iconFileName ? {
		light: path.join(__filename, '..', '..', '..', 'resources', this.iconFileName),
		dark: path.join(__filename, '..', '..', '..', 'resources', this.iconFileName)
	} : undefined;
}

export class TreeDataProvider2 implements vscode.TreeDataProvider<TreeItem2> {
	leafManager: LeafManager = LeafManager.INSTANCE;
	private _onDidChangeTreeData: vscode.EventEmitter<TreeItem2 | undefined> = new vscode.EventEmitter<TreeItem2 | undefined>();
	readonly onDidChangeTreeData: vscode.Event<TreeItem2 | undefined> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: TreeItem2): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: TreeItem2): Promise<TreeItem2[]> {
		if (element) {
			let out = await element.getChildren();
			return out;
		}
		return this.getRootElements();
	}

	async getRootElements(): Promise<TreeItem2[]> {
		throw new Error('You have to implement the method doSomething!');
	}
}
