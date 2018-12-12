'use strict';

import { LEAF_IDS } from '../identifiers';
import { TreeItem2, TreeDataProvider2, showMultiStepQuickPick, showMultiStepInputBox, toItems } from '../uiUtils';
import { PackageTreeItem, PackageQuickPickItem, ProfileQuickPickItem, TagQuickPickItem, FilterContainerTreeItem, FilterTreeItem, PackagesContainerTreeItem } from './uiComponents';
import { LeafManager, LEAF_EVENT } from './core';
import * as vscode from 'vscode';

/**
 * Packages view and commands
 */
export class LeafPackagesView extends TreeDataProvider2 {

	private static readonly FILTERS_MEMENTO_ID = "leaf.packages.filters";
	private static readonly PERMANENT_FILTERS_MEMENTO_ID = "leaf.packages.filters";
	public readonly permanentFilters: Filter[] = [PERMANENT_FILTERS.MASTER, PERMANENT_FILTERS.AVAILABLE, PERMANENT_FILTERS.INSTALLED];
	public readonly filters: Filter[] = [];
	private readonly filterContainerItem = new FilterContainerTreeItem(this.permanentFilters, this.filters);
	private readonly packagesContainerItem = new PackagesContainerTreeItem();

	/**
	 * Register TreeDataProvider
	 * Create commands
	 * Listen to packages changes
	 */
	public constructor() {
		super(LEAF_IDS.VIEWS.PACKAGES);
		this.loadFilters();
		this.packagesContainerItem.getChildren = async () => this.getPackagesItems();
		LeafManager.getInstance().addListener(LEAF_EVENT.leafPackagesChanged, this.refresh, this);
		this.createCommand(LEAF_IDS.COMMANDS.PACKAGES.ADD_FILTER, this.addFilter);
		this.createCommand(LEAF_IDS.COMMANDS.PACKAGES.REMOVE_FILTER, this.removeFilter);
		this.createCommand(LEAF_IDS.COMMANDS.PACKAGES.ADD_TO_PROFILE, this.addToProfile);
		this.createCommand(LEAF_IDS.COMMANDS.PACKAGES.TOGGLE_FILTER, this.onFilterClicked);
	}

	/**
	 * Load filters and ther state from global extension state
	 */
	private loadFilters() {
		// Load permanent filters
		let permanentFilters: { [key: string]: boolean } = this.loadFromMemento(LeafPackagesView.FILTERS_MEMENTO_ID) as { [key: string]: boolean };
		if (permanentFilters) {
			for (let filterValue of Object.keys(permanentFilters)) {
				if (filterValue in PERMANENT_FILTERS) {
					PERMANENT_FILTERS[filterValue].setChecked(permanentFilters[filterValue]);
				}
			}
		}

		// Load filters
		let filters: { [key: string]: boolean } = this.loadFromMemento(LeafPackagesView.FILTERS_MEMENTO_ID) as { [key: string]: boolean };
		if (filters) {
			for (let filterValue of Object.keys(filters)) {
				let filter = this.toFilter(filterValue, filters[filterValue]);
				if (filter) {
					this.filters.push(filter);
				}
			}
		}
	}

	/**
	 * Load filters and states from memento using the given memento id
	 */
	private loadFromMemento(mementoId: string): { [key: string]: boolean } {
		return LeafManager.getInstance().context.workspaceState.get(mementoId) as { [key: string]: boolean };
	}

	/**
	 * Save filters and ther state from global extension state
	 */
	private async saveFilters() {
		// Save permanent filters states
		this.saveToMemento(LeafPackagesView.PERMANENT_FILTERS_MEMENTO_ID, this.permanentFilters);

		// Save user filters and states
		this.saveToMemento(LeafPackagesView.FILTERS_MEMENTO_ID, this.filters);
	}

	/**
	 * Save filters and states from memento using the given memento id
	 */
	private saveToMemento(mementoId: string, filters: Array<Filter>) {
		let filtersMap = filters.reduce((previous: { [key: string]: boolean }, current: Filter) => {
			previous[current.value] = current.isChecked();
			return previous;
		}, {});
		LeafManager.getInstance().context.workspaceState.update(mementoId, filtersMap);
	}

