'use strict';

import * as vscode from "vscode";
import { DisposableBag } from './manager';
import { TerminalKind } from './terminal';
import { LEAF_FILES } from './files';

/**
 * Represent one configuration section (setting)
 * This class is not intended to be used oustide this module
 */
class Section<T> {

    /**
     * @param name the namespace of the Section
     * @param defaultValue optional, should be used only when we can't set it in package.json
     * We should always prefer to store the default value in package.json (where vscode access it and let user restore default value) than here.
     */
    constructor(
        public readonly name: string,
        public readonly defaultValue?: T) {

        // Check that config is correctly declared in 'package.json' file
        let sectionInfo = this.getConfig().inspect(name);
        if (!sectionInfo) {
            throw new Error(`Section ${name} is not defined in 'package.json' file`);
        }
        if (!defaultValue && !sectionInfo.defaultValue) {
            throw new Error(`Default value of section ${name} must be defined in 'package.json' file`);
        }
    }

    /**
     * @returns vscode configuration
     */
    private getConfig(): vscode.WorkspaceConfiguration {
        return vscode.workspace.getConfiguration(undefined, null);
    }

    /**
     * @returns the current value of the section
     */
    public getValue(): T {
        let out = this.getConfig().get(this.name, this.defaultValue) as T; // Not undefined, already checked in constructor
        console.log(`[Configuration] Get value of '${this.name}': '${out}'`);
        return out;
    }

    /**
     * Update the current value of the section.
     * See [update](#WorkspaceConfiguration.update)
     */
    public update(value: T, configurationTarget?: vscode.ConfigurationTarget | boolean): Thenable<void> {
        console.log(`[Configuration] Update value of '${this.name}': '${value}'`);
        return this.getConfig().update(this.name, value, configurationTarget);
    }

    /**
     * Retrieve all information about a configuration setting.
     * See [inspect](#WorkspaceConfiguration.inspect)
     */
    public inspect<T>(): { key: string; defaultValue?: T; globalValue?: T; workspaceValue?: T, workspaceFolderValue?: T } | undefined {
        console.log(`[Configuration] Inspect value of '${this.name}'`);
        return this.getConfig().inspect(this.name);
    }
}

/**
 * This namespace is used to expose all Sections as the vscode configuration
 */
export namespace Configuration {

    /**
     * Check configuration then launch configuration/workspace listener
     * @returns A disposable which unsubscribes the event listener.
     */
    export function launchChecker(): vscode.Disposable {
        return new ConfigurationChecker().launch();
    }

    /**
     * Common settings
     */
    export namespace Common {
        export const showWhatsNewAfterUpgrades = new Section<boolean>("leaf.common.showWhatsNewAfterUpgrades");
    }

    /**
     * VsCode settings
     */
    export namespace VsCode {
        export const FilesWatcherExclude = new Section<any>("files.watcherExclude");
        export const TerminalExternalLinuxExec = new Section<string>("terminal.external.linuxExec", "x-terminal-emulator");
    }

    /**
     * Legato settings
     */
    export namespace Legato {
        /**
         * Target Management settings
         */
        export namespace Tm {
            /**
             * Terminal settings
             */
            export namespace Terminal {
                export const Kind = new Section<TerminalKind>("legato.tm.terminal.kind");
            }
            /**
             * Logs settings
             */
            export namespace Log {
                export const Kind = new Section<TerminalKind>("legato.tm.log.kind");
            }
        }
    }
}

/**
 * Check configuration on Launch then listen to configuration/workspace changes
 * A disposable which unsubscribes the event listener.
 */
export class ConfigurationChecker extends DisposableBag {

    // Ensure than we do not show the warning message more than necessary
    private alreadyWarnMultipleFolder: boolean = false;

    /**
     * Check configuration then listen tp configuration/workspace changes
     * @returns itself
     */
    public launch(): this {
        this.excludeLeafData();
        this.warningOnMultipleFolders();
        vscode.workspace.onDidChangeWorkspaceFolders(this.warningOnMultipleFolders, this, this);
        return this;
    }

    /**
     * Exclude leaf-data from file vscode watcher
     */
    private excludeLeafData() {
        let newSettings: any;
        let values = Configuration.VsCode.FilesWatcherExclude.inspect();
        if (values && values.globalValue) {
            newSettings = values.globalValue;
        } else {
            newSettings = {};
        }
        newSettings[`**/${LEAF_FILES.DATA_FOLDER}/**`] = true;
        Configuration.VsCode.FilesWatcherExclude.update(newSettings, vscode.ConfigurationTarget.Global);
    }

    /**
     * Warn user about not supporting multiple folders in vscode
     */
    private warningOnMultipleFolders() {
        let folders = vscode.workspace.workspaceFolders;
        // Have multiple folders ?
        if (folders && folders.length > 1) {
            // If not already warned
            if (!this.alreadyWarnMultipleFolder) {
                this.alreadyWarnMultipleFolder = true;
                // Warn user
                vscode.window.showWarningMessage(
                    "Multiple folders are not supported.\n" +
                    "First folder will be used as Leaf workspace.");
            }
        } else {
            // If not multiple, reset warning debouncer
            this.alreadyWarnMultipleFolder = false;
        }
    }
}
