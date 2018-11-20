'use strict';

import * as vscode from 'vscode';
import { IDS } from '../identifiers';
import { TreeItem2, TreeDataProvider2 } from './leafTreeView';

export class LeafRemotesDataProvider extends TreeDataProvider2 {
	private static readonly validProtocols: ReadonlyArray<string> = ['http', 'https', 'file'];

	constructor(context: vscode.ExtensionContext) {
		super();
		this.createCommand(IDS.COMMANDS.REMOTES.REFRESH, context, this.refresh);
		this.createCommand(IDS.COMMANDS.REMOTES.ADD, context, this.addRemote);
		this.createCommand(IDS.COMMANDS.REMOTES.REMOVE, context, this.removeRemote);
		this.createCommand(IDS.COMMANDS.REMOTES.ENABLE, context, node => this.enableRemote(node));
		this.createCommand(IDS.COMMANDS.REMOTES.DISABLE, context, node => this.enableRemote(node, false));
	}

	private createCommand(id: string, context: vscode.ExtensionContext, cb: (...args: any[]) => any) {
		let disposable = vscode.commands.registerCommand(id, cb, this);
		context.subscriptions.push(disposable);
	}

	private async enableRemote(node: LeafRemote | undefined, enabled: boolean = true) {
		if (!node) {
			throw Error("No remote selected");
		}
		await this.leafManager.enableRemote(node.remoteId, enabled);
		this.refresh();
	}

	private async addRemote() {
		let remotes = await this.leafManager.requestRemotes();
		let title = "Add new remote";
		let step = 1;
		let totalSteps = 2;

		// Alias
		let alias = await this.showInputBox(title, step++, totalSteps,
			"Remote Alias",
			"Please enter an alias for the new remote",
			value => {
				if (value in remotes) {
					return 'This remote alias is already used';
				}
				if (value.includes(' ')) {
					return 'The remote alias cannot contains a space';
				}
				return undefined;
			}
		);
		if (!alias) {
			// Operation canceled by user
			return;
		}

		// URL
		let url = await this.showInputBox(title, step++, totalSteps,
			"Remote URL",
			"Please enter the url of the new remote",
			value => {
				let uri = vscode.Uri.parse(value);
				if (LeafRemotesDataProvider.validProtocols.indexOf(uri.scheme) === -1) {
					return `The possible protocols are: ${LeafRemotesDataProvider.validProtocols.join(', ')}`;
				}
				if (!uri.authority && !uri.path) {
					return 'This url is malformed';
				}
				return undefined;
			}
		);
		if (!url) {
			// Operation canceled by user
			return;
		}

		// Launch task and refresh
		await this.leafManager.addRemote(alias, url);
		this.refresh();
	}

	private async showInputBox(
		title: string | undefined,
		step: number | undefined,
		totalSteps: number | undefined,
		placeholder: string | undefined,
		prompt: string | undefined,
		validator: (value: string) => string | undefined
	): Promise<string | undefined> {

		let box: vscode.InputBox = vscode.window.createInputBox();
		box.title = title;
		box.step = step;
		box.totalSteps = totalSteps;
		box.placeholder = placeholder;
		box.prompt = prompt;
		let result: string | undefined = undefined;

		box.onDidChangeValue(value => box.validationMessage = validator(value));

		box.onDidAccept(() => {
			if (box.value.length > 0 && !box.validationMessage) {
				result = box.value;
				box.hide();
			}
		});

		return new Promise<string | undefined>((resolve, reject) => {
			box.onDidHide(() => resolve(result));
			box.show();
		});
	}

	private async removeRemote(node: LeafRemote | undefined) {
		if (!node) {
			throw Error("No remote selected");
		}
		if ("Remove" === await vscode.window.showWarningMessage("Do you really want to permanently delete this remote?", "Cancel", "Remove")) {
			await this.leafManager.removeRemote(node.remoteId);
			this.refresh();
		}
	}

	async getRootElements(): Promise<TreeItem2[]> {
		let out = [];
		let remotes = await this.leafManager.requestRemotes();
		for (let remoteId in remotes) {
			let remote = remotes[remoteId];
			out.push(new LeafRemote(remoteId, remote));
		}
		out.sort((remA, remB) => {
			if (remA.label < remB.label) { return -1; }
			if (remA.label > remB.label) { return 1; }
			return 0;
		});
		return out;
	}
}

class LeafRemote extends TreeItem2 {
	constructor(
		public readonly remoteId: any,
		public readonly remote: any
	) {
		super(
			remoteId,
			remote.url,
			remote.url,
			vscode.TreeItemCollapsibleState.None,
			remote.enabled ? IDS.VIEW_ITEMS.REMOTES.ENABLED : IDS.VIEW_ITEMS.REMOTES.DISABLE,
			remote.enabled ? "RemoteEnabled.svg" : "RemoteDisabled.svg");
	}
}