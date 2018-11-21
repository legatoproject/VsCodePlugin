'use strict';
import {
    workspace,
    Uri,
} from "vscode";
import { LeafManager, LEAF_ENV_SCOPE } from "../leaf/leafCore";

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

export class LegatoManager {
    private static instance: LegatoManager;
    static getInstance(): LegatoManager {
        LegatoManager.instance = LegatoManager.instance || new LegatoManager();
        return LegatoManager.instance;
    }

    private constructor() {
    }

    // Lists def files in project, and if there's only one, set it as the active one.
    public listDefinitionFiles(): Thenable<Uri[]> {
        return workspace.findFiles("**/*.[as]def", "**/leaf-data/*");
    }

    public saveActiveDefFile(uri: Uri) {
        LeafManager.INSTANCE.setEnvValue(LEGATO_ENV.LEGATO_DEF_FILE, `\${LEAF_WORKSPACE}/${workspace.asRelativePath(uri)}`, LEAF_ENV_SCOPE.workspace);
    }

    public async getActiveDefFile(): Promise<Uri | undefined> {
        let defFileUri = await LeafManager.INSTANCE.getEnvValue(LEGATO_ENV.LEGATO_DEF_FILE);
        return defFileUri ? Uri.file(defFileUri) : undefined;
    }

    public async getLegatoRoot(): Promise<string | undefined> {
        return LeafManager.INSTANCE.getEnvValue(LEGATO_ENV.LEGATO_ROOT);
    }

}