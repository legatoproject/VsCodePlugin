'use strict';

import { Command, View } from '../../commons/identifiers';
import { TreeItem2, TreeDataProvider2, showMultiStepQuickPick, showMultiStepInputBox, toItems, createActionAsQuickPickItem } from '../../commons/uiUtils';
import { PackageTreeItem, PackageQuickPickItem, ProfileQuickPickItem, TagQuickPickItem, FilterContainerTreeItem, FilterTreeItem, AvailablePackagesContainerTreeItem, InstalledPackagesContainerTreeItem, LeafPackageContext } from './uiComponents';
import { LeafManager } from '../api/core';
import * as vscode from 'vscode';
import { LeafBridgeElement } from '../../commons/utils';
import { Mementos } from '../../commons/memento';
import { spawn } from 'child_process';
import { getDefaultCwd } from '../../commons/files';

/**
 * Packages view and commands
 */
export class LeafPackagesView extends TreeDataProvider2 {

	// Memento handle to save filter state (checked or not)
	private readonly memento = Mementos.Leaf.Packages.Filters;

	// Builtin and user filters
	private readonly builtinFilters: ReadonlyArray<BuiltinFilter> = [
		new BuiltinFilter("master", (_packId, packProperties) => packProperties.info.master)
	];
	private readonly userFilters: UserFilter[] = [];

	// Containers in the tree
	private readonly filterContainerItem = new FilterContainerTreeItem(this.builtinFilters, this.userFilters);
	private readonly availPkgContainerItem = new AvailablePackagesContainerTreeItem(this.leafManager, packs => this.filterPackages(packs));
	private readonly instPkgContainerItem = new InstalledPackagesContainerTreeItem(this.leafManager, packs => this.filterPackages(packs));

