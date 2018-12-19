'use strict';
import * as vscode from 'vscode';
import { TreeItem2, QuickPickItem2, IUiItems, CheckboxTreeItem, toItems } from '../uiUtils';
import { Contexts, Commands } from '../identifiers';
import { LeafManager } from './core';
import { LeafBridgeElement } from './bridge';

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
			properties.url, // tooltip
			vscode.TreeItemCollapsibleState.None, // collapsibleState
			properties.enabled ? Contexts.LeafRemoteEnabled : Contexts.LeafRemoteDisabled, // contextValue
			properties.enabled ? "RemoteEnabled.svg" : "RemoteDisabled.svg"); // iconFileName
	}
}

/***************************
 *        PACKAGES         *
 ***************************/

export class PackageQuickPickItem extends QuickPickItem2 {
	constructor(
		public readonly id: string,
		public readonly properties: any
	) {
		super(id, properties,// model data
			id, // label
			properties.installed ? "[installed]" : "[available]", // description
			properties.info.description); // details
	}
}

abstract class PackagesContainerTreeItem extends TreeItem2 {
	private children: TreeItem2[] = [];
	constructor(id: string, private readonly baseLabel: string, icon: string,
		collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly filter: (packs: LeafBridgeElement) => LeafBridgeElement = (packs: LeafBridgeElement) => packs) {
		super(id, undefined, // model data
			baseLabel, // label
			baseLabel, // tooltip
			collapsibleState, // collapsibleState
			Contexts.LeafPackagesContainer, // contextValue
			icon // iconFileName
		);
	}
	public abstract async getPackages(): Promise<LeafBridgeElement | undefined>;

	public async refresh() {
		this.children = await this.createChildrenItems();
		this.label = `${this.baseLabel} (${this.children.length})`;
		this.tooltip = this.label;
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
	constructor(filter?: (packs: LeafBridgeElement) => LeafBridgeElement) {
		super("AvailablePackageContainer", // id
			`Available`, // label
			"PackageAvailable.svg", // iconFileName
			vscode.TreeItemCollapsibleState.Collapsed, // collapsibleState
			filter);
	}

	public async getPackages(): Promise<LeafBridgeElement | undefined> {
		return LeafManager.getInstance().getAvailablePackages();
	}
}

export class InstalledPackagesContainerTreeItem extends PackagesContainerTreeItem {
	constructor(filter?: (packs: LeafBridgeElement) => LeafBridgeElement) {
		super("InstalledPackageContainer", // id
			"Installed", // label
			"PackageInstalled.svg", // iconFileName
			vscode.TreeItemCollapsibleState.Collapsed, // collapsibleState
			filter);
	}

	public async getPackages(): Promise<LeafBridgeElement | undefined> {
		return LeafManager.getInstance().getInstalledPackages();
	}
}

export class PackageTreeItem extends TreeItem2 {
	constructor(
		id: string,
		properties: any | undefined
	) {
		super(PackageTreeItem.getId(id, properties), properties, // model data
			id, // label
			properties.info.description, // tooltip
			vscode.TreeItemCollapsibleState.None, // collapsibleState
			properties.installed ? Contexts.LeafPackageInstalled : Contexts.LeafPackageAvailable, // contextValue
			properties.installed ? "PackageInstalled.svg" : "PackageAvailable.svg"); // iconFileName
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
		id: any,
		properties: any
	) {
		super(id, properties, // model data
			id, // label
			computeDetails(properties), // tooltip
			vscode.TreeItemCollapsibleState.Collapsed, // collapsibleState
			properties.installed ? Contexts.LeafProfileCurrent : Contexts.LeafProfileOther, // contextValue
			"Profile.svg"); // iconFileName
	}

	public async getChildren(): Promise<TreeItem2[]> {
		// Find package properties
		let packs = await LeafManager.getInstance().getMergedPackages();
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
			`${packCount} package(s)`, // description
			undefined); // details
	}
}

/***************************
 *        FILTERS          *
 ***************************/

export class FilterContainerTreeItem extends TreeItem2 {

	/**
	 * Set empty/default values then call refreshLabel()
	 */
	constructor(public permanentChildren: FilterTreeItem[], public children: FilterTreeItem[]) {
		super("FilterContainer", undefined, // model data
			"Filters", // label
			"Filters", // tooltip
			vscode.TreeItemCollapsibleState.Expanded, // collapsibleState
			Contexts.LeafPackagesFilterContainer, // contextValue
			"Filter.svg"); // iconFileName
	}

	/**
	 * Return filters as tree items children
	 */
	public async getChildren(): Promise<FilterTreeItem[]> {
		let out: FilterTreeItem[] = [];
		out.push(...this.permanentChildren);
		out.push(...this.children);
		return out;
	}
}

export class FilterTreeItem extends CheckboxTreeItem {
	/**
	 * Text for regexp, start with @ for tag
	 */
	constructor(
		public readonly value: string,
		contextValue: Contexts = Contexts.LeafPackagesFilter
	) {
		super(`Filter:${value}`, undefined, // model data
			value, // label
			value, // tooltip
			vscode.TreeItemCollapsibleState.None, // collapsibleState
			contextValue, // contextValue
			Commands.LeafPackagesToggleFilter); // commandId
	}
}
