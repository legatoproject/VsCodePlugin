'use strict';

import { pathExists } from 'fs-extra';
import * as path from 'path';
import { Command } from '../../commons/identifiers';
import { CommandRegister } from '../../commons/manager';
import { LegatoFileExtension, LegatoManager } from './core';

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
     * @param mktool the current mktool
     * @returns the corresponding build command
     */
    public async getBuildCommand(): Promise<string | undefined> {
        const mktool = await this.getMkTool();
        if (mktool) {
            let command = `${mktool} ${this.legatoManager.defFile.getEvalExpression()} -s components -t ${this.legatoManager.legatoTarget.getEvalExpression()}`;

            // object dir arg complete if not empty
            command = await this.legatoManager.legatoObjectDir.get() ? command.concat(" -w ", this.legatoManager.legatoObjectDir.getEvalExpression()) : command;

            // output dir arg complete if not empty
            command = await this.legatoManager.legatoOutputDir.get() ? command.concat(" -o ", this.legatoManager.legatoOutputDir.getEvalExpression()) : command;

            // debug directory
            command = await this.legatoManager.legatoDebugDir.get() ? command.concat(" -d ", this.legatoManager.legatoDebugDir.getEvalExpression()) : command;

            return command;
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
            return `${buildCommand} && update ${this.legatoManager.legatoUpdateFile.getEvalExpression()}`;
        }
        return undefined;
    }

    /**
     * @returns clean command if the environment variables specifying the artifacts to remove are set
     */
    public async getCleanCommand() {
        const artifacts: Array<string> = [];
        if (await this.legatoManager.legatoDebugDir.get()) {
            artifacts.push(this.legatoManager.legatoDebugDir.getEvalExpression());
        }
        if (await this.legatoManager.legatoObjectDir.get()) {
            artifacts.push(this.legatoManager.legatoObjectDir.getEvalExpression());
        }
        if (await this.legatoManager.legatoUpdateFile.get()) {
            artifacts.push(this.legatoManager.legatoUpdateFile.getEvalExpression());
        }

        return artifacts.length > 0 ? "rm -rf ".concat(...artifacts.map(value => value.concat(" "))) : undefined;
    }

    /**
     * If the update file exists, generate image
     */
    public async generateImage() {
        //if the .update file exists, the generate image command is provided
        const updateFile = await this.legatoManager.legatoUpdateFile.getResolvedPath();
        if (updateFile && await pathExists(updateFile)) {
            return `systoimg ${this.legatoManager.legatoTarget.getEvalExpression()} ${this.legatoManager.legatoUpdateFile.getEvalExpression()} ${this.legatoManager.legatoObjectDir.getEvalExpression()}/image`;
        }
        return undefined;
    }

}