	/**
	 * Register TreeDataProvider
	 * Create commands
	 * Listen to packages changes
	 */
	public constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly leafManager: LeafManager
	) {
		super(View.LeafPackages);
		this.loadFilters();
		this.leafManager.packages.addListener(this.refresh, this);
		this.createCommand(Command.LeafPackagesAddFilter, this.addFilter);
		this.createCommand(Command.LeafPackagesRemoveFilter, this.removeFilter);
		this.createCommand(Command.LeafPackagesAddToProfile, this.addToProfile);
		this.createCommand(Command.LeafPackagesToggleFilter, this.onFilterClicked);
		this.createCommand(Command.LeafPackagesGoToDocumentation, this.goToDocumentation);
		this.createCommand(Command.LeafProfileAdd, this.addProfile, this);
	}

	/**
	 * Load filters and ther state from global extension state
	 */
	private loadFilters() {
		// Load builtin filters
		let builtinFiltersSavedStates = this.memento.Builtin.get(this.context);
		for (let filterValue of Object.keys(builtinFiltersSavedStates)) {
			let correspondingBuiltinFilter = this.builtinFilters.find(pf => pf.value === filterValue);
			if (correspondingBuiltinFilter) {
				correspondingBuiltinFilter.setChecked(builtinFiltersSavedStates[filterValue]);
			}
		}

		// Load filters
		let filters = this.memento.User.get(this.context);
		for (let filterValue of Object.keys(filters)) {
			let filter = this.toFilter(filterValue, filters[filterValue]);
			if (filter) {
				this.userFilters.push(filter);
			}
		}
	}

	/**
	 * Convert filter array to map with isChecked as value
	 */
	private toStatesMap(filters: ReadonlyArray<Filter>) {
		return filters.reduce((previous: { [key: string]: boolean }, current: Filter) => {
			previous[current.value] = current.isChecked();
			return previous;
		}, {});
	}

	/**
	 * Save built-in filters and ther state to workspace extension memento
	 */
	private async saveBuiltinFilters() {
		this.memento.Builtin.update(this.context, this.toStatesMap(this.builtinFilters));
	}

	/**
	 * Save user filters and ther state to workspace extension memento
	 */
	private async saveUserFilters() {
		this.memento.User.update(this.context, this.toStatesMap(this.userFilters));
	}

	/**
	 * Add filter
	 * User can use '@' to specify tags or anything else as a regex
	 */
	private async addFilter() {
		// Create quick pick
		let box = vscode.window.createQuickPick<TagQuickPickItem>();
		box.placeholder = "'regex' or @'tag'";

		// Create tag quick pick items
		let tags: { [key: string]: number } = await this.leafManager.tags.get();
		let tagItems = Object.keys(tags).map(tag => new TagQuickPickItem(tag, undefined, tags[tag]));

		// Get packages
		let allPacks = await this.leafManager.packages.get();

		// Update items and title on value change
		let boxValueChangedListener = async (value: string) => {
			let newFilter = this.toFilter(value);
			if (newFilter || value.length === 0) {
				if (value.startsWith('@')) {
					box.items = tagItems;
				} else if (value.length > 0) {
					box.items = [];
				}
				let availCount = this.countMatchingPackages(allPacks.availablePackages, newFilter);
				let instCount = this.countMatchingPackages(allPacks.installedPackages, newFilter);
				box.title = `Add filter (regex or leaf tag): ${availCount} package${availCount === 1 ? '' : 's'}
						 available and ${instCount} package${instCount === 1 ? '' : 's'} installed`;
				// Filter input contains invalid regex
			} else if (!newFilter) {
				box.title = 'Add filter (regex or leaf tag): Input contains invalid regex';
			}
		};
		box.onDidChangeValue(boxValueChangedListener);
		boxValueChangedListener(box.value); // Set initial title

		// Add filter on user acceptance
		box.onDidAccept(() => {
			let result = box.selectedItems.length > 0 ? box.selectedItems[0].label : box.value;
			let filter = this.toFilter(result);
			if (filter) {
				// Only add distinct filters
				let distinctUserFilter = this.userFilters.findIndex(x => x.value === result) === -1;
				let distinctBuiltinFilter = this.builtinFilters.findIndex(x => x.value === result) === -1;
				if (distinctUserFilter && distinctBuiltinFilter) {
					this.userFilters.push(filter);
					this.refresh();
					this.saveUserFilters();
				}
			} else if (result.length > 0) {
				vscode.window.showErrorMessage(`Add filter: Input "${result}" contained invalid regex 
					and was not added`);
			}
			box.hide();
		});

		// Show quick pick
		box.show();
	}

	/**
	 * Create a Filter from a filter value, set it's state
	 */
	private toFilter(value: string, checked: boolean = true): RegexFilter | TagFilter | undefined {
		let out = undefined;
		try {
			// @ts-ignore only checks if regex is valid, value is never used
			const testRegex = new RegExp(value);
		} catch {
			return out;
		}

		if (value.startsWith('@')) {
			out = new TagFilter(value);
			out.setChecked(checked);
		} else if (value.length > 0) {
			out = new RegexFilter(value);
			out.setChecked(checked);
		}
		return out;
	}

	/**
	 * @param packs the packages map to filter
	 * @param filter the currently typed filter or undefined if nothing is typed
	 * @return count of matching packages
	 */
	private countMatchingPackages(packs: any, filter?: RegexFilter | TagFilter): number {
		// Apply existing filters
		packs = this.filterPackages(packs);

		if (filter) {
			// If the user start to type some filter, apply it
			return Object.keys(packs).filter(packId => filter.match(packId, packs[packId])).length;
		} else {
			// If not, just return the packages filtered with existing filters
			return Object.keys(packs).length;
		}
	}

	/**
	 * Remove filter from filter list
	 */
	private async removeFilter(item: UserFilter | undefined) {
		if (!item) {
			// No selection, get the removing filter from user input
			const title = "Select filter to remove";
			item = await this.askForFilter(title);
			if (!item) {
				return; // User cancelation
			}
		}
		this.userFilters.splice(this.userFilters.indexOf(item), 1);
		this.refresh();
		return this.saveUserFilters();
	}

	/**
	 * Add package to a profile:
	 * - Ask user to select a package (if not already selected in tree)
	 * - Ask destination profile (if some exist)
	 * - Ask a profile name if the user select "New profile" in the previous step or if the is no profiles
	 */
	private async addToProfile(selectedPackage: PackageTreeItem | PackageQuickPickItem | undefined): Promise<void> {
		// Check that there is an open workspace before executing this function
		if (getDefaultCwd() === "") {
			vscode.window.showWarningMessage(
				"There is no workspace folder. Please open a workspace folder first.");
			return;
		}

		let title = "Add package to profile";
		// Package (from selection or combo)
		if (!selectedPackage) {
			selectedPackage = await this.askForFilterPackage(title);
			if (!selectedPackage) {
				return; // User cancellation
			}
		}

		// Profile
		let profiles = await this.leafManager.profiles.get();
		let result = await this.askForProfile(title, selectedPackage, profiles);
		if (!result) {
			return; // User cancellation
		}


		if (result.id && profiles && result.id in profiles) {
			// Existing profile
			return this.leafManager.addPackagesToProfile(result.id, selectedPackage.packId);
		} else {
			// New profile
			let newProfileName = await this.askForProfileName(title, profiles);
			if (newProfileName === undefined) {
				return; // User cancellation
			}

			if (newProfileName.length === 0) {
				newProfileName = undefined; // "" is a valid return for default profile name
			}
			return this.leafManager.createProfile(newProfileName, selectedPackage.packId);
		}
	}

	private async goToDocumentation(selectedPackage: PackageTreeItem | PackageQuickPickItem | undefined) {
		let title = "Open the documentation";

		// Package (from selection or combo)
		if (!selectedPackage) {
			selectedPackage = await this.askForPackage(title);
			if (!selectedPackage) {
				return; // User cancellation
			}
		}

		if (selectedPackage && selectedPackage.properties.info && selectedPackage.properties.info.documentation) {
			//no need of sequencer just to open a browser
			spawn('xdg-open', [selectedPackage.properties.info.documentation]);
		} else {
			vscode.window.showWarningMessage(`No documentation found for the package ${selectedPackage.label}`);
		}
	}

	/**
	 * Ask user to select a filter to remove
	 */
	private async askForFilter(title: string): Promise<Filter | undefined> {
		let items = this.memento.User.get(this.context);
		let filters = Object.keys(items);
		let filterItems: any[] = [];
		filters.map(filter => {
			filterItems.push(this.toFilter(filter, items[filter]));
		});
		return showMultiStepQuickPick(title, 1, 1, "Please select the filter", filterItems);
	}

	/**
	 * Ask user to select a package after filtering it with the current condition
	 */
	private async askForFilterPackage(title: string): Promise<PackageQuickPickItem | undefined> {
		let filterPackage = this.filterPackages(await this.leafManager.mergedPackages.get());
		let items = toItems(filterPackage, PackageQuickPickItem);
		return showMultiStepQuickPick(title, 1, 2, "Please select the package", items);
	}

	/**
	 * Ask user to select a package in combo
	 */
	private async askForPackage(title: string): Promise<PackageQuickPickItem | undefined> {
		// Do not await. We want showMultiStepQuickPick to handle this long running operation while showing a busy box.
		let itemsPromise = this.leafManager.mergedPackages.get().then(packs => toItems(packs, PackageQuickPickItem));
		return showMultiStepQuickPick(title, 1, 2, "Please select the package", itemsPromise);
	}

	/**
	 * Ask user to select a profile in combo
	 */
	private async askForProfile(
		title: string, node: PackageTreeItem | PackageQuickPickItem,
		profiles: LeafBridgeElement
	): Promise<ProfileQuickPickItem | undefined> {
		let createProfileItem = createActionAsQuickPickItem(
			"Create new profile...",
			"You will be asked for a profile name");

		// If no profiles exist, let return the "Create profile" item right now
		if (Object.keys(profiles).length === 0) {
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
	 * Add a blank profile
	 */
	private async addProfile() {
		// New profile
		let newProfileName = await this.askForBlankProfileName();
		if (newProfileName === undefined) {
			return; // User cancellation
		}
		if (newProfileName.length === 0) {
			return; // User cancellation
		}
		return this.leafManager.createBlankProfile(newProfileName);
	}

	/**
	 * Ask user a profile name
	 */
	private async askForBlankProfileName(): Promise<string | undefined> {
		let title = "Create a blank profile";
		let profiles = await this.leafManager.profiles.get();
		return showMultiStepInputBox(title, undefined, undefined,
			"Please enter the name of the profile to create",
			undefined,
			(value: string) => {
				if (profiles && value in profiles) {
					return 'This profile name already exists';
				}
				if (value.includes(' ')) {
					return 'The profile name cannot contain spaces';
				}
				return undefined;
			});
	}

	/**
	 * Called when the user click on a filter
	 */
	private onFilterClicked(item: Filter) {
		let newValue = !item.isChecked();
		item.setChecked(newValue);
		this.refresh();
		if (item instanceof BuiltinFilter) {
			this.saveBuiltinFilters();
		} else {
			this.saveUserFilters();
		}
	}

	/**
	 * Return roots elements in package view
	 */
	protected async getRootElements(): Promise<TreeItem2[]> {
		await this.availPkgContainerItem.refresh();
		await this.instPkgContainerItem.refresh();
		return [this.filterContainerItem, this.availPkgContainerItem, this.instPkgContainerItem] as TreeItem2[];
	}

	/**
	 * @return filtered packages
	 */
	public filterPackages(packs: LeafBridgeElement): LeafBridgeElement {
		let filteredPacks: any = {};
		Object.keys(packs) // For all packages
			.filter(packId => this.matchCheckedFilters(packId, packs[packId]))
			.forEach(packId => filteredPacks[packId] = packs[packId]);
		return filteredPacks;
	}

	/**
	 * Return true if the given package is matching all the enabled filters
	 */
	private matchCheckedFilters(packId: string, packProperties: any) {
		return (this.builtinFilters as ReadonlyArray<Filter>).concat(this.userFilters)
			.filter(filter => filter.isChecked()) // Use only checked filters
			.every(filter => filter.match(packId, packProperties));
	}

}

/**
 * Parent of filters (3 subclasses)
 */
abstract class Filter extends FilterTreeItem {
	public abstract match(packId: string, packProperties: any): boolean;
}

/**
 * Theses filters are not removables
 */
class BuiltinFilter extends Filter {
	constructor(value: string, private readonly predicate: (packId: string, packProperties: any) => boolean, checked = true) {
		super(value, LeafPackageContext.PackagesBuiltinFilter);
		this.label = `[${value}]`;
		this.setChecked(checked);
	}
	public match(packId: string, packProperties: any): boolean {
		return this.predicate(packId, packProperties);
	}
}

/**
 * Abstract parent of user filters
 */
abstract class UserFilter extends Filter {
	constructor(value: string) {
		super(value, LeafPackageContext.PackagesUserFilter);
	}

	/**
	 * Abstract method to check if this filter match the given package
	 * @param packId the id of the package to test
	 * @param packProperties the properties of the package to test
	 * @returns true if this filter match the package
	 */
	public abstract match(packId: string, packProperties: any): boolean;
}

/**
 * Regex filter
 */
class RegexFilter extends UserFilter {
	constructor(value: string) {
		super(value);
	}

	/**
	 * Try to match packid with regex value. If not, try to match description
	 */
	public match(packId: string, packProperties: any): boolean {
		// It's a regex, lets look at the pack id
		if (packId.search(this.value) > -1) {
			return true;
		}
		// If not, let's look at the description
		if (packProperties.info.description) {
			return packProperties.info.description.search(this.value) > -1;
		}

		// No match
		return false;
	}
}

/**
 * Tag filter
 */
class TagFilter extends UserFilter {
	constructor(value: string) {
		super(value);
	}

	/**
	 * Match package if one of it's tags start with the filter value
	 */
	public match(_packId: string, packProperties: any): boolean {
		return packProperties.info.tags.some((tag: string) => tag.startsWith(this.value.substring(1)));
	}
}
