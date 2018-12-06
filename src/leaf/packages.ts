'use strict';

import { LEAF_IDS } from '../identifiers';
import { TreeItem2, TreeDataProvider2, showMultiStepQuickPick, showMultiStepInputBox, toItems } from '../uiUtils';
import { PackageTreeItem, PackageQuickPickItem, ProfileQuickPickItem } from './uiComponents';
import { LeafManager } from './core';

/**
 * Packages view and commands
 */
export class LeafPackagesView extends TreeDataProvider2 {

	public constructor() {
		super(LEAF_IDS.VIEWS.PACKAGES);
		this.createCommand(LEAF_IDS.COMMANDS.PACKAGES.REFRESH, this.fetch);
		this.createCommand(LEAF_IDS.COMMANDS.PACKAGES.ADD_TO_PROFILE, this.addToProfile);
	}

	/**
	 * Fetch remotes then refresh the view
	 */
	private async fetch() {
		await LeafManager.getInstance().fetchRemote();
		this.refresh();
	}

	/**
	 * Add package to a profile :
	 * - Ask user to select a package (if not already selected in tree)
	 * - Ask destination profile (if some exist)
	 * - Ask a profile name if the user select "New profile" in the previous step or if the is no profiles
	 */
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
		let profiles = await LeafManager.getInstance().getProfiles();
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
			await LeafManager.getInstance().createProfile(newProfileName, selectedPackage.id);
			this.refresh();
		} else if (result.id in profiles) {
			// Existing profile
			await LeafManager.getInstance().addPackagesToProfile([selectedPackage.id], result.id, result.properties);
			this.refresh();
		}
	}

	/**
	 * Ask user to seelect a package in combo
	 */
	private async askForPackage(title: string): Promise<PackageQuickPickItem | undefined> {
		// Do not await. We want showMultiStepQuickPick to handle this long running operation while showing a busy box.
		let itemsPromise = LeafManager.getInstance()
			.requestMasterPackages()
			.then(packs => toItems(packs, PackageQuickPickItem));
		return showMultiStepQuickPick(title, 1, 2, "Please select the package to add", itemsPromise);
	}

	/**
	 * Ask user to select a profile in combo
	 */
	private async askForProfile(
		title: string, node: PackageTreeItem | PackageQuickPickItem,
		profiles: any | undefined
	): Promise<ProfileQuickPickItem | undefined> {
		let createProfileItem: ProfileQuickPickItem = {
			label: "Create new profile...",
			description: "You will be asked for a profile name",
			details: undefined,
			id: "",
			properties: {},
			compareTo: value => 0
		};

		// If no profiles exist, let return the "Create profile" item right now
		if (!profiles || Object.keys(profiles).length === 0) {
			return createProfileItem;
		}

		// There is some profile, let's create corresponding items
		let profileItems = toItems(profiles, ProfileQuickPickItem);
		// Add "create profile" item
		profileItems.push(createProfileItem);

		// Ask user to pick up one
		return showMultiStepQuickPick(title, node instanceof PackageQuickPickItem ? 2 : 1, 2,
			`Please select the target profile for package ${node.id}`, profileItems);
	}

	/**
	 * Ask user a profile name
	 */
	private async askForProfileName(title: string, profiles: any | undefined): Promise<string | undefined> {
		return showMultiStepInputBox(title, 3, 3,
			"Press enter to use default unique profile name",
			"Please enter the name of the profile to create",
			(value: string) => {
				if (profiles && value in profiles) {
					return 'This profile name is already used';
				}
				if (value.includes(' ')) {
					return 'the profile name cannot containts a space';
				}
				return undefined;
			});
	}

	/**
	 * Return roots elements in package view
	 */
	async getRootElements(): Promise<TreeItem2[]> {
		let packs = await LeafManager.getInstance().requestMasterPackages();
		return toItems(packs, PackageTreeItem);
	}
}
