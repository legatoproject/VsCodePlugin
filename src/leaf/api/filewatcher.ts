'use strict';


import * as fs from "fs-extra";
import * as vscode from "vscode";
import { debounce } from '../../commons/utils';
import { DisposableBag } from '../../commons/manager';
import { LEAF_FILES, getWorkspaceFolderPath } from '../../commons/files';
import { Listenable } from "../../commons/model";

/**
 * Listen to leaf files and generate events
 */
export class LeafFileWatcher extends DisposableBag {
    // leaf-data folder content watcher
    private leafDataContentWatcher: fs.FSWatcher | undefined = undefined;

    // Exposed events
    public readonly leafChanged = new Listenable("leafChanged", this);
    public readonly packagesChanged = new Listenable("packagesChanged", this);

    /**
     * Watch leaf files
     * @param configFolder leaf config folder
     * @param cacheFolder leaf cache folder
     */
    public constructor(
        private readonly configFolder: Promise<string>,
        private readonly cacheFolder: Promise<string>
    ) {
        super();
        this.watchLeafFiles();
    }

    /**
     * Watch all Leaf files
     */
    private async watchLeafFiles() {
        try {
            // Listen to leaf-data folder creation/deletion
            this.watchLeafFileByVsCodeWatcher(
                new vscode.RelativePattern(getWorkspaceFolderPath(), LEAF_FILES.DATA_FOLDER),
                this.startWatchingLeafDataFolder, // File creation callback
                undefined, // Do nothing on change (it's filtered by configuration 'files.watcherExclude' anyway)
                this.stopWatchingLeafDataFolder // File deletion callback
            );
            // If leaf-data already exist, listen to it
            if (await fs.pathExists(getWorkspaceFolderPath(LEAF_FILES.DATA_FOLDER))) {
                this.startWatchingLeafDataFolder();
            }

            // Listen leaf-workspace.json (creation/deletion/change)
            this.watchLeafFileByVsCodeWatcher(
                getWorkspaceFolderPath(LEAF_FILES.WORKSPACE_FILE),
                this.notifyFilesChanged, this.notifyFilesChanged, this.notifyFilesChanged);

            // Listen config folder
            this.watchLeafFolderByFsWatch(await this.configFolder, this.notifyFilesChanged);

            // Listen remotes.json in leaf cache folder
            this.watchLeafFolderByFsWatch(
                await this.cacheFolder,
                filename => filename === LEAF_FILES.REMOTE_CACHE_FILE ? this.notifyPackagesChanged() : undefined);
        } catch (reason) {
            // Catch and log because this method is never awaited
            console.error(reason);
        }
    }

    /**
     * Called when something change in leaf files
     * Check workspace change and emit event if necessary
     */
    @debounce(100) // This method call is debounced (100ms)
    private notifyFilesChanged() {
        this.leafChanged.emit();
    }

    /**
     * Called when something change in remote.json in leaf cache folder
     * Check packages change and emit event if necessary
     */
    @debounce(100) // This method call is debounced (100ms)
    private notifyPackagesChanged() {
        this.packagesChanged.emit();
    }

    /**
     * Create fs folder watcher on leaf-data
     */
    private startWatchingLeafDataFolder() {
        this.stopWatchingLeafDataFolder(); // Close previous listener if any (should not)
        let leafDataFolderPath = getWorkspaceFolderPath(LEAF_FILES.DATA_FOLDER);
        this.leafDataContentWatcher = this.watchLeafFolderByFsWatch(leafDataFolderPath, this.notifyFilesChanged);
    }

    /**
     * Close fs folder watcher on leaf-data
     */
    private stopWatchingLeafDataFolder() {
        if (this.leafDataContentWatcher) {
            this.leafDataContentWatcher.close();
            this.leafDataContentWatcher = undefined;
        }
    }

    /**
    * Watch one Leaf file
    * globPattern: The file to watch
    * WARNING: This watcher cannot listen a folder outside the workspace.
    * WARNING: This watcher cannot listen a folder touch.
    */
    private watchLeafFileByVsCodeWatcher(
        globPattern: vscode.GlobPattern,
        onDidCreateCb: (() => any) | undefined,
        onDidChangeCb: (() => any) | undefined,
        onDidDeleteCb: (() => any) | undefined
    ): vscode.FileSystemWatcher {
        console.log(`[FileWatcher] Watch folder using vscode watcher '${globPattern.toString()}'`);
        let watcher: vscode.FileSystemWatcher = vscode.workspace.createFileSystemWatcher(globPattern);
        this.toDispose(watcher);
        if (onDidCreateCb) {
            watcher.onDidCreate((uri: vscode.Uri) => {
                console.log(`[FileWatcher] Created File: uri=${uri.fsPath}`);
                onDidCreateCb.apply(this);
            }, this);
        }
        if (onDidChangeCb) {
            watcher.onDidChange((uri: vscode.Uri) => {
                console.log(`[FileWatcher] Changed File: uri=${uri.fsPath}`);
                onDidChangeCb.apply(this);
            }, this);
        }
        if (onDidDeleteCb) {
            watcher.onDidDelete((uri: vscode.Uri) => {
                console.log(`[FileWatcher] Deleted File: uri=${uri.fsPath}`);
                onDidDeleteCb.apply(this);
            }, this);
        }
        return watcher;
    }

    /**
     * Watch one Leaf folder
     * folder: The folder to watch
     * WARNING: This watcher is closed forever when the folder is deleted.
     */
    private watchLeafFolderByFsWatch(folder: string, callback: (filename: string) => any): fs.FSWatcher {
        console.log(`[FileWatcher] Watch folder using fs '${folder}' for changes in any files}`);
        let watcher = fs.watch(folder);
        this.onDispose(() => watcher.close());
        watcher.addListener("change", (eventType: string, filename: string | Buffer) => {
            console.log(`[FileWatcher] fs fire an event: type=${eventType} filename=${filename.toString()}`);
            callback.call(this, filename.toString());
        });
        return watcher;
    }

    /**
     * Dispose all file listeners
     */
    public dispose() {
        this.stopWatchingLeafDataFolder();
        super.dispose();
    }
}