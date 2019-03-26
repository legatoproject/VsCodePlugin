'use strict';
import * as vscode from "vscode";
import { DisposableBag } from '../../commons/manager';
import { Listenable } from "../../commons/model";
import { LEGATO_FILES_PATTERNS } from "./files";
import { extname } from 'path';

/**
 * Maximum amount of ms between a create and a delete event under which we consider it as a rename event
 */
const RENAME_DETECTION_DELAY = 100;

/**
 * Called when a def file is created
 * @param createdFile the new created def file
 */
type CreatedFileListener = (createdFile: vscode.Uri) => void;

/**
 * Called when a def file is renamed
 * @param newFile the new name of the def file
 * @param oldFile the old name of the def file
 */
type RenamedFileListener = (newFile: vscode.Uri, oldFile: vscode.Uri) => void;

/**
 * Called when a def file is deleted
 * @param deletedFile the old deleted def file
 */
type DeletedFileListener = (deletedFile: vscode.Uri) => void;

/**
 * Manage Legato API and model
 */
export class DefFileWatcher extends DisposableBag {
    /**
     * Listen to def files creation/deletion
     */
    private readonly fileWatcher: vscode.FileSystemWatcher;

    /**
     * If a renaming is suspected, it will contain a timeout and a newDefFile.
     * It is undefined if no def file was created in the last 100ms 
     */
    private renaming: undefined | {
        timeout: NodeJS.Timeout; // the running timeout handle (so we can clear it if necessary)
        createdFile: vscode.Uri; // the created def file from the created vscode event
    } = undefined;

    // Exposed events
    public readonly created = new Listenable<CreatedFileListener>('legato.xdef.created', this, false);
    public readonly renamed = new Listenable<RenamedFileListener>('legato.xdef.renamed', this, false);
    public readonly deleted = new Listenable<DeletedFileListener>('legato.xdef.deleted', this, false);

    /**
     * Listen file system
     */
    public constructor() {
        super();

        // Listen def files creation/deletion
        this.fileWatcher = this.toDispose(vscode.workspace.createFileSystemWatcher(
            LEGATO_FILES_PATTERNS.DEFINITIONS_FILES, // only "**/*.[as]def"
            false, true, false)); // Ignore file changes
        this.fileWatcher.onDidCreate(this.onDefFileCreated, this, this);
        this.fileWatcher.onDidDelete(this.onDefFileDeleted, this, this);
    }

    /**
     * If a def file is created, fill renaming action.
     * If no def file is deleted in the next 100ms, clear the renaming action and call the created listeners
     * @param createdFile the created def file
     */
    private async onDefFileCreated(createdFile: vscode.Uri) {
        this.renaming = {
            timeout: setTimeout(() => {
                // No def file deleted 100ms after creation
                // Let's take it as an actual create event
                this.created.emit(createdFile);

                // Clear renaming, this is not a rename event
                this.renaming = undefined;
            }, RENAME_DETECTION_DELAY), // 100 ms
            createdFile: createdFile
        };
    }

    /**
     * @param defFile a def file uri
     * @returns the extension of the def file
     */
    private getExtension(defFile: vscode.Uri): string {
        return extname(defFile.fsPath);
    }

    /**
     * If a renaming action exist (a def file was created in the last 100ms) and the def file extension is the same,
     * then call renaming listeners and clear renaming
     * If no renaming action exist, just call the deleted listeners
     * @param deletedFile the deleted def file
     */
    private async onDefFileDeleted(deletedFile: vscode.Uri) {
        if (this.renaming && this.getExtension(deletedFile) === this.getExtension(this.renaming.createdFile)) {
            clearTimeout(this.renaming.timeout);
            this.renamed.emit(this.renaming.createdFile, deletedFile);
            this.renaming = undefined;
        } else {
            this.deleted.emit(deletedFile);
        }
    }
}