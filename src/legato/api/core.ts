'use strict';
import * as vscode from "vscode";
import { getWorkspaceFolderPath } from "../../commons/files";
import { DisposableBag } from '../../commons/manager';
import { ModelElement, StateModelElement } from "../../commons/model";
import { LeafEnvScope, LeafManager } from "../../leaf/api/core";
import { MkBuildManager, LegatoMkTools } from "./mkBuild";
import { MkEditManager, MkEditOptions } from './mkEdit';
import { DefFileWatcher } from "./filewatcher";

/**
 * List of env vars used by Legato
 * Do not export this, use model element to expose/use env values
 */
const LEGATO_ENV = {
    LEGATO_ROOT: "LEGATO_ROOT",
    DEST_IP: "DEST_IP",
    LEGATO_DEF_FILE: "LEGATO_DEF_FILE",
    LEGATO_SNIPPETS: "LEGATO_SNIPPETS",
    LEGATO_LANGUAGE_SERVER: "LEGATO_LANGUAGE_SERVER"
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

    /**
     * Provide current mktool, build and install commands
     */
    private readonly mkBuild: MkBuildManager;

    // Exposed APIs
    public readonly mkEdit: MkEditManager;

    // Exposed Model
    public readonly workspaceReady = new StateModelElement("legato.workspace.state", this);
    public readonly rootPath = new ModelElement<string | undefined>("legato.root", this);
    public readonly destIp = new ModelElement<string | undefined>("legato.destip", this);
    public readonly defFile = new ModelElement<vscode.Uri | undefined>("legato.deffile", this);
    public readonly snippets = new ModelElement<string | undefined>("legato.snippets", this);
    public readonly languageServer = new ModelElement<string | undefined>("legato.lsp", this);
    // Exposed model deleguated to mkBuild
    public readonly mkTool: ModelElement<LegatoMkTools | undefined>;
    public readonly buildCommand: ModelElement<string | undefined>;
    public readonly buildAndInstallCommand: ModelElement<string | undefined>;

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
        this.mkBuild = this.toDispose(new MkBuildManager(this.defFile));

        // Expose tool model
        this.mkTool = this.mkBuild.mkTool;
        this.buildCommand = this.mkBuild.buildCommand;
        this.buildAndInstallCommand = this.mkBuild.buildAndInstallCommand;

        // Implement model of this manager
        this.leafManager.envVars
            .addDependency(this.rootPath, env => env[LEGATO_ENV.LEGATO_ROOT], this)
            .addDependency(this.destIp, env => env[LEGATO_ENV.DEST_IP], this)
            .addDependency(this.defFile, env => {
                let defFile = env[LEGATO_ENV.LEGATO_DEF_FILE];
                return defFile ? vscode.Uri.file(defFile) : undefined;
            }, this)
            .addDependency(this.snippets, env => env[LEGATO_ENV.LEGATO_SNIPPETS], this)
            .addDependency(this.languageServer, env => env[LEGATO_ENV.LEGATO_LANGUAGE_SERVER], this);
        this.rootPath
            .addDependency(this.workspaceReady, path => path !== undefined, this);
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