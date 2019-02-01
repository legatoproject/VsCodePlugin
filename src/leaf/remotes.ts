'use strict';

import * as vscode from 'vscode';
import * as fs from 'fs';
import { View, Command } from '../commons/identifiers';
import { TreeItem2, TreeDataProvider2, ACTION_LABELS, showMultiStepInputBox, showMultiStepQuickPick, toItems } from '../commons/uiUtils';
import { RemoteQuickPickItem, RemoteTreeItem } from './uiComponents';
import { LeafManager, LeafEvent } from './core';


/**
 * Remotes view and commands
 */
export class LeafRemotesView extends TreeDataProvider2 {

	/**
	 * Listen to remote changes
	 * Create commands
	 */
	constructor(private readonly leafManager : LeafManager) {
		super(View.LeafRemotes);
		this.leafManager.addListener(LeafEvent.RemotesChanged, this.refresh, this);
		this.createCommand(Command.LeafRemotesAdd, this.addRemote);
		this.createCommand(Command.LeafRemotesRemove, this.removeRemote);
		this.createCommand(Command.LeafRemotesEnable, node => this.enableRemote(node));
		this.createCommand(Command.LeafRemotesDisable, node => this.enableRemote(node, false));
	}

	/**
	 * Enable a remote
	 * Ask user to select one if there is no selection in the tree
	 */
	private async enableRemote(node: RemoteTreeItem | RemoteQuickPickItem | undefined, enabled: boolean = true) {
		if (!node) {
			node = await this.askRemoteToUser(`${enabled ? "Enable" : "Disable"} Leaf remote`);
		}
		if (node) {
			this.leafManager.enableRemote(node.id, enabled);
		}
	}

	/**
	 * Add a new remote
	 * Ask user for alias and url the add it
	 */
	private async addRemote() {
		let remotes = await this.leafManager.getRemotes();
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

		// Launch task
		this.leafManager.addRemote(alias, url);
	}

	/**
	 * Validate alias :
	 * - no spaces
	 * - no already used profile name
	 */
	private validateAlias(remotes: any, value: string) {
		if (value in remotes) {
			return 'This remote alias is already used';
		}
		if (value.includes(' ')) {
			return 'The remote alias cannot contains a space';
		}
		return undefined;
	}

	/**
	 * Validate url
	 * - Check if uri has a scheme and authority
	 * - Check if uri has a no scheme but exist in filesystem (local path)
	 */
	private validateUrl(value: string) {
		// Valid URL
		let uri = vscode.Uri.parse(value);
		if (uri.scheme) {
			// Check valid URL
			if (uri.authority) {
				return undefined;
			}
		} else {
			// Test if local file
			if (fs.existsSync(value) && fs.statSync(value).isFile()) {
				return undefined;
			}
		}
		return "Enter a valid URL or the path to an existing local json file";
	}

	/**
	 * Remove remote
	 * Ask user to select one if there is no selection in the tree
	 */
	private async removeRemote(node: RemoteTreeItem | RemoteQuickPickItem | undefined) {
		if (!node) {
			node = await this.askRemoteToUser("Remove Leaf remote");
		}
		if (node && ACTION_LABELS.REMOVE === await vscode.window.showWarningMessage("Do you really want to permanently delete this remote?", ACTION_LABELS.CANCEL, ACTION_LABELS.REMOVE)) {
			this.leafManager.removeRemote(node.id);
		}
	}

	/**
	 * Ask user to select a remote from existing ones
	 */
	private async askRemoteToUser(title: string): Promise<RemoteQuickPickItem | undefined> {
		let remotes = await this.leafManager.getRemotes();
		let items = toItems(remotes, RemoteQuickPickItem);
		return showMultiStepQuickPick(title, undefined, undefined, "Please select the remote", items);
	}

	/**
	 * Return root elements in remotes tree view
	 */
	async getRootElements(): Promise<TreeItem2[]> {
		let remotes = await this.leafManager.getRemotes();
		return toItems(remotes, RemoteTreeItem);
	}
}