	/**
	 * Add filter
	 * User can use '@' to specify tags or anything else as a regex
	 */
	private async addFilter() {
		// Create quick pick
		let box: vscode.QuickPick<TagQuickPickItem> = vscode.window.createQuickPick();
		box.placeholder = "regex or '@tag'";

		// Create tag quick pick items
		let tags: { [key: string]: number } = await LeafManager.getInstance().getTags();
		let tagItems = Object.keys(tags).map(tag => new TagQuickPickItem(tag, tags[tag]));

		// Get packages
		let packs = await LeafManager.getInstance().getAllPackages();

		// Update items and title on value change
		let boxValueChangedListener = async (value: string) => {
			let newFilter = this.toFilter(value);
			if (value.startsWith('@')) {
				box.items = tagItems;
			} else if (value.length > 0) {
				box.items = [];
			}
			let count = this.countMatchingPackages(packs, newFilter);
			box.title = `Add filter (regex or @tag): ${count} package${count > 1 ? 's' : ''} remaining`;
		};
		box.onDidChangeValue(boxValueChangedListener);
		boxValueChangedListener(box.value); // Set initial title

		// Add filter on user acceptance
		box.onDidAccept(() => {
			let result = box.selectedItems.length > 0 ? box.selectedItems[0].label : box.value;
			let filter = this.toFilter(result);
			if (filter) {
				this.filters.push(filter);
				this.refresh();
				this.saveFilters();
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
	 * @return count of matching packages
	 */
	private countMatchingPackages(packs: any, filter?: RegexFilter | TagFilter): number {
		if (!filter) {
			return Object.keys(packs).length;
		}
		return Object.keys(packs).filter(packId => filter.match(packId, packs[packId])).length;
	}

	/**
	 * Remove filter from filter list
	 */
	private async removeFilter(item: Filter | undefined) {
		if (!item) {
			// No selection, lo and exit
			console.log("Remove filter command called without item");
			return;
		}
		this.filters.splice(this.filters.indexOf(item), 1);
		this.refresh();
		this.saveFilters();
	}

	/**
	 * Add package to a profile:
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
		} else if (result.id in profiles) {
			// Existing profile
			await LeafManager.getInstance().addPackagesToProfile([selectedPackage.id], result.id, result.properties);
		}
	}

	/**
	 * Ask user to seelect a package in combo
	 */
	private async askForPackage(title: string): Promise<PackageQuickPickItem | undefined> {
		// Do not await. We want showMultiStepQuickPick to handle this long running operation while showing a busy box.
		let itemsPromise = LeafManager.getInstance()
			.getAllPackages()
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
			id: "",
			properties: {},
			label: "Create new profile...",
			description: "You will be asked for a profile name",
			details: undefined,
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
	 * Called when the user click on a filter
	 */
	private onFilterClicked(item: Filter) {
		let newValue = !item.isChecked();
		item.setChecked(newValue);
		if (newValue) {
			if (item === PERMANENT_FILTERS.INSTALLED) {
				PERMANENT_FILTERS.AVAILABLE.setChecked(false);
			} else if (item === PERMANENT_FILTERS.AVAILABLE) {
				PERMANENT_FILTERS.INSTALLED.setChecked(false);
			}
		}
		this.refresh();
		this.saveFilters();
	}

	/**
	 * Return roots elements in package view
	 */
	protected async getRootElements(): Promise<TreeItem2[]> {
		return [this.filterContainerItem, this.packagesContainerItem] as TreeItem2[];
	}

	/**
	 * @return filtered packages as treeitems
	 */
	private async getPackagesItems(): Promise<TreeItem2[]> {
		let packs = await LeafManager.getInstance().getAllPackages();
		let filteredPacks: any = {};
		Object.keys(packs) // For all packages
			.filter(packId => this.matchCheckedFilters(packId, packs[packId]))
			.forEach(packId => filteredPacks[packId] = packs[packId]);
		return toItems(filteredPacks, PackageTreeItem);
	}

	/**
	 * Return true if the given package is matching all the enabled filters
	 */
	private matchCheckedFilters(packId: string, packProperties: any) {
		return this.permanentFilters.concat(this.filters)
			.filter(filter => filter.isChecked()) // Use only checked filters
			.every(filter => filter.match(packId, packProperties));
	}

}

/**
 * Parent of filters (3 subclasses)
 */
abstract class Filter extends FilterTreeItem {
	constructor(value: string, contextValue: string = LEAF_IDS.VIEW_ITEMS.PACKAGES.FILTER) {
		super(value, contextValue);
	}

	public abstract match(packId: string, packProperties: any): boolean;
}

/**
 * Theses filters are not removables
 */
class PermanentFilter extends Filter {
	constructor(value: string, private readonly predicate: (packId: string, packProperties: any) => boolean, checked = true) {
		super(value, LEAF_IDS.VIEW_ITEMS.PACKAGES.PERMANENT_FILTER);
		this.label = `[${value}]`;
		this.setChecked(checked);
	}
	public match(packId: string, packProperties: any): boolean {
		return this.predicate(packId, packProperties);
	}
}

/**
 * Static list of all permanent filters
 */
export const PERMANENT_FILTERS: { [key: string]: PermanentFilter } = {
	MASTER: new PermanentFilter("master", (_packId, packProperties) => packProperties.info.master),
	INSTALLED: new PermanentFilter("installed", (_packId, packProperties) => packProperties.installed, false),
	AVAILABLE: new PermanentFilter("available", (_packId, packProperties) => !packProperties.installed, false)
};

/**
 * Regex filter
 */
class RegexFilter extends Filter {
	constructor(value: string) {
		super(value);
	}
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
class TagFilter extends Filter {
	constructor(value: string) {
		super(value);
	}
	public match(_packId: string, packProperties: any): boolean {
		return packProperties.info.tags.some((tag: string) => tag.startsWith(this.value.substring(1)));
	}
}
