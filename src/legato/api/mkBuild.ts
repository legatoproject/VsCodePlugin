'use strict';

import { pathExists } from 'fs-extra';
import * as path from 'path';
import { Command } from '../../commons/identifiers';
import { CommandRegister } from '../../commons/manager';
import { LegatoManager } from './core';
import { LegatoFileExtension } from './files';
import { getEvalExpression, ModelElement } from '../../commons/model';

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
export class MkBuildManager extends CommandRegister {

    /**
     * On build demand, we need legatoManager to get the right mktool based on def file
     */
    public constructor(private readonly legatoManager: LegatoManager) {
        super();
        // enables the possibility to create custom launch with 'eval $(leaf env -q) && ${command:legato.build}'
        this.createCommand(Command.LegatoBuildCommand, this.getBuildCommand, this);
    }

    /**
     * @param defFile the active def file
     * @returns the corresponding mktool
     */
    private async getMkTool(): Promise<LegatoMkTools | undefined> {
        const defFile = await this.legatoManager.defFile.get();
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
     * @param param the name of the param to fill
     * @param elt the model element to use a the value of the given param
     * @returns the ouple of parameters if the value exist and an empty array if not
     */
    private async toParameters(param: string, elt: ModelElement<string | undefined>): Promise<[string, string] | []> {
        if (await elt.get()) {
            return [param, getEvalExpression(elt)];
        }
        return [];
    }

    /**
     * @param mktool the current mktool
     * @returns the corresponding build command
     */
    public async getBuildCommand(): Promise<string | undefined> {
        const mktool = await this.getMkTool();
        if (mktool) {
            let command = [
                mktool, getEvalExpression(this.legatoManager.defFile),
                "-s", "components",
                "-t", getEvalExpression(this.legatoManager.target)
            ];

            // object dir arg complete if not empty
            command.push(...await this.toParameters("-w", this.legatoManager.objectDir));

            // output dir arg complete if not empty
            command.push(...await this.toParameters("-o", this.legatoManager.outputDir));

            // debug directory
            command.push(...await this.toParameters("-d", this.legatoManager.debugDir));

            return command.join(" ");
        }

        // unavailable build command when no def file is present
        return undefined;
    }

    /**
     * @param buildCommand the current build command
     * @returns the corresponding build and install command
     */
    public async getBuildAndInstallCommand(): Promise<string | undefined> {
        const buildCommand = await this.getBuildCommand();
        if (buildCommand) {
            return `${buildCommand} && update ${getEvalExpression(this.legatoManager.updateFile)}`;
        }
        return undefined;
    }

    /**
     * @returns clean command if the environment variables specifying the artifacts to remove are set
     */
    public async getCleanCommand() {
        const artifacts: Array<string> = [];
        if (await this.legatoManager.debugDir.get()) {
            artifacts.push(getEvalExpression(this.legatoManager.debugDir));
        }
        if (await this.legatoManager.objectDir.get()) {
            artifacts.push(getEvalExpression(this.legatoManager.objectDir));
        }
        if (await this.legatoManager.updateFile.get()) {
            artifacts.push(getEvalExpression(this.legatoManager.updateFile));
        }

        return artifacts.length > 0 ? "rm -rf ".concat(...artifacts.map(value => value.concat(" "))) : undefined;
    }

    /**
     * If the update file exists, generate image
     */
    public async generateImage() {
        //if the .update file exists, the generate image command is provided
        const updateFile = await this.legatoManager.updateFile.get();
        if (updateFile && await pathExists(updateFile)) {
            return `systoimg ${getEvalExpression(this.legatoManager.target)} ${getEvalExpression(this.legatoManager.updateFile)} ${getEvalExpression(this.legatoManager.objectDir)}/image`;
        }
        return undefined;
    }
}
