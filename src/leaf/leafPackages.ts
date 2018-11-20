'use strict';

import * as vscode from 'vscode';
import { IDS } from '../identifiers';
import { TreeItem2, TreeDataProvider2 } from './leafUiUtils';

export class LeafPackagesDataProvider extends TreeDataProvider2 {

	constructor(context: vscode.ExtensionContext) {
		super();
		this.createCommand(IDS.COMMANDS.PACKAGES.REFRESH, context, this.fetch);
		this.createCommand(IDS.COMMANDS.PACKAGES.ADD_TO_PROFILE, context, this.addToProfile);
	}

	private createCommand(id: string, context: vscode.ExtensionContext, cb: (...args: any[]) => any) {
		let disposable = vscode.commands.registerCommand(id, cb, this);
		context.subscriptions.push(disposable);
	}

	private async fetch() {
		await this.leafManager.fetchRemote();
		this.refresh();
	}

	private async addToProfile(node: LeafPackage | undefined) {
		if (!node) {
			throw Error("No package selected");
		}
		let profiles = await this.leafManager.listProfiles();
		let profileItems: ProfileQuickPickItem[] = [];
		for (let profileId in profiles) {
			profileItems.push(new ProfileQuickPickItem(profileId, profiles[profileId]));
		}
		profileItems.sort((itemA, itemB) => {
			if (itemA.properties.current) {
				return -1;
			}
			if (itemB.properties.current) {
				return 1;
			}
			if (itemA.id < itemB.id) { return -1; }
			if (itemA.id > itemB.id) { return 1; }
			return 0;
		});
		let newProfileItem = {
			label: "Create new profile...",
			description: "You will be asked for a profile name",
			detail: undefined,
			id: "",
			properties: {}
		};
		profileItems.push(newProfileItem);
		let result = await vscode.window.showQuickPick(profileItems, {
			placeHolder: `Please select the target profile for package ${node.packId}`,
			canPickMany: false
		});
		if (result) {
			if (result === newProfileItem) {
				let newProfileName = await vscode.window.showInputBox({
					prompt: "Please enter the name of the profile to create",
					placeHolder: "Press enter to use default unique profile name",
					validateInput: (value: string) => {
						if (value in profiles) {
							return 'This profile name is already used';
						}
						if (value.includes(' ')) {
							return 'the profile name cannot containts a space';
						}
						return undefined;
					}
				});
				if (newProfileName !== undefined) {
					if (newProfileName.length === 0) {
						newProfileName = undefined;
					}
					await this.leafManager.createProfile(newProfileName, node.packId);
					this.refresh();
				}
			} else if (result.id in profiles) {
				await this.leafManager.addPackageToProfile(node.packId, result.id, result.properties);
				this.refresh();
			}
		}
	}

	async getRootElements(): Promise<TreeItem2[]> {
		let out = [];
		let installedPacks = await this.leafManager.requestInstalledPackages() as any;
		for (let packId in installedPacks) {
			let pack = installedPacks[packId];
			if (pack.info.master) {
				out.push(new LeafPackage(packId, pack, true));
			}
		}
		let availPacks = await this.leafManager.requestAvailablePackages() as any;
		for (let packId in availPacks) {
			let pack = availPacks[packId];
			if (pack.info.master && !(packId in installedPacks)) {
				out.push(new LeafPackage(packId, pack, false));
			}
		}
		out.sort((packA, packB) => {
			if (packA.packId < packB.packId) { return -1; }
			if (packA.packId > packB.packId) { return 1; }
			return 0;
		});
		return out;
	}
}

class LeafPackage extends TreeItem2 {
	constructor(
		public readonly packId: any,
		public readonly pack: any,
		public readonly installed = false
	) {
		super(
			packId,
			packId,
			pack.info.description,
			vscode.TreeItemCollapsibleState.None,
			installed ? IDS.VIEW_ITEMS.PACKAGES.INSTALLED : IDS.VIEW_ITEMS.PACKAGES.AVAILABLE,
			installed ? "PackageInstalled.svg" : "PackageAvailable.svg");
	}

	public async getChildren(): Promise<TreeItem2[]> {
		return [];
	}
}

class ProfileQuickPickItem implements vscode.QuickPickItem {
	public label: string;
	public description?: string;
	public detail?: string;
	public id: string;
	public properties: any;
	constructor(id: string, properties: any) {
		this.label = id;
		this.description = properties.current ? "[Current]" : undefined;
		let nbPackages = properties.packages ? properties.packages.length : 0;
		let nbEnv = properties.env ? Object.keys(properties.env).length : 0;
		this.detail = `${nbPackages} packages - ${Object.keys(nbEnv).length} env vars`;
		this.id = id;
		this.properties = properties;
	}
}
