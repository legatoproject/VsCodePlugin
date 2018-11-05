'use strict';
import {
    workspace,
    Uri,
} from "vscode";

export class LegatoManager {
    private static instance: LegatoManager;
    private activeSdef: Uri | undefined;
    static getInstance(): LegatoManager {
        LegatoManager.instance = LegatoManager.instance || new LegatoManager();
        return LegatoManager.instance;
    }

    private constructor() {
    }

    // Lists sdefs in project, and if there's only one, set it as the active one.
    public listSdefs(): Thenable<Uri[]> {
        return workspace.findFiles("**/*.sdef", "**/leaf-data/*");
    }


    public setActiveSdef(uri: Uri) {
        this.activeSdef = uri;
    }

    public getActiveSdef(): Uri | undefined {
        return this.activeSdef;
    }

}