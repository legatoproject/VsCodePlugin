'use strict';

import * as vscode from 'vscode';
import { IDS } from '../identifiers';
import { TreeItem2 , TreeDataProvider2 } from './leafTreeView';

export class LeafRemotesDataProvider extends TreeDataProvider2  {

	constructor(context: vscode.ExtensionContext) {
		super();
		this.createCommand(IDS.COMMANDS.REMOTES.REFRESH, context, this.refresh);
//		this.createCommand(IDS.COMMANDS.REMOTES.ADD, context, () => undefined);
//		this.createCommand(IDS.COMMANDS.REMOTES.REMOVE, context, () => undefined);
		this.createCommand(IDS.COMMANDS.REMOTES.ENABLE, context, node => this.enableRemote(node));
		this.createCommand(IDS.COMMANDS.REMOTES.DISABLE, context, node => this.enableRemote(node, false));
	}

	private createCommand(id: string, context: vscode.ExtensionContext, cb: (...args: any[]) => any) {
		let disposable = vscode.commands.registerCommand(id, cb, this);
		context.subscriptions.push(disposable);
	}

	private async enableRemote(node:LeafRemote | undefined, enabled:boolean = true) {
		if (!node) {
			throw Error("No remote selected");
		}
		await this.leafManager.enableRemote(node.remoteId, enabled);
		this.refresh();
	}

	async getRootElements(): Promise<TreeItem2[]> {
		let out = [];
		let remotes = await this.leafManager.requestRemotes() as any;
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