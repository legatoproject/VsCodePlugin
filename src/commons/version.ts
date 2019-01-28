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

    // Singleton instance
    private static INSTANCE: VersionManager;

    // Properties
    public readonly previousVersion: string | undefined;
    public readonly currentVersion: string;
    public readonly changeKind: VersionChangeKind;

    /**
     * Get previous version from memento then store current version
     * Compute changeKind
     */
    private constructor() {
        let extension = vscode.extensions.getExtension(extensionQualifiedId)!;
        this.currentVersion = extension.packageJSON.version;
        this.previousVersion = Mementos.Common.PreviousVersion.get();
        Mementos.Common.PreviousVersion.update(this.currentVersion);
        this.changeKind = this.getChangeKind();
    }

    /**
     * Return singleton's instance
     * you must call and await VersionManager.check before calling this method
     */
    public static getInstance(): VersionManager {
        if (!VersionManager.INSTANCE) {
            throw new Error("check must be called and awaited before calling this singleton's instance");
        }
        return VersionManager.INSTANCE;
    }

    /**
     * Trig control singleton instanciation
     */
    public static check() {
        if (VersionManager.INSTANCE) {
            throw new Error("check must be called only once");
        }
        // Initialized singletion
        VersionManager.INSTANCE = new VersionManager();
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