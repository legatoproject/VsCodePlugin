'use strict';
import * as vscode from 'vscode';
import { TreeItem2, QuickPickItem2, IUiItems } from '../uiUtils';
import { LEAF_IDS } from '../identifiers';

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
		public readonly alias: string,
		public readonly properties: any
	) {
		super(alias, properties, // model data
			alias, // label
			properties.url, // tooltip
			vscode.TreeItemCollapsibleState.None, // collapsibleState
			properties.enabled ? LEAF_IDS.VIEW_ITEMS.REMOTES.ENABLED : LEAF_IDS.VIEW_ITEMS.REMOTES.DISABLE, // contextValue
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

export class PackageTreeItem extends TreeItem2 {
	constructor(
		public readonly id: any,
		public readonly properties: any
	) {
		super(id, properties, // model data
			id, // label
			properties.info.description, // tooltip
			vscode.TreeItemCollapsibleState.None, // collapsibleState
			properties.installed ? LEAF_IDS.VIEW_ITEMS.PACKAGES.INSTALLED : LEAF_IDS.VIEW_ITEMS.PACKAGES.AVAILABLE, // contextValue
			properties.installed ? "PackageInstalled.svg" : "PackageAvailable.svg"); // iconFileName
	}
}

/***************************
 *        PROFILES         *
 ***************************/

export class ProfileQuickPickItem extends QuickPickItem2 {
	constructor(
		public readonly id: string,
		public readonly properties: any
	) {
		super(id, properties,// model data
			id, // label
			properties.current ? "[Current]" : undefined, // description
			ProfileQuickPickItem.computeDetails(properties)); // details
	}

	private static computeDetails(properties: any): string {
		let nbPackages = properties.packages ? properties.packages.length : 0;
		let nbEnv = properties.env ? Object.keys(properties.env).length : 0;
		return `${nbPackages} packages - ${Object.keys(nbEnv).length} env vars`;
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
