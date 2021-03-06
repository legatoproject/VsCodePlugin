'use strict';

import * as vscode from 'vscode';
import { ConfigurationChecker } from './commons/configuration';
import { DisposableBag } from './commons/manager';
import { DelayedPromise } from './commons/promise';
import { ResourcesManager } from './commons/resources';
import { VersionManager } from './commons/version';
import { WelcomePageManager } from './commons/welcome';
import { LeafManager } from './leaf/api/core';
import { LeafPackagesView } from './leaf/extension/packages';
import { LeafProfileStatusBar } from './leaf/extension/profiles';
import { LeafRemotesView } from './leaf/extension/remotes';
import { LeafTerminalManager } from './leaf/extension/terminal';
import { LegatoManager, LEGATO_ENV } from './legato/api/core';
import { LegatoLanguageManager } from './legato/api/language';
import { LegatoBuildTasks } from './legato/extension/buildtasks';
// import { SnippetsManager } from './legato/extension/snippets';
import { LegatoStatusBar } from './legato/extension/statusBar';
import { LegatoSystemTreeview } from './legato/extension/system';
import { DeviceManager } from './tm/api/device';
import { DeviceStatusBar } from './tm/extension/statusBar';
import { LegatoToolchainManager } from './legato/api/toolchain';
import { LegatoDebugManager } from './legato/extension/debug';
import { onEvent } from './commons/model';
import { RemoteDeviceManager } from './tm/api/remote';
import { LegatoHoverProvider } from './commons/hover';
import { LegatoBuildConfigManager } from './legato/api/buildConfig';

/**
 * Manage the entire extension life-cycle
 */
class Extension extends DisposableBag {
    // Common managers
    public readonly resourcesManager: ResourcesManager;
    private readonly confChecker: ConfigurationChecker = this.toDispose(new ConfigurationChecker());

    // Leaf manager
    public readonly leafManager: LeafManager;

    // Legato managers
    public readonly legatoManager: LegatoManager;
    public readonly legatoBuildConfigManager: LegatoBuildConfigManager;
    public readonly legatoToolchainManager: LegatoToolchainManager;
    public readonly legatoLanguageManager: LegatoLanguageManager;
    public readonly deviceManager: DeviceManager;
    public readonly remoteDeviceManager: RemoteDeviceManager;

    /**
     * Instanciates managers
     * @param context the context of the extension
     * @param leafPath the checked path to leaf
     */
    public constructor(public readonly context: vscode.ExtensionContext, leafPath: string, versionManager: VersionManager) {
        super();

        this.resourcesManager = new ResourcesManager(context);

        // Check Leaf installation, create LeafManager and dispose it on deactivate
        // We use then because we want to store read-only promise in constructor
        this.leafManager = this.toDispose(new LeafManager(leafPath, this.resourcesManager));

        // Check vscode configuration
        this.confChecker.launch();

        // Create LegatoManager using LeafManager and dispose it on deactivate
        // We use then because we want to store read-only promise in constructor
        this.legatoManager = this.toDispose(new LegatoManager(this.leafManager));
        this.legatoBuildConfigManager = this.toDispose(
            new LegatoBuildConfigManager(this.leafManager));
        this.legatoToolchainManager = new LegatoToolchainManager(this.leafManager, this.legatoManager);
        this.legatoLanguageManager = this.toDispose(new LegatoLanguageManager(this.leafManager, this.legatoManager));
        this.deviceManager = this.toDispose(new DeviceManager(this.leafManager, this.legatoManager));
        this.remoteDeviceManager = this.toDispose(new RemoteDeviceManager(this.legatoManager));

        // Everything is fine, let's manage welcome page
        this.toDispose(new WelcomePageManager(versionManager, this.resourcesManager));

        // Export extension version to environment
        process.env[LEGATO_ENV.VSCODE_VERSION] = versionManager.currentVersion;
    }

    /**
     * Launch ui components
     */
    public async initComponnents() {
        this.initLeafComponnents();
        this.initLegatoComponnents();
    }

    /**
     * Launch leaf components
     */
    private async initLeafComponnents() {
        // Launch data providers for packages and remotes view
        this.toDispose(new LeafPackagesView(this.context, this.leafManager));
        this.toDispose(new LeafRemotesView(this.leafManager));

        // Launch/Dispose on In/Out of LeafWorkspace
        onEvent(this.leafManager.workspaceReady, {
            onWillEnable: () => [
                new LeafTerminalManager(this.leafManager),
                new LeafProfileStatusBar(this.leafManager)
            ]
        }, this);
    }

    /**
     * Launch Legato components
     */
    private async initLegatoComponnents() {
        // Launch/Dispose on In/Out of LegatoWorkspace
        onEvent(this.legatoManager.workspaceReady, {
            onWillEnable: () => {
                let buildTasks = new LegatoBuildTasks(this.leafManager, this.legatoManager);
                return [
                    new DeviceStatusBar(this.legatoManager, this.deviceManager),
                    new LegatoStatusBar(this.legatoManager),
                    buildTasks,
                    // Disable the global snippets, only use the language snippets that is defined
                    // on package.json.
                    // new SnippetsManager(this.legatoManager),
                    new LegatoDebugManager(
                        this.resourcesManager,
                        this.leafManager,
                        this.legatoManager,
                        buildTasks,
                        this.legatoToolchainManager,
                        this.remoteDeviceManager)
                ];
            }
        }, this);

        // Launch/Dispose on In/Out of LSP Workspace
        onEvent(this.legatoLanguageManager.workspaceReady, {
            onWillEnable: () => [
                new LegatoSystemTreeview(this.legatoManager, this.legatoLanguageManager)
            ]
        }, this);
    }
}

/**
 * The extension promise global handle
 */
export var extPromise: Promise<Extension> = new DelayedPromise();

/**
 * this method is called when your extension is activated
 * your extension is activated the very first time the command is executed
 */
export async function activate(context: vscode.ExtensionContext) {
    // Save current version 
    let versionManager = new VersionManager(context);
    versionManager.saveCurrentVersion();

    // Check leaf
    let leafPath = await LeafManager.checkLeafInstallation(versionManager);

    // Start extension
    let extension = new Extension(context, leafPath, versionManager);
    extension.initComponnents();

    // Resolve awaiting callers
    (extPromise as DelayedPromise<Extension>).resolve(extension);

    // Start hover provider
    new LegatoHoverProvider(context);
}

// this method is called when your extension is deactivated
export async function deactivate() {
    (await extPromise).dispose();
    extPromise = new DelayedPromise();
}
