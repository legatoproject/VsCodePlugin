'use strict';
import {
    workspace,
    Uri,
} from "vscode";
import { LeafManager } from "../leaf/leafCore";

export const LEGATO_ENV = {
    LEGATO_ROOT: "LEGATO_ROOT",
    DEST_IP: "DEST_IP"
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
    private activeDefFile: Uri | undefined;
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


    public setActiveDefFile(uri: Uri) {
        this.activeDefFile = uri;
    }

    public getActiveDefFile(): Uri | undefined {
        return this.activeDefFile;
    }

    public async getLegatoRoot(): Promise<string> {
        return LeafManager.INSTANCE.getEnvValue(LEGATO_ENV.LEGATO_ROOT);
    }

}