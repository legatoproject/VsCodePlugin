'use strict';
import * as vscode from "vscode";
import { getWorkspaceFolderPath } from "../../commons/files";
import { DisposableBag } from '../../commons/manager';
import { fromEnvVarString, fromEnvVar, resolvePath } from "../../commons/model";
import { LeafEnvScope, LeafManager } from "../../leaf/api/core";
import { DefFileWatcher } from "./filewatcher";
import { MkBuildManager } from "./mkBuild";
import { MkEditManager, MkEditOptions } from './mkEdit';

/**
 * List of env vars used by Legato
 * Do not export this, use model element to expose/use env values
 */
const LEGATO_ENV = {
    LEGATO_ROOT: "LEGATO_ROOT",
    DEST_IP: "DEST_IP",
    DEF_FILE: "LEGATO_DEF_FILE",
    SNIPPETS: "LEGATO_SNIPPETS",
    LANGUAGE_SERVER: "LEGATO_LANGUAGE_SERVER",

    // Known options leveraging custom build
    TARGET: "LEGATO_TARGET",
    OUTPUT_DIR: "LEGATO_OUTPUT_DIR",
    OBJECT_DIR: "LEGATO_OBJECT_DIR",
    DEBUG_DIR: "LEGATO_DEBUG_DIR",
    DEV_MODE: "LEGATO_DEV_MODE_ENABLE",
    UPDATE_FILE: "LEGATO_UPDATE_FILE"
};

/**
 * The char used to split snippet env var value to a list of path
 */
const SNIPPETS_PATHS_SEPARATOR = ':';

/**
 * Manage Legato API and model
 */
export class LegatoManager extends DisposableBag {
    /**
     * Listen to def files creation/deletion
     */
    private readonly defFileWatcher: DefFileWatcher;

    // Exposed APIs
    public readonly mkEdit: MkEditManager;

    // Exposed Model
    public readonly rootPath = fromEnvVarString(this.leafManager.envVars, LEGATO_ENV.LEGATO_ROOT, this);
    public readonly workspaceReady = this.rootPath.subModel<boolean>("legato.workspace.state", this, path => path !== undefined);
    public readonly destIp = fromEnvVarString(this.leafManager.envVars, LEGATO_ENV.DEST_IP, this);
    public readonly defFile = fromEnvVar<vscode.Uri | undefined>(this.leafManager.envVars, LEGATO_ENV.DEF_FILE, this, vscode.Uri.file);
    public readonly snippets = fromEnvVar<string[]>(this.leafManager.envVars, LEGATO_ENV.SNIPPETS, this, this.resolveSnippets, this);
    public readonly languageServer = fromEnvVarString(this.leafManager.envVars, LEGATO_ENV.LANGUAGE_SERVER, this);
    public readonly target = fromEnvVarString(this.leafManager.envVars, LEGATO_ENV.TARGET, this);
    public readonly objectDir = fromEnvVar<string | undefined>(this.leafManager.envVars, LEGATO_ENV.OBJECT_DIR, this, resolvePath);
    public readonly outputDir = fromEnvVar<string | undefined>(this.leafManager.envVars, LEGATO_ENV.OUTPUT_DIR, this, resolvePath);
    public readonly debugDir = fromEnvVar<string | undefined>(this.leafManager.envVars, LEGATO_ENV.DEBUG_DIR, this, resolvePath);
    public readonly devMode = fromEnvVarString(this.leafManager.envVars, LEGATO_ENV.DEV_MODE, this);
    public readonly updateFile = fromEnvVar<string | undefined>(this.leafManager.envVars, LEGATO_ENV.UPDATE_FILE, this, resolvePath);

    // Exposed API
    public readonly mkBuild: MkBuildManager;

    public constructor(private readonly leafManager: LeafManager) {
        super();
        // Listen def files creation/deletion
        this.defFileWatcher = this.toDispose(new DefFileWatcher());
        this.defFileWatcher.created.addListener(this.onDefFileCreated, this);
        this.defFileWatcher.renamed.addListener(this.onDefFileRenamed, this);
        this.defFileWatcher.deleted.addListener(this.onDefFileDeleted, this);

        // Create tools managers
        let options: MkEditOptions = {
            defFile: this.defFile,
            defaultCwd: getWorkspaceFolderPath(),
            envProvider: this.leafManager.envVars.get,
            thisArg: this.leafManager.envVars
        };
        this.mkEdit = new MkEditManager(options);
        this.mkBuild = this.toDispose(new MkBuildManager(this));
    }

    /**
     * Create a list of absolute path from the snipet env var
     * @param snippetsFromEnvVar the value of the snippet env var
     */
    private resolveSnippets(snippetsFromEnvVar: string): string[] {
        return snippetsFromEnvVar
            .split(SNIPPETS_PATHS_SEPARATOR) // Split on ':'
            .filter(path => path.length > 0) // Exclude empty string
            .map(resolvePath) as string[]; // Resolve to absolute path
    }

    /**
     * Called when a new def file is created
     * If it's the first, set it as active one
     */
    private async onDefFileCreated(defFile: vscode.Uri) {
        let outOfSync = await this.leafManager.outOfSync.get();
        let currentDefFile = await this.defFile.get();
        if (!outOfSync && !currentDefFile) {
            this.saveActiveDefFile(defFile);
        }
    }

    /**
     * Called when a new def file is renamed
     * If it's the current one, set it's new name in envvar
     */
    private async onDefFileRenamed(newFile: vscode.Uri, oldFile: vscode.Uri) {
        let outOfSync = await this.leafManager.outOfSync.get();
        let currentDefFile = await this.defFile.get();
        if (!outOfSync && currentDefFile && currentDefFile.toString() === oldFile.toString()) {
            this.saveActiveDefFile(newFile);
        }
    }

    /**
     * Called when a def file is deleted
     * If it's the current one, let's update it in envvar
     */
    private async onDefFileDeleted(defFile: vscode.Uri) {
        let outOfSync = await this.leafManager.outOfSync.get();
        let currentDefFile = await this.defFile.get();
        if (!outOfSync && currentDefFile && currentDefFile.toString() === defFile.toString()) {
            this.saveActiveDefFile(undefined);
        }
    }

    /**
     * Modify env vars to set a new active def file
     */
    public saveActiveDefFile(uri: vscode.Uri | undefined): Promise<void> {
        let value = uri ? `\${LEAF_WORKSPACE}/${vscode.workspace.asRelativePath(uri)}` : undefined;
        return this.leafManager.setEnvValue(LEGATO_ENV.DEF_FILE, value, LeafEnvScope.Workspace);
    }

    /**
     * Modify env vars to set a new device ip
     */
    public async setDestIp(ip: string): Promise<void> {
        return this.leafManager.setEnvValue(LEGATO_ENV.DEST_IP, ip);
    }
}