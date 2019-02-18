'use strict';

import * as fs from "fs-extra";
import { LeafManager, LeafEvent } from "../leaf/core";
import { EnvVars } from "../commons/utils";
import { LEGATO_ENV } from "./core";
import { DisposableBag } from "../commons/manager";
import { getWorkspaceDirectory, WorkspaceResource } from "../commons/files";
import { join } from "path";

// Consntants list
const SNIPPETS_PATHS_SEPARATOR = ':';
const SNIPPETS_EXTENSION = '.code-snippets';
const SNIPPETS_PREFIX = 'legato-';

/**
 * Manage Snippet loading from Legato packages that support it
 * Populate/Clear .vscode/Snippets folder with .code-snippets files when available.
 */
export class SnippetsManager extends DisposableBag {
    // Destination folder for .code-snippets files
    private readonly destination: string = getWorkspaceDirectory(WorkspaceResource.VsCode);

    /**
     * Listen to envars changes
     * Populate/Clear .vscode/Snippets when necessary
     */
    constructor(private readonly leafManager: LeafManager) {
        super();
        leafManager.addListener(LeafEvent.EnvVarsChanged, this.onEnvVarsChanged, this);
        this.setInitialState();
    }

    /**
     * Populate .vscode/Snippets if available
     */
    private async setInitialState() {
        try {
            await this.onEnvVarsChanged(undefined, await this.leafManager.getEnvVars());
        } catch (reason) {
            // Catch and log because this method is never awaited
            console.error(reason);
        }
    }

    /**
     * Check LEGATO_SNIPPETS envar change
     * Populate/Clear .vscode/Snippets if LEGATO_SNIPPETS is available
     */
    private async onEnvVarsChanged(oldEnvVar: EnvVars | undefined, newEnvVar: EnvVars | undefined): Promise<void> {
        let oldLegatoSnippets = oldEnvVar ? oldEnvVar[LEGATO_ENV.LEGATO_SNIPPETS] : undefined;
        let newLegatoSnippets = newEnvVar ? newEnvVar[LEGATO_ENV.LEGATO_SNIPPETS] : undefined;
        if (oldLegatoSnippets !== newLegatoSnippets) {
            await this.deleteExistingSnippets();
            if (newLegatoSnippets) { // Get legato snippet folders list
                let legatoSnippetsFolders = newLegatoSnippets
                    .split(SNIPPETS_PATHS_SEPARATOR) // Split on ':'
                    .filter(path => path.length > 0); // Exclude empty string

                // If there is something to copy
                if (legatoSnippetsFolders.length > 0) {
                    // Ensure destination is created
                    await fs.ensureDir(this.destination);
                }

                // Copy all snippet folders in parralel
                await Promise.all(legatoSnippetsFolders.map(this.copySnippetsFrom, this));
            }
        }
    }

    /**
     * Remove old Legato snippets from destination
     */
    private async deleteExistingSnippets(): Promise<void> {
        if (await fs.pathExists(this.destination)) { // Nothing to do if no destination folder
            await Promise.all( // Delete all snippet files in parralel
                (await fs.readdir(this.destination)) // Get file list in .vscode
                    .filter(child => child.startsWith(SNIPPETS_PREFIX) && child.endsWith(SNIPPETS_EXTENSION)) // Keep only Legato snippets
                    .map(snippetFileName => fs.remove(join(this.destination, snippetFileName)))); // Delete
        }
    }

    /**
     * Copy content of source which are snippets into destination
     */
    private async copySnippetsFrom(legatoSnippetsFolder: string): Promise<void> {
        if ((await fs.stat(legatoSnippetsFolder)).isDirectory) { // Exclude non existent folders
            await Promise.all( // Copy all snippet files in parralel
                (await fs.readdir(legatoSnippetsFolder)) // Get file list in legato folder
                    .filter(snippetFileName => snippetFileName.endsWith(SNIPPETS_EXTENSION)) // Keep only snippets
                    .map(snippetFileName => fs.copy( // Copy
                        join(legatoSnippetsFolder, snippetFileName), // Source file
                        join(this.destination, SNIPPETS_PREFIX + snippetFileName)))); // Destination file with prefix
        }
    }
}