'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { LegatoFileExtension } from './core';
import { ModelElement } from '../../commons/model';
import { DisposableBag } from '../../commons/manager';

/**
 * Build tools
 */
export const enum LegatoMkTools {
    mkapp = "mkapp",
    mksys = "mksys"
}

/**
 * Manage mktools commands for build
 */
export class MkBuildManager extends DisposableBag {
    // Exposed model
    public readonly mkTool = new ModelElement<LegatoMkTools | undefined>("legato.mkbuild.mktool", this);
    public readonly buildCommand = new ModelElement<string | undefined>("legato.mkbuild.cmd.build", this);
    public readonly buildAndInstallCommand = new ModelElement<string | undefined>("legato.mkbuild.cmd.buildandinstall", this);

    /**
     * We need current def file to get the right mktool
     */
    public constructor(defFile: ModelElement<vscode.Uri | undefined>) {
        super();
        defFile.addDependency(this.mkTool, this.getMkTool, this);
        this.mkTool.addDependency(this.buildCommand, this.getBuildCommand, this);
        this.buildCommand.addDependency(this.buildAndInstallCommand, this.getBuildAndInstallCommand, this);
    }

    /**
     * @param defFile the active def file
     * @returns the corresponding mktool
     */
    private getMkTool(defFile: vscode.Uri | undefined): LegatoMkTools | undefined {
        if (defFile) {
            switch (path.extname(defFile.fsPath)) {
                case LegatoFileExtension.sdef:
                    return LegatoMkTools.mksys;
                case LegatoFileExtension.adef:
                    return LegatoMkTools.mkapp;
            }
        }
        return undefined;
    }

    /**
     * @param mktool the current mktool
     * @returns the corresponding build command
     */
    public getBuildCommand(mktool: LegatoMkTools | undefined): string | undefined {
        if (mktool) {
            return `${mktool} -t \${LEGATO_TARGET} \${LEGATO_DEF_FILE}`;
        }
        return undefined;
    }

    /**
     * @param buildCommand the current build command
     * @returns the corresponding build and install command
     */
    public getBuildAndInstallCommand(buildCommand: string | undefined): string | undefined {
        if (buildCommand) {
            return `${buildCommand} && update $(basename \${LEGATO_DEF_FILE%.*def}).$LEGATO_TARGET.update`;
        }
        return undefined;
    }
}