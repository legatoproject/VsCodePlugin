'use strict';
import * as vscode from 'vscode';
import { Command } from '../../commons/identifiers';
import { CheckboxTreeItem, IUiItems, QuickPickItem2, toItems, TreeItem2, NamespaceContext } from '../../commons/uiUtils';
import { LeafBridgeElement } from '../../commons/utils';
import { LeafManager, LEAF_LATEST_TAG_VERSION } from '../api/core';

// This module is used to declare model/ui mappings using vscode items

/***************************
 * Leaf namespaced contexts
 **************************/
class LeafContext extends NamespaceContext {

	constructor(readonly particles: string[]) {
		// #### LEAF (-leaf) ####
		super('leaf', particles);
	}
}

const enum LeafRemotePrefix { // (context)
	// #### LEAF (-leaf) ####
	// REMOTES (-rmt)
	Root = "rmt",
	Enabled = "enabled",
	Disabled = "disabled",
	// PROFILES (-prf)
	LeafProfileCurrent = "context-leaf-prf-current",
	LeafProfileOther = "context-leaf-prf-other",
}
export class LeafRemoteContext<T extends LeafRemotePrefix> extends LeafContext {
	public static RemoteEnabled: NamespaceContext = new LeafRemoteContext(LeafRemotePrefix.Enabled);
	public static RemoteDisabled: NamespaceContext = new LeafRemoteContext(LeafRemotePrefix.Disabled);

	private constructor(readonly tag: T) {
		super([LeafRemotePrefix.Root, tag]);
	}
}

export const enum LeafPackagePrefix { // (context)
	// #### LEAF (-leaf) ####
	// PACKAGES (-pkg)
	Root = "pkg",
	Container = "container",
	Installed = "installed",
	Available = "available",
	FilterContainer = "filters-container",
	BuiltinFilter = "filters-builtin",
	UserFilter = "filter-user",
}
export class LeafPackageContext<T extends LeafPackagePrefix> extends LeafContext {

	// PACKAGES (-pkg)
	public static PackagesContainer: NamespaceContext = new LeafPackageContext(LeafPackagePrefix.Container);

	//filters
	public static PackagesFilterContainer: NamespaceContext = new LeafPackageContext(LeafPackagePrefix.FilterContainer);
	public static PackagesBuiltinFilter: NamespaceContext = new LeafPackageContext(LeafPackagePrefix.BuiltinFilter);
	public static PackagesUserFilter: NamespaceContext = new LeafPackageContext(LeafPackagePrefix.UserFilter);

	public constructor(readonly tag: T) {
		super([LeafPackagePrefix.Root, tag]);
	}

	public setDocumented(documented: boolean): void {
		if (documented) {
			this.values.push("documented");
		}
	}


	public setUpgradable(upgradable: boolean): void {
		if (upgradable) {
			this.values.push("upgradable");
		}
	}
}

const enum LeafProfilePrefix { // (context)
	// #### LEAF (-leaf) ####
	// PROFILES (-prf)
	Current = "current",
	Other = "other",
}
export class LeafProfileContext<T extends LeafProfilePrefix> extends LeafContext {
	public static Current: NamespaceContext = new LeafProfileContext(LeafProfilePrefix.Current);
	public static Other: NamespaceContext = new LeafProfileContext(LeafProfilePrefix.Other);

	private constructor(readonly prefixContext: T) {
		super([LeafPackagePrefix.Root, prefixContext]);
	}
}


/***************************
 *        REMOTES
 ***************************/

export class RemoteQuickPickItem extends QuickPickItem2 {
	constructor(
		public readonly id: string,
		public readonly properties: any
	) {
		super(id, properties, // model data
			id, // label
			properties.enabled ? "[Enabled]" : "[Disabled]", // description
			properties.url); // details
	}
}

export class RemoteTreeItem extends TreeItem2 {
	constructor(
		alias: string,
		parent: TreeItem2 | undefined,
		properties: any
	) {
		super(alias, parent, properties, // model data
			alias, // label
			properties.url, // description
			properties.url, // tooltip
			vscode.TreeItemCollapsibleState.None, // collapsibleState
			properties.enabled ? LeafRemoteContext.RemoteEnabled : LeafRemoteContext.RemoteDisabled, // context
			properties.enabled ? "RemoteEnabled.svg" : "RemoteDisabled.svg"); // iconFileName
	}
}

