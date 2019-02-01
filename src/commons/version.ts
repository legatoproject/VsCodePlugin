'use strict';
import * as vscode from 'vscode';
import { Mementos } from './memento';
import { extensionQualifiedId } from './identifiers';

/**
 * Kind of version change
 */
export enum VersionChangeKind {
    FirstInstall, MinorUpgrade, MajorUpgrade, Downgrade, Same
}

/**
 * Manage upgrades, downgrades and give previous and current versions
 */
export class VersionManager {
    // Properties
    public readonly previousVersion: string | undefined;
    public readonly currentVersion: string;
    public readonly changeKind: VersionChangeKind;

    /**
     * Get previous version from memento then store current version
     * Compute changeKind
     */
    public constructor(private readonly context: vscode.ExtensionContext) {
        let extension = vscode.extensions.getExtension(extensionQualifiedId)!;
        this.currentVersion = extension.packageJSON.version;
        this.previousVersion = Mementos.Common.PreviousVersion.get(this.context);
        this.changeKind = this.getChangeKind();
    }

    public saveCurrentVersion() {
        Mementos.Common.PreviousVersion.update(this.context, this.currentVersion);
    }

    /**
     * Determine the version change by comparing previous and current version
     */
    private getChangeKind(): VersionChangeKind {
        // First time install
        if (this.previousVersion === undefined) {
            console.log(`[VersionManager] First install: v${this.currentVersion}`);
            return VersionChangeKind.FirstInstall;
        }

        // No upgrade
        if (this.previousVersion === this.currentVersion) {
            console.log(`[VersionManager] Launch same version than previously: v${this.currentVersion}`);
            return VersionChangeKind.Same;
        }

        // Downgrade
        let [major, minor] = this.currentVersion.split('.');
        let [prevMajor, prevMinor] = this.previousVersion.split('.');
        if (major < prevMajor || (major === prevMajor && minor < prevMinor)) {
            console.log(`[VersionManager] Downgraded from v${this.previousVersion} to v${this.currentVersion}`);
            return VersionChangeKind.Downgrade;
        }

        // Upgrade !
        console.log(`[VersionManager] Upgraded from v${this.previousVersion} to v${this.currentVersion}`);
        if (major > prevMajor) {
            return VersionChangeKind.MajorUpgrade;
        }
        return VersionChangeKind.MinorUpgrade;
    }
}