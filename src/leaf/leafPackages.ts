'use strict';

import * as vscode from 'vscode';
import { LEAF_IDS } from '../identifiers';
import { TreeItem2, TreeDataProvider2, showMultiStepQuickPick, showMultiStepInputBox, toItems } from '../uiUtils';
import { PackageTreeItem, PackageQuickPickItem, ProfileQuickPickItem } from './leafUiComponents';
import { LeafManager } from './leafCore';

/**
 * Packages view and commands
 */
export class LeafPackagesView extends TreeDataProvider2 {

	public constructor() {
		super();
		this.createCommand(LEAF_IDS.COMMANDS.PACKAGES.REFRESH, this.fetch);
		this.createCommand(LEAF_IDS.COMMANDS.PACKAGES.ADD_TO_PROFILE, this.addToProfile);
		this.disposables.push(vscode.window.registerTreeDataProvider(LEAF_IDS.VIEWS.PACKAGES, this));
	}

	private async fetch() {
		await LeafManager.INSTANCE.fetchRemote();
		this.refresh();
	}

	private async addToProfile(selectedPackage: PackageTreeItem | PackageQuickPickItem | undefined) {
		let title = "Add package to profile";

		// Package (from selection or combo)
		if (!selectedPackage) {
			selectedPackage = await this.askForPackage(title);
			if (!selectedPackage) {
				return; // User cancellation
			}
		}

		// Profile
		let profiles = await LeafManager.INSTANCE.requestProfiles();
		let result = await this.askForProfile(title, selectedPackage, profiles);
		if (!result) {
			return; // User cancellation
		}

		if (!result.id) {
			// New profile
			let newProfileName = await this.askForProfileName(title, profiles);
			if (newProfileName === undefined) {
				return; // User cancellation
			}

			if (newProfileName.length === 0) {
				newProfileName = undefined; // "" is a valid return for default profile name
			}
			await LeafManager.INSTANCE.createProfile(newProfileName, selectedPackage.id);
			this.refresh();
		} else if (result.id in profiles) {
			// Existing profile
			await LeafManager.INSTANCE.addPackageToProfile(selectedPackage.id, result.id, result.properties);
			this.refresh();
		}
	}

	private async askForPackage(title: string): Promise<PackageQuickPickItem | undefined> {
		// Do not await. We want showMultiStepQuickPick to handle this long running operation while showing a busy box.
		let itemsPromise = LeafManager.INSTANCE
			.requestMasterPackages()
			.then(packs => toItems(packs, PackageQuickPickItem));
		return showMultiStepQuickPick(title, 1, 2, "Please select the package to add", itemsPromise);
	}

	private async askForProfile(
		title: string, node: PackageTreeItem | PackageQuickPickItem,
		profiles: any
	): Promise<ProfileQuickPickItem | undefined> {

		let profileItems = toItems(profiles, ProfileQuickPickItem);

		// Add "create profile" item
		profileItems.push({
			label: "Create new profile...",
			description: "You will be asked for a profile name",
			details: undefined,
			id: "",
			properties: {},
			compareTo: value => 0
		});

		return showMultiStepQuickPick(title, node instanceof PackageQuickPickItem ? 2 : 1, 2,
			`Please select the target profile for package ${node.id}`, profileItems);
	}

	private async askForProfileName(title: string, profiles: any): Promise<string | undefined> {
		return showMultiStepInputBox(title, 3, 3,
			"Press enter to use default unique profile name",
			"Please enter the name of the profile to create",
			(value: string) => {
				if (value in profiles) {
					return 'This profile name is already used';
				}
				if (value.includes(' ')) {
					return 'the profile name cannot containts a space';
				}
				return undefined;
			});
	}

	async getRootElements(): Promise<TreeItem2[]> {
		let packs = await LeafManager.INSTANCE.requestMasterPackages();
		return toItems(packs, PackageTreeItem);
	}
}
