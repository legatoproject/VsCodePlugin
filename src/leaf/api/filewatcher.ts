'use strict';

import * as chokidar from "chokidar";
import { debounce } from '../../commons/utils';
import { DisposableBag } from '../../commons/manager';
import { LEAF_FILES, getWorkspaceFolderPath } from '../../commons/files';
import { Listenable } from "../../commons/model";
import { join } from "path";

/**
 * Listen to leaf files and generate events
 */
export class LeafFileWatcher extends DisposableBag {
    // File watchers (used to dispose them)
    private watchers: chokidar.FSWatcher[] = [];

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
        private readonly cacheFolder: Promise<string>,
        private readonly packageFolder: Promise<string>
    ) {
        super();
        this.watchLeafFiles();
    }

    /**
     * Watch all Leaf files
     */
    private async watchLeafFiles() {
        try {
            // Watch leaf workspace folder
            // Emit fileChanged event when something change in 'leaf-data' folder or 'leaf-workspace.json' file
            this.watch({
                path: getWorkspaceFolderPath(),
                callbacks: [this.notifyFilesChanged],
                depth: 2,
                filters: [LEAF_FILES.DATA_FOLDER, LEAF_FILES.WORKSPACE_FILE]
            });

            // Watch leaf config folder
            // Emit fileChanged and packageChanged event when something change
            this.watch({
                path: await this.configFolder,
                callbacks: [this.notifyFilesChanged, this.notifyPackagesChanged],
                filters: [LEAF_FILES.CONFIG_FILE]
            });

            // Watch leaf cache folder
            // Emit packageChanged event when something change in 'remotes' folder,
            this.watch({
                path: await this.cacheFolder,
                callbacks: [this.notifyPackagesChanged],
                depth: 2,
                filters: [LEAF_FILES.REMOTE_CACHE_FOLDER]
            });

            // Watch leaf package folder
            // Emit packageChanged event when something change
            this.watch({
                path: await this.packageFolder,
                callbacks: [this.notifyPackagesChanged],
                depth: 0
            });
        } catch (reason) {
            // Catch and log because this method is never awaited
            console.error(reason);
        }
    }

    /**
     * Watch a apth using chokidar, log it
     * @param args.path the path to watch. Must exist !
     * @param args.callbacks the callbacks to call when to files change
     * @param args.depth If set, limits how many levels of subdirectories will be traversed
     * @param args.filters a list of path (relative to args.path) that we want to listen. Can be non-existent
     */
    private watch(
        args: {
            path: string,
            callbacks: (() => any)[],
            depth?: number,
            filters?: string[]
        }
    ) {
        let filters = args.filters && args.filters.length > 0 ? args.filters.map(filter => join(args.path, filter)) : undefined;
        console.log(`[LeafFileWatcher] Start listening '${args.path}' with depth limit: ${args.depth} and filters: ${args.filters ? args.filters.join(', ') : 'none'}`);
        let watcher = chokidar.watch(args.path, {
            depth: args.depth,
            awaitWriteFinish: true,
            followSymlinks: false
        });
        watcher.on('all', (_eventName, modifiedPath) => {
            if (filters === undefined || filters.some(filter => modifiedPath.startsWith(filter))) {
                args.callbacks.forEach(callback => callback.apply(this));
            }
        });
        this.watchers.push(watcher);
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
    @debounce(300) // This method call is debounced (300ms)
    private notifyPackagesChanged() {
        this.packagesChanged.emit();
    }

    /**
     * Dispose all file listeners
     */
    public dispose() {
        this.watchers.forEach(watcher => watcher.close());
        super.dispose();
    }
}