/***************************
 *        PACKAGES         *
 ***************************/

export class PackageQuickPickItem extends QuickPickItem2 {
	constructor(
		public readonly packId: string,
		parent: TreeItem2 | undefined,
		public readonly properties: any
	) {
		super(packId, parent, properties,// model data
			packId, // label
			properties.installed ? "[installed]" : "[available]", // description
			properties.info.description); // details
	}
}

abstract class PackagesContainerTreeItem extends TreeItem2 {
	private children: TreeItem2[] = [];
	constructor(
		id: string,
		parent: TreeItem2 | undefined,
		label: string,
		icon: string,
		collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly filter: (packs: LeafBridgeElement) => LeafBridgeElement = (packs: LeafBridgeElement) => packs
	) {
		super(id, undefined, // model data
			parent,
			label, // label
			'', // description (will be filled on refresh)
			'', // tooltip (will be filled on refresh)
			collapsibleState, // collapsibleState
			LeafPackageContext.PackagesContainer, // context
			icon // iconFileName
		);
	}
	public abstract async getPackages(): Promise<LeafBridgeElement | undefined>;

	public async refresh() {
		let childrenItems = await this.createChildrenItems();
		// reorder packages from newest to oldest
		this.children = childrenItems.sort((a, b) => (a.id > b.id ? -1 : 1));
		this.description = `(${this.children.length})`;
		this.tooltip = `${this.label} ${this.description}`;
	}

	private async createChildrenItems(): Promise<TreeItem2[]> {
		let packs = await this.getPackages();
		if (packs) {
			packs = this.filter(packs);
			return toItems(packs, PackageTreeItem);
		}
		return [];
	}

	public async getChildren(): Promise<TreeItem2[]> {
		return this.children;
	}
}

export class AvailablePackagesContainerTreeItem extends PackagesContainerTreeItem {
	constructor(protected readonly leafManager: LeafManager,
		filter?: (packs: LeafBridgeElement) => LeafBridgeElement) {
		super("AvailablePackageContainer", // id
			undefined, // parent
			`Available`, // label
			"PackageAvailable.svg", // iconFileName
			vscode.TreeItemCollapsibleState.Collapsed, // collapsibleState
			filter);
	}

	public async getPackages(): Promise<LeafBridgeElement | undefined> {
		let allPackages = await this.leafManager.packages.get();
		return allPackages.availablePackages;
	}
}

export class InstalledPackagesContainerTreeItem extends PackagesContainerTreeItem {
	constructor(protected readonly leafManager: LeafManager,
		filter?: (packs: LeafBridgeElement) => LeafBridgeElement) {
		super("InstalledPackageContainer", // id
			undefined, // parent
			"Installed", // label
			"PackageInstalled.svg", // iconFileName
			vscode.TreeItemCollapsibleState.Collapsed, // collapsibleState
			filter);
	}

	public async getPackages(): Promise<LeafBridgeElement | undefined> {
		let allPackages = await this.leafManager.packages.get();
		return allPackages.installedPackages;
	}
}

export class PackageTreeItem extends TreeItem2 {
	public packName: string;
	constructor(
		public readonly packId: string,
		parent: TreeItem2 | undefined,
		properties: any | undefined
	) {
		super(PackageTreeItem.getId(packId, properties), parent, properties, // model data
			packId, // label
			(properties && properties.info && properties.info.tags) ? properties.info.tags.sort().join(', ') : '', // description
			(properties && properties.info) ? properties.info.description : '', // tooltip
			vscode.TreeItemCollapsibleState.None, // collapsibleState
			PackageTreeItem.toContext(properties), // contextValue
			// properties && properties.installed ? Context.LeafPackageInstalled : Context.LeafPackageAvailable, // contextValue
			properties && properties.installed ? "PackageInstalled.svg" : "PackageAvailable.svg"); // iconFileName
		this.packName = properties.info.name;
	}

	private static getId(id: string, properties: any | undefined): string {
		let out = id;
		if (properties) {
			if (properties.installed) {
				out += "-installed";
			} else {
				out += "-available";
			}
		} else {
			out += "-unknown";
		}
		return out;
	}

