'use strict';
import * as vscode from 'vscode';
import { Mementos } from './memento';
import { extensionQualifiedId } from './identifiers';

/**
 * Kind of version change
 */
export const enum VersionChangeKind {
    FirstInstall, MinorUpgrade, MajorUpgrade, Downgrade, Same
}

/**
 * Used by version comparator
 */
const VERSION_SEPARATOR: string = '.';

/**
 * Manage upgrades, downgrades and give previous and current versions
 */
export class VersionManager {
    /**
     * This value is loaded from Memento at startup
     */
    public readonly previousVersion: string | undefined;

    /**
     * The current version found in package.json
     */
    public readonly currentVersion: string;

    /**
     * The change kind from previousVersion to currentVersion
     */
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

    /**
     * Save current version in memento
     * The execution of this method have no impact on this class properties
     */
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

        // Downgrade
        if (this.versionsLowerThan(this.currentVersion, this.previousVersion)) {
            console.log(`[VersionManager] Downgraded from v${this.previousVersion} to v${this.currentVersion}`);
            return VersionChangeKind.Downgrade;
        }

        // No upgrade
        if (!this.versionsLowerThan(this.previousVersion, this.currentVersion)) {
            console.log(`[VersionManager] Launch same version than previously: v${this.currentVersion}`);
            return VersionChangeKind.Same;
        }

        // Upgrade !
        console.log(`[VersionManager] Upgraded from v${this.previousVersion} to v${this.currentVersion}`);
        let major = this.currentVersion.split('.')[0];
        let prevMajor = this.previousVersion.split('.')[0];
        if (major > prevMajor) {
            return VersionChangeKind.MajorUpgrade;
        }
        return VersionChangeKind.MinorUpgrade;
    }

    /**
     * This algorythm must be the same than python leaf implementation
     */
    public versionsLowerThan(va: string, vb: string): boolean {
        if (va === vb) {
            return false;
        }
        let a = this.versionStringToTuple(va);
        let b = this.versionStringToTuple(vb);
        let i = 0;
        while (true) {
            if (i >= a.length) {
                return true;
            }
            if (i >= b.length) {
                return false;
            }
            let itema = a[i];
            let itemb = b[i];
            if (typeof itema !== typeof itemb) {
                itema = String(itema);
                itemb = String(itemb);
            }
            if (itema !== itemb) {
                return itema < itemb;
            }
            i += 1;
        }
        throw new Error();
    }

    /**
     * Split by dot then convert each segment to number if possible
     */
    private versionStringToTuple(version: string): (string | number)[] {
        return version
            .split(VERSION_SEPARATOR)
            .map(item => parseInt(item) || item, this);
    }
}
