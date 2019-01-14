'use strict';
import * as vscode from "vscode";
import { LeafManager, LeafEnvScope, LeafEvent } from "../leaf/core";
import { AbstractManager, EnvVars } from '../commons/utils';

export const LEGATO_ENV = {
    LEGATO_ROOT: "LEGATO_ROOT",
    DEST_IP: "DEST_IP",
    LEGATO_DEF_FILE: "LEGATO_DEF_FILE"
};

export const LEGATO_FILE_EXTENSIONS = {
    cdef: ".cdef",
    adef: ".adef",
    sdef: ".sdef"
};

export const LEGATO_MKTOOLS = {
    mkapp: "mkapp",
    mksys: "mksys"
};

export enum LegatoEvent { // Events with theirs parameters
    OnInLegatoWorkspaceChange = "onInLegatoWorkspaceChange", // oldIsLegatoWorkspace: boolean, newIsLegatoWorkspace: boolean
    OnLegatoRootChange = "onLegatoRootChange" // oldLegatoRoot: string | undefined, newLegatoRoot: string | undefined
}

export class LegatoManager extends AbstractManager<LegatoEvent> {

    private static instance: LegatoManager;

    static getInstance(): LegatoManager {
        LegatoManager.instance = LegatoManager.instance || new LegatoManager();
        return LegatoManager.instance;
    }

    private constructor() {
        super();
        // Subscribe to envars bridge node modification to trig legato workspace event if necessary
        LeafManager.getInstance().addListener(LeafEvent.EnvVarsChanged, this.checkIsLegatoWorkspaceChangeAndEmit, this, this.disposables);
    }

    public saveActiveDefFile(uri: vscode.Uri | undefined) {
        let value = uri ? `\${LEAF_WORKSPACE}/${vscode.workspace.asRelativePath(uri)}` : undefined;
        LeafManager.getInstance().setEnvValue(LEGATO_ENV.LEGATO_DEF_FILE, value, LeafEnvScope.Workspace);
    }

    public async getActiveDefFile(): Promise<vscode.Uri | undefined> {
        let defFileUri = await LeafManager.getInstance().getEnvValue(LEGATO_ENV.LEGATO_DEF_FILE);
        return defFileUri ? vscode.Uri.file(defFileUri) : undefined;
    }

    public async getLegatoRoot(envVars?: EnvVars | undefined): Promise<string | undefined> {
        if (!envVars) {
            envVars = await LeafManager.getInstance().getEnvVars();
        }
        return envVars ? envVars[LEGATO_ENV.LEGATO_ROOT] : undefined;
    }

    /**
     * Instanciate or dispose Disposable elements on workspace becoming legato or not
     * Immediatly instanciate if already in a legato workspace
     */
    public createAndDisposeOnLegatoWorkspace(...newComponents: { new(): vscode.Disposable }[]) {
        this.createAndDisposeOn(
            LegatoEvent.OnInLegatoWorkspaceChange,
            async () => this.isLegatoWorkspace(await LeafManager.getInstance().getEnvVars()),
            ...newComponents);
    }

    /**
     * @return true if the given envVars came from a legato workspace
     */
    private isLegatoWorkspace(envVars: any | undefined): boolean {
        return (envVars !== undefined) && (LEGATO_ENV.LEGATO_ROOT in envVars);
    }

    /**
     * Called when envars from leaf bridge change.
     * Check if workspace became legato or not
     * Emit event if it change
     */
    private async checkIsLegatoWorkspaceChangeAndEmit(oldEnVars: any | undefined, newEnvVars: any | undefined) {
        let oldIsLegatoWorkspace = this.isLegatoWorkspace(oldEnVars);
        let newIsLegatoWorkspace = this.isLegatoWorkspace(newEnvVars);
        if (oldIsLegatoWorkspace !== newIsLegatoWorkspace) {
            this.emit(LegatoEvent.OnInLegatoWorkspaceChange, oldIsLegatoWorkspace, newIsLegatoWorkspace);
        }
        let oldLegatoRoot = await this.getLegatoRoot(oldEnVars);
        let newLegatoRoot = await this.getLegatoRoot(newEnvVars);
        if (oldLegatoRoot !== newLegatoRoot) {
            this.emit(LegatoEvent.OnLegatoRootChange, oldLegatoRoot, newLegatoRoot);
        }
    }

    public dispose() {
        super.dispose();
        this.emit(LegatoEvent.OnInLegatoWorkspaceChange, true, false);
    }
}