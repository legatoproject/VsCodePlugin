'use strict';

import * as vscode from "vscode";
import { DisposableBag } from './utils';

export class ConfigurationManager extends DisposableBag {

    // Singleton instance
    private static INSTANCE: ConfigurationManager = new ConfigurationManager();
    private alreadyWarnMultipleFolder: boolean = false;

    static getInstance(): ConfigurationManager {
        ConfigurationManager.INSTANCE = ConfigurationManager.INSTANCE || new ConfigurationManager();
        return ConfigurationManager.INSTANCE;
    }

    /**
     * Private
     * Do nothing
     */
    private constructor() {
        super();
    }

    /**
     * Check vscode configuration
     */
    public checkConfiguration() {
        this.excludeLeafData();
        this.warningOnMultipleFolders();
        vscode.workspace.onDidChangeWorkspaceFolders(this.warningOnMultipleFolders, this, this);
    }

    /**
     * Exclude leaf-data from file watcher
     */
    private excludeLeafData() {
        let config = vscode.workspace.getConfiguration(undefined, null);
        config.update("files.watcherExclude", { "**/leaf-data/**": true }, vscode.ConfigurationTarget.Global);
    }

    /**
     * Warn user about not supporting multiple folders in vcode
     */
    private warningOnMultipleFolders() {
        let folders = vscode.workspace.workspaceFolders;
        // Have multiple folders ?
        if (folders && folders.length > 1) {
            // If not already warned
            if (!this.alreadyWarnMultipleFolder) {
                this.alreadyWarnMultipleFolder = true;
                // Warn user
                vscode.window.showWarningMessage("Multiple folders are not supported.\n"
                    + "First folder will be used as Leaf workspace.");
            }
        } else {
            // If not multiple, reset warning debouncer
            this.alreadyWarnMultipleFolder = false;
        }
    }
}