	private static toContext(properties: any | undefined): LeafPackageContext<any> {
		let leafPackageContext: LeafPackageContext<any>;
		if (properties && properties.installed) {
			leafPackageContext = new LeafPackageContext(LeafPackagePrefix.Installed);
			// if the package has not the tag 'latest', the context is tagged as 'upgradable'
			leafPackageContext.setUpgradable(properties.info && !properties.info.tags.includes(LEAF_LATEST_TAG_VERSION));

		} else {
			leafPackageContext = new LeafPackageContext(LeafPackagePrefix.Available);
		}
		//if the package provides documentation, the context is tagged as 'documented'
		leafPackageContext.setDocumented(properties.info && properties.info.documentation);
		return leafPackageContext;
	}
}

/***************************
 *        PROFILES         *
 ***************************/

function computeDetails(properties: any): string {
	let nbPackages = properties.packages ? properties.packages.length : 0;
	let nbEnv = properties.env ? Object.keys(properties.env).length : 0;
	return `${nbPackages} packages - ${Object.keys(nbEnv).length} env vars`;
}

export class ProfileQuickPickItem extends QuickPickItem2 {
	constructor(
		public readonly id: string,
		parent: TreeItem2 | undefined,
		public readonly properties: any
	) {
		super(id, parent, properties,// model data
			id, // label
			properties.current ? "[Current]" : undefined, // description
			computeDetails(properties)); // details
	}

	public compareTo(other: IUiItems) {
		// Current first
		if (this.properties.current) {
			return -1;
		}
		if (other.properties.current) {
			return 1;
		}
		return super.compareTo(other);
	}
}

export class ProfileTreeItem extends TreeItem2 {
	constructor(
		private readonly leafManager: LeafManager,
		id: any,
		parent: TreeItem2 | undefined,
		properties: any
	) {
		super(id, parent, properties, // model data
			id, // label
			(properties && properties.current) ? '[current]' : '', // description
			computeDetails(properties), // tooltip
			vscode.TreeItemCollapsibleState.Collapsed, // collapsibleState
			properties.installed ? LeafProfileContext.Current : LeafProfileContext.Other, // context
			"Profile.svg"); // iconFileName
	}

	public async getChildren(): Promise<TreeItem2[]> {
		// Find package properties
		let packs = await this.leafManager.mergedPackages.get();
		let model: { [key: string]: any } = {};
		if (packs) {
			for (let [packName, packVersion] of Object.entries(this.properties.packages)) {
				let packId = packName + '_' + packVersion;
				model[packId] = packs[packId];
			}
		}

		// Return items
		return toItems(model, PackageTreeItem, this);
	}
}

/***************************
 *          TAGS           *
 ***************************/

export class TagQuickPickItem extends QuickPickItem2 {
	constructor(
		public readonly tag: string,
		parent: TreeItem2 | undefined,
		public readonly packCount: any
	) {
		super(tag, parent, packCount,// model data
			`@${tag}`, // label
			TagQuickPickItem.createDescription(packCount) // description
		); // no details
	}

	private static createDescription(packCount: number) {
		if (packCount === 0) {
			return `No packages`;
		}
		if (packCount === 1) {
			return `One package`;
		}
		return `${packCount} packages`;
	}
}

/***************************
 *        FILTERS          *
 ***************************/

export class FilterContainerTreeItem extends TreeItem2 {

	/**
	 * Set empty/default values then call refreshLabel()
	 */
	constructor(public builtinFilters: ReadonlyArray<FilterTreeItem>, public userFilters: FilterTreeItem[]) {
		super("FilterContainer", undefined, undefined, // model data
			"Filters", // label
			"", // description
			"Filters", // tooltip
			vscode.TreeItemCollapsibleState.Expanded, // collapsibleState
			LeafPackageContext.PackagesFilterContainer, // context
			"Filter.svg"); // iconFileName
	}

	/**
	 * Return filters as tree items children
	 */
	public async getChildren(): Promise<FilterTreeItem[]> {
		let out: FilterTreeItem[] = [];
		out.push(...this.builtinFilters);
		out.push(...this.userFilters);
		return out;
	}
}

export class FilterTreeItem extends CheckboxTreeItem {
	/**
	 * Text for regexp, start with @ for tag
	 */
	constructor(
		public readonly value: string,
		context: NamespaceContext
	) {
		super(`Filter: ${value} `, undefined, undefined, // model data
			value, // label
			'', // description
			value, // tooltip
			vscode.TreeItemCollapsibleState.None, // collapsibleState
			context, // contextValue
			Command.LeafPackagesToggleFilter); // commandId
	}
}
