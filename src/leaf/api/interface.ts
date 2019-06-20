'use strict';

import { ModelElement } from "../../commons/model";
import { LeafBridgeCommands, LeafBridge, PROFILE_OUT_OF_SYNC_ERROR } from "./bridge";
import { LeafFileWatcher } from "./filewatcher";
import { DisposableBag } from "../../commons/manager";
import { LeafBridgeElement, EnvVars } from "../../commons/utils";
import { ResourcesManager } from "../../commons/resources";

/**
 * Type of package node returned by bridge
 */
export type AllPackages = {
    installedPackages: LeafBridgeElement,
    availablePackages: LeafBridgeElement
};

/**
 * This class get and maintain up-to-date data from leaf bridge
 */
export class LeafInterface extends DisposableBag {
    private readonly bridge: LeafBridge;

    // Exposed model
    public readonly workspace = new ModelElement<LeafBridgeElement | undefined>("leaf.interface.workspace", this);
    public readonly packages = new ModelElement<AllPackages | undefined>("leaf.interface.packages", this);
    public readonly remotes = new ModelElement<LeafBridgeElement | undefined>("leaf.interface.remotes", this);
    public readonly envVars = new ModelElement<EnvVars | undefined>("leaf.interface.envvars", this);
    public readonly outOfSync = new ModelElement<boolean>("leaf.interface.outofsync", this);

    /**
     * Launch bridge and file watcher
     */
    public constructor(resourcesManager: ResourcesManager) {
        super();

        // Create bridge
        this.bridge = this.toDispose(new LeafBridge(resourcesManager));

        // Create watcher
        let bridgeInfos = this.requestBridgeInfo();
        let configFolder = this.getConfigFolder(bridgeInfos);
        let cacheFolder = this.getCacheFolder(bridgeInfos);
        let packageFolder = this.getPackageFolder(bridgeInfos);
        let watcher = this.toDispose(new LeafFileWatcher(configFolder, cacheFolder, packageFolder));

        // Use watcher to trig model refresh
        watcher.leafChanged
            .addListener(this.requestWorkspaceInfo, this)
            .addListener(this.requestRemotes, this)
            .addListener(this.requestEnvVars, this);
        watcher.packagesChanged
            .addListener(this.requestPackages, this);
    }

    /**
     * This method is called only once by constructor
     */
    private async requestBridgeInfo(): Promise<LeafBridgeElement> {
        let info = await this.bridge.send(LeafBridgeCommands.Info);
        if (!info) {
            throw new Error("Communication issue with leaf bridge");
        }
        return info;
    }

    /**
     * This method is called only once by constructor
     */
    private async getConfigFolder(infos: Promise<LeafBridgeElement>): Promise<string> {
        return (await infos).configFolder;
    }

    /**
     * This method is called only once by constructor
     */
    private async getCacheFolder(infos: Promise<LeafBridgeElement>): Promise<string> {
        return (await infos).cacheFolder;
    }

    /**
     * This method is called only once by constructor
     */
    private async getPackageFolder(infos: Promise<LeafBridgeElement>): Promise<string> {
        return (await infos).packageFolder;
    }

    /**
     * Update exposed model
     */
    private requestWorkspaceInfo() {
        this.workspace.set(this.bridge.send(LeafBridgeCommands.WorkspaceInfo));
    }

    /**
     * Update exposed model
     */
    private requestRemotes() {
        this.remotes.set(this.bridge.send(LeafBridgeCommands.Remotes));
    }

    /**
     * Update exposed model
     * Catch out of sync error, update outofsync state and emit event if necessary
     */
    private async requestEnvVars() {
        try {
            // Resolve envvars promise to catch PROFILE_OUT_OF_SYNC_ERROR if any
            let envvars = await this.bridge.send(LeafBridgeCommands.ResolveVar);
            this.envVars.set(envvars);
            this.outOfSync.set(false);
        } catch (error) {
            if (error === PROFILE_OUT_OF_SYNC_ERROR) {
                this.outOfSync.set(true);
            }
            this.envVars.set(undefined);
        }
    }

    /**
     * Update exposed model
     */
    private requestPackages() {
        this.packages.set(this.bridge.send(LeafBridgeCommands.Packages) as Promise<AllPackages>);
    }
}