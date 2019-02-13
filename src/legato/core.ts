'use strict';
import * as vscode from "vscode";
import { LeafManager, LeafEnvScope, LeafEvent } from "../leaf/core";
import { EnvVars } from '../commons/utils';
import { AbstractManager } from '../commons/manager';

export const LEGATO_ENV = {
    LEGATO_ROOT: "LEGATO_ROOT",
    DEST_IP: "DEST_IP",
    LEGATO_DEF_FILE: "LEGATO_DEF_FILE",
    LEGATO_SNIPPETS: "LEGATO_SNIPPETS",
    LEGATO_LANGUAGE_SERVER: "LEGATO_LANGUAGE_SERVER"
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
    OnLegatoRootChange = "onLegatoRootChange", // oldLegatoRoot: string | undefined, newLegatoRoot: string | undefined
    OnLegatoDefFileChange = "onLegatoDefFileChange" // oldActiveDefFile: vscode.Uri | undefined, newActiveDefFile: vscode.Uri | undefined
}

export class LegatoManager extends AbstractManager<LegatoEvent> {

    public constructor(private readonly leafManager: LeafManager) {
        super();
        // Subscribe to envars bridge node modification to trig legato workspace event if necessary
        this.leafManager.addListener(LeafEvent.EnvVarsChanged, this.checkIsLegatoWorkspaceChangeAndEmit, this, this.disposables);
        this.leafManager.addListener(LeafEvent.EnvVarsChanged, this.checkIsLegatoDefFileChangeAndEmit, this, this.disposables);
    }

    public saveActiveDefFile(uri: vscode.Uri | undefined): Promise<void> {
        let value = uri ? `\${LEAF_WORKSPACE}/${vscode.workspace.asRelativePath(uri)}` : undefined;
        return this.leafManager.setEnvValue(LEGATO_ENV.LEGATO_DEF_FILE, value, LeafEnvScope.Workspace);
    }

    public async getActiveDefFile(): Promise<vscode.Uri | undefined> {
        let envVars = await this.leafManager.getEnvVars();
        return envVars ? this.getActiveDefFileFromEnv(envVars) : undefined;
    }

    private getActiveDefFileFromEnv(env: EnvVars | undefined): vscode.Uri | undefined {
        if (env) {
            let defFileUri = env[LEGATO_ENV.LEGATO_DEF_FILE];
            if (defFileUri) {
                return vscode.Uri.file(defFileUri);
            }
        }
        return undefined;
    }

    public async getLegatoRoot(envVars?: EnvVars | undefined): Promise<string | undefined> {
        if (!envVars) {
            envVars = await this.leafManager.getEnvVars();
        }
        return envVars ? envVars[LEGATO_ENV.LEGATO_ROOT] : undefined;
    }

    /**
     * Instanciate or dispose Disposable elements on workspace becoming legato or not
     * Immediatly instanciate if already in a legato workspace
     * @param onWillEnable callback called when the event return true to wait for component creation
     * @param onDidDisable callback called when the event return false after disposing components
     * @param thisArg The `this`-argument which will be used when calling the env vars provider.
     */
    public async onLegatoWorkspace(
        activator: {
            onWillEnable: () => Promise<vscode.Disposable[]>,
            onDidDisable?: (components: vscode.Disposable[]) => any
        },
        thisArg?: any
    ): Promise<vscode.Disposable> {
        return this.onEvent(
            LegatoEvent.OnInLegatoWorkspaceChange,
            this.isLegatoWorkspace(await this.leafManager.getEnvVars()),
            activator,
            thisArg);
    }

    /**
     * @return true if the given envVars came from a legato workspace
     */
    private isLegatoWorkspace(envVars: EnvVars | undefined): boolean {
        return (envVars !== undefined) && (LEGATO_ENV.LEGATO_ROOT in envVars);
    }

    /**
     * Called when envars from leaf bridge change.
     * Check if workspace became legato or not
     * Emit event if it change
     */
    private async checkIsLegatoWorkspaceChangeAndEmit(oldEnVars: EnvVars | undefined, newEnvVars: EnvVars | undefined) {
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

    private async checkIsLegatoDefFileChangeAndEmit(oldEnVars: any | undefined, newEnvVars: any | undefined) {
        const uriToString = ((uri: vscode.Uri | undefined) => uri ? uri.toString() : undefined); //just to make Uri comparable
        let oldLegatoActiveDefFile = await this.getActiveDefFileFromEnv(oldEnVars);
        let newLegatoActiveDefFile = await this.getActiveDefFileFromEnv(newEnvVars);
        if (uriToString(oldLegatoActiveDefFile) !== uriToString(newLegatoActiveDefFile)) {
            this.emit(LegatoEvent.OnLegatoDefFileChange, oldLegatoActiveDefFile, newLegatoActiveDefFile);
        }
    }

    public dispose() {
        super.dispose();
        this.emit(LegatoEvent.OnInLegatoWorkspaceChange, true, false);
    }
}