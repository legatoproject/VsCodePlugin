'use strict';

import * as vscode from 'vscode';
import { join } from 'path';
import { LeafTerminalManager } from './leaf/terminal';
import { LeafProfileStatusBar } from './leaf/profiles';
import { LeafManager } from './leaf/core';
import { LegatoManager } from './legato/core';
import { LegatoUiManager } from './legato/assist';
import { LeafPackagesView } from './leaf/packages';
import { LeafRemotesView } from './leaf/remotes';
import { TargetUiManager } from './tm/assist';
import { LegatoLanguageManager } from './legato/language';
import { ConfigurationChecker } from './commons/configuration';
import { VersionManager } from './commons/version';
import { DisposableBag } from './commons/manager';
import { DelayedPromise } from './commons/promise';
import { SnippetsManager } from './legato/snippets';
import { WelcomePageManager } from './commons/welcome';

/**
 * Folder names of extension resources
 */
export const enum ExtensionPaths {
    Resources = 'resources',
    Vscode = '.vscode',
    WelcomePage = 'webview/welcomepage',
    ChangeLog = 'CHANGELOG.md'
}

/**
 * Manage the entire extension life-cycle
 */
class Extension extends DisposableBag {
    // Common managers
    private readonly confChecker: ConfigurationChecker = this.toDispose(new ConfigurationChecker());

    // Leaf manager
    public readonly leafManager: LeafManager;

    // Legato managers
    public readonly legatoManager: LegatoManager;
    public readonly legatoLanguageManager: LegatoLanguageManager;

    /**
     * Instanciates managers
     * @param context the context of the extension
     * @param leafPath the checked path to leaf
     */
    public constructor(public readonly context: vscode.ExtensionContext, leafPath: string, versionManager: VersionManager) {
        super();

        // Check Leaf installation, create LeafManager and dispose it on deactivate
        // We use then because we want to store read-only promise in constructor
        this.leafManager = this.toDispose(new LeafManager(leafPath));

        // Check vscode configuration
        this.confChecker.launch();

        // Create LegatoManager using LeafManager and dispose it on deactivate
        // We use then because we want to store read-only promise in constructor
        this.legatoManager = this.toDispose(new LegatoManager(this.leafManager));
        this.legatoLanguageManager = this.toDispose(new LegatoLanguageManager(this.leafManager, this.legatoManager));

        // Everything is fine, let's manage welcome page
        this.toDispose(new WelcomePageManager(versionManager));
    }

    /**
     * Launch ui components
     */
    public async initComponnents() {
        this.initLeafComponnents();
        this.initLegatoComponnents();
    }

    // Leaf

    /**
     * Launch leaf components
     */
    private async initLeafComponnents() {
        // Launch data providers for packages and remotes view
        this.toDispose(new LeafPackagesView(this.context, this.leafManager));
        this.toDispose(new LeafRemotesView(this.leafManager));

        // Launch/Dispose on In/Out of LeafWorkspace
        this.toDispose(await this.leafManager.onLeafWorkspace({ onWillEnable: this.enteringLeafWorkspace }, this));
    }

    /**
     * Called when the workspace become leaf compatible
     */
    private async enteringLeafWorkspace(): Promise<vscode.Disposable[]> {
        return [
            new LeafTerminalManager(this.leafManager),
            new LeafProfileStatusBar(this.leafManager)
        ];
    }

    // Legato

    /**
     * Launch Legato components
     */
    private async initLegatoComponnents() {
        // Launch/Dispose on In/Out of LegatoWorkspace
        this.toDispose(await this.legatoManager.onLegatoWorkspace({ onWillEnable: this.enteringLegatoWorkspace }, this));
    }

    /**
     * Called when the workspace become legato compatible
     */
    private async enteringLegatoWorkspace(): Promise<vscode.Disposable[]> {
        return [
            new TargetUiManager(this.leafManager),
            new LegatoUiManager(this.leafManager, this.legatoManager),
            new SnippetsManager(this.leafManager)
        ];
    }

    /**
     * Get the absolute path of a resource contained in the extension.
     *
     * @param path A relative path to a resource contained in the extension.
     * @return The absolute path of the resource.
     */
    public getExtensionPath(...path: string[]) {
        return this.context.asAbsolutePath(join(...path));
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
}

// this method is called when your extension is deactivated
export async function deactivate() {
    (await extPromise).dispose();
    extPromise = new DelayedPromise();
}
