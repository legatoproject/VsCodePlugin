'use strict';
import * as vscode from 'vscode';
import { TreeItem2, QuickPickItem2, IUiItems, CheckboxTreeItem, toItems } from '../../commons/uiUtils';
import { Context, Command } from '../../commons/identifiers';
import { LeafManager } from '../api/core';
import { LeafBridgeElement } from '../../commons/utils';

// This module is used to declare model/ui mappings using vscode items

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
		properties: any
	) {
		super(alias, properties, // model data
			alias, // label
			properties.url, // description
			properties.url, // tooltip
			vscode.TreeItemCollapsibleState.None, // collapsibleState
			properties.enabled ? Context.LeafRemoteEnabled : Context.LeafRemoteDisabled, // contextValue
			properties.enabled ? "RemoteEnabled.svg" : "RemoteDisabled.svg"); // iconFileName
	}
}

/***************************
 *        PACKAGES         *
 ***************************/

export class PackageQuickPickItem extends QuickPickItem2 {
	constructor(
		public readonly packId: string,
		public readonly properties: any
	) {
		super(packId, properties,// model data
			packId, // label
			properties.installed ? "[installed]" : "[available]", // description
			properties.info.description); // details
	}
}

abstract class PackagesContainerTreeItem extends TreeItem2 {
	private children: TreeItem2[] = [];
	constructor(id: string, label: string, icon: string,
		collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly filter: (packs: LeafBridgeElement) => LeafBridgeElement = (packs: LeafBridgeElement) => packs) {
		super(id, undefined, // model data
			label, // label
			'', // description (will be filled on refresh)
			'', // tooltip (will be filled on refresh)
			collapsibleState, // collapsibleState
			Context.LeafPackagesContainer, // contextValue
			icon // iconFileName
		);
	}
	public abstract async getPackages(): Promise<LeafBridgeElement | undefined>;

	public async refresh() {
		this.children = await this.createChildrenItems();
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
	constructor(
		public readonly packId: string,
		properties: any | undefined
	) {
		super(PackageTreeItem.getId(packId, properties), properties, // model data
			packId, // label
			(properties && properties.info && properties.info.tags) ? properties.info.tags.sort().join(', ') : '', // description
			(properties && properties.info) ? properties.info.description : '', // tooltip
			vscode.TreeItemCollapsibleState.None, // collapsibleState
			properties && properties.installed ? Context.LeafPackageInstalled : Context.LeafPackageAvailable, // contextValue
			properties && properties.installed ? "PackageInstalled.svg" : "PackageAvailable.svg"); // iconFileName
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
		public readonly properties: any
	) {
		super(id, properties,// model data
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
		properties: any
	) {
		super(id, properties, // model data
			id, // label
			(properties && properties.current) ? '[current]' : '', // description
			computeDetails(properties), // tooltip
			vscode.TreeItemCollapsibleState.Collapsed, // collapsibleState
			properties.installed ? Context.LeafProfileCurrent : Context.LeafProfileOther, // contextValue
			"Profile.svg"); // iconFileName
	}

	public async getChildren(): Promise<TreeItem2[]> {
		// Find package properties
		let packs = await this.leafManager.mergedPackages.get();
		let model: { [key: string]: any } = {};
		if (packs) {
			for (let packId of this.properties.packages) {
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
		public readonly packCount: any
	) {
		super(tag, packCount,// model data
			`@${tag}`, // label
			TagQuickPickItem.createDescription(packCount), // description
			undefined); // details
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
		super("FilterContainer", undefined, // model data
			"Filters", // label
			"", // description
			"Filters", // tooltip
			vscode.TreeItemCollapsibleState.Expanded, // collapsibleState
			Context.LeafPackagesFilterContainer, // contextValue
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
		contextValue: Context
	) {
		super(`Filter: ${value} `, undefined, // model data
			value, // label
			'', // description
			value, // tooltip
			vscode.TreeItemCollapsibleState.None, // collapsibleState
			contextValue, // contextValue
			Command.LeafPackagesToggleFilter); // commandId
	}
}