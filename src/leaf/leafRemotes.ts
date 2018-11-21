'use strict';

import * as vscode from 'vscode';
import { LEAF_IDS } from '../identifiers';
import { TreeItem2, TreeDataProvider2, ACTION_LABELS, showMultiStepInputBox, showMultiStepQuickPick, toItems } from '../uiUtils';
import { RemoteQuickPickItem, RemoteTreeItem } from './leafUiComponents';
import { LeafManager } from './leafCore';

/**
 * Remotes view and commands
 */
export class LeafRemotesView extends TreeDataProvider2 {
	private static readonly validProtocols: ReadonlyArray<string> = ['http', 'https', 'file'];

	constructor() {
		super();
		this.createCommand(LEAF_IDS.COMMANDS.REMOTES.REFRESH, this.refresh);
		this.createCommand(LEAF_IDS.COMMANDS.REMOTES.ADD, this.addRemote);
		this.createCommand(LEAF_IDS.COMMANDS.REMOTES.REMOVE, this.removeRemote);
		this.createCommand(LEAF_IDS.COMMANDS.REMOTES.ENABLE, node => this.enableRemote(node));
		this.createCommand(LEAF_IDS.COMMANDS.REMOTES.DISABLE, node => this.enableRemote(node, false));
		this.disposables.push(vscode.window.registerTreeDataProvider(LEAF_IDS.VIEWS.REMOTES, this));
	}

	private async enableRemote(node: RemoteTreeItem | RemoteQuickPickItem | undefined, enabled: boolean = true) {
		if (!node) {
			node = await this.askRemoteToUser(`${enabled ? "Enable" : "Disable"} Leaf remote`);
		}
		if (node) {
			await LeafManager.INSTANCE.enableRemote(node.id, enabled);
			this.refresh();
		}
	}

	private async addRemote() {
		let remotes = await LeafManager.INSTANCE.requestRemotes();
		let title = "Add new remote";
		let step = 1;
		let totalSteps = 2;

		// Alias
		let alias = await showMultiStepInputBox(title, step++, totalSteps,
			"Remote Alias",
			"Please enter an alias for the new remote",
			value => this.validateAlias(remotes, value));
		if (!alias) {
			// Operation canceled by user
			return;
		}

		// URL
		let url = await showMultiStepInputBox(title, step++, totalSteps,
			"Remote URL",
			"Please enter the url of the new remote",
			this.validateUrl);
		if (!url) {
			// Operation canceled by user
			return;
		}

		// Launch task and refresh
		await LeafManager.INSTANCE.addRemote(alias, url);
		this.refresh();
	}

	private validateAlias(remotes: any, value: string) {
		if (value in remotes) {
			return 'This remote alias is already used';
		}
		if (value.includes(' ')) {
			return 'The remote alias cannot contains a space';
		}
		return undefined;
	}

	private validateUrl(value: string) {
		let uri = vscode.Uri.parse(value);
		if (LeafRemotesView.validProtocols.indexOf(uri.scheme) === -1) {
			return `The possible protocols are: ${LeafRemotesView.validProtocols.join(', ')}`;
		}
		if (!uri.authority && !uri.path) {
			return 'This url is malformed';
		}
		return undefined;
	}

	private async removeRemote(node: RemoteTreeItem | RemoteQuickPickItem | undefined) {
		if (!node) {
			node = await this.askRemoteToUser("Remove Leaf remote");
		}
		if (node && ACTION_LABELS.REMOVE === await vscode.window.showWarningMessage("Do you really want to permanently delete this remote?", ACTION_LABELS.CANCEL, ACTION_LABELS.REMOVE)) {
			await LeafManager.INSTANCE.removeRemote(node.id);
			this.refresh();
		}
	}

	private async askRemoteToUser(title: string): Promise<RemoteQuickPickItem | undefined> {
		let remotes = await LeafManager.INSTANCE.requestRemotes();
		let items = toItems(remotes, RemoteQuickPickItem);
		return showMultiStepQuickPick(title, undefined, undefined, "Please select the remote", items);
	}

	async getRootElements(): Promise<TreeItem2[]> {
		let remotes = await LeafManager.INSTANCE.requestRemotes();
		return toItems(remotes, RemoteTreeItem);
	}
}
