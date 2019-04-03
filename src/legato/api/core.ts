'use strict';
import * as vscode from "vscode";
import { getWorkspaceFolderPath } from "../../commons/files";
import { DisposableBag } from '../../commons/manager';
import { EnvVarModelElement, StateModelElement } from "../../commons/model";
import { EnvVars } from "../../commons/utils";
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
    LEGATO_DEF_FILE: "LEGATO_DEF_FILE",
    LEGATO_SNIPPETS: "LEGATO_SNIPPETS",
    LEGATO_LANGUAGE_SERVER: "LEGATO_LANGUAGE_SERVER",

    // Known options leveraging custom build
    LEGATO_TARGET: "LEGATO_TARGET",
    LEGATO_OUTPUT_DIR: "LEGATO_OUTPUT_DIR",
    LEGATO_OBJECT_DIR: "LEGATO_OBJECT_DIR",
    LEGATO_DEBUG_DIR: "LEGATO_DEBUG_DIR",
    LEGATO_UPDATE_FILE: "LEGATO_UPDATE_FILE"
};

/**
 * Xdef files extensions
 */
export const enum LegatoFileExtension {
    cdef = ".cdef",
    adef = ".adef",
    sdef = ".sdef"
}

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
    public readonly workspaceReady = new StateModelElement("legato.workspace.state", this);
    public readonly rootPath = new EnvVarModelElement<string | undefined>(this.leafManager.envVars, LEGATO_ENV.LEGATO_ROOT, this);
    public readonly destIp = new EnvVarModelElement<string | undefined>(this.leafManager.envVars, LEGATO_ENV.DEST_IP, this);
    public readonly defFile = new EnvVarModelElement<vscode.Uri | undefined>(this.leafManager.envVars, LEGATO_ENV.LEGATO_DEF_FILE, this, (env: EnvVars) => {
        let defFile = env[LEGATO_ENV.LEGATO_DEF_FILE];
        return defFile ? vscode.Uri.file(defFile) : undefined;
    });
    public readonly snippets = new EnvVarModelElement<string | undefined>(this.leafManager.envVars, LEGATO_ENV.LEGATO_SNIPPETS, this);
    public readonly languageServer = new EnvVarModelElement<string | undefined>(this.leafManager.envVars, LEGATO_ENV.LEGATO_LANGUAGE_SERVER, this);

    public readonly legatoTarget = new EnvVarModelElement<string | undefined>(this.leafManager.envVars, LEGATO_ENV.LEGATO_TARGET, this);
    public readonly legatoObjectDir = new EnvVarModelElement<string | undefined>(this.leafManager.envVars, LEGATO_ENV.LEGATO_OBJECT_DIR, this);
    public readonly legatoOutputDir = new EnvVarModelElement<string | undefined>(this.leafManager.envVars, LEGATO_ENV.LEGATO_OUTPUT_DIR, this);
    public readonly legatoDebugDir = new EnvVarModelElement<string | undefined>(this.leafManager.envVars, LEGATO_ENV.LEGATO_DEBUG_DIR, this);
    public readonly legatoUpdateFile = new EnvVarModelElement<string | undefined>(this.leafManager.envVars, LEGATO_ENV.LEGATO_UPDATE_FILE, this);

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

        // Implement model of this manager
        this.rootPath.addDependency(this.workspaceReady, path => path !== undefined, this);
    }

    /**
     * Called when a new def file is created
     * If it's the first, set it as active one
     */
    private async onDefFileCreated(defFile: vscode.Uri) {
        let currentDefFile = await this.defFile.get();
        if (!currentDefFile) {
            this.saveActiveDefFile(defFile);
        }
    }

    /**
     * Called when a new def file is renamed
     * If it's the current one, set it's new name in envvar
     */
    private async onDefFileRenamed(newFile: vscode.Uri, oldFile: vscode.Uri) {
        let currentDefFile = await this.defFile.get();
        if (currentDefFile && currentDefFile.toString() === oldFile.toString()) {
            this.saveActiveDefFile(newFile);
        }
    }

    /**
     * Called when a def file is deleted
     * If it's the current one, let's update it in envvar
     */
    private async onDefFileDeleted(defFile: vscode.Uri) {
        let currentDefFile = await this.defFile.get();
        if (currentDefFile && currentDefFile.toString() === defFile.toString()) {
            this.saveActiveDefFile(undefined);
        }
    }

    /**
     * Modify env vars to set a new active def file
     */
    public saveActiveDefFile(uri: vscode.Uri | undefined): Promise<void> {
        let value = uri ? `\${LEAF_WORKSPACE}/${vscode.workspace.asRelativePath(uri)}` : undefined;
        return this.leafManager.setEnvValue(LEGATO_ENV.LEGATO_DEF_FILE, value, LeafEnvScope.Workspace);
    }

    /**
     * Modify env vars to set a new device ip
     */
    public async setDestIp(ip: string): Promise<void> {
        return this.leafManager.setEnvValue(LEGATO_ENV.DEST_IP, ip);
    }
}