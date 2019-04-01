'use strict';

import * as fs from "fs-extra";
import { DisposableBag } from "../../commons/manager";
import { getWorkspaceFolderPath, WorkspaceResource } from "../../commons/files";
import { join } from "path";
import { LegatoManager } from "../api/core";

// Constants list
const SNIPPETS_EXTENSION = '.code-snippets';
const SNIPPETS_PREFIX = 'legato-';

/**
 * Manage Snippet loading from Legato packages that support it
 * Populate/Clear .vscode/Snippets folder with .code-snippets files when available.
 */
export class SnippetsManager extends DisposableBag {
    // Destination folder for .code-snippets files
    private readonly destination: string = getWorkspaceFolderPath(WorkspaceResource.VsCode);

    /**
     * Listen to envars changes
     * Populate/Clear .vscode/Snippets when necessary
     */
    constructor(legatoManager: LegatoManager) {
        super();
        legatoManager.snippets.addListener(this.onNewSnippets, this);
    }

    /**
     * Check LEGATO_SNIPPETS envar change
     * Populate/Clear .vscode/Snippets if LEGATO_SNIPPETS is available
     */
    private async onNewSnippets(legatoSnippetsFolders: string[] | undefined): Promise<void> {
        await this.deleteExistingSnippets();
        // If there is something to copy
        if (legatoSnippetsFolders && legatoSnippetsFolders.length > 0) {
            // Ensure destination is created
            await fs.ensureDir(this.destination);

            // Copy all snippet folders in parralel
            await Promise.all(legatoSnippetsFolders.map(this.copySnippetsFrom, this));
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