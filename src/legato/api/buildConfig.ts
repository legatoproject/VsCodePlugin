'use strict';

import * as fs from "fs";
import { pathExists } from "fs-extra";
import * as path from 'path';
import * as vscode from 'vscode';
import { getCppToolsApi, Version } from 'vscode-cpptools';
import { getWorkspaceFolderPath, WorkspaceResource } from "../../commons/files";
import { DisposableBag } from '../../commons/manager';
import { fromEnvVarString } from "../../commons/model";
import { LEGATO_ENV } from "./core";
import { LeafManager } from "../../leaf/api/core";

const C_STANDARD = "c11";
const CPP_STANDARD = "c++17";
const INTELLISENSE_MODE = "gcc-x64";
const LEGATO_CONFIG_NAME = 'Legato';
const jsonProperties = "c_cpp_properties.json";

/**
 * Implement configuration for C/C++ extension
 */
export class LegatoBuildConfigManager extends DisposableBag {
    private readonly configFolder: string;
    private propertiesFile: vscode.Uri;
    private configurationJson: ConfigurationJson | undefined;

    public constructor(private readonly leafManager: LeafManager) {
        super();
        this.configFolder = getWorkspaceFolderPath(WorkspaceResource.VsCode);
        this.propertiesFile = vscode.Uri.file(
            getWorkspaceFolderPath(WorkspaceResource.VsCode, jsonProperties));
        this.leafManager.envVars.addListener(this.registerCppConfig, this);
    }

    /**
     * Register configuration for C/C++ extension.
     */
    public async registerCppConfig() {
        // Get Environment Variables.
        let legatoRoot = await fromEnvVarString(
            this.leafManager.envVars, LEGATO_ENV.LEGATO_ROOT, this).get();
        let legatoToolchain = await fromEnvVarString(
            this.leafManager.envVars, LEGATO_ENV.TOOLCHAIN_FULL_PREFIX, this).get();
        let legatoSysRoot = await fromEnvVarString(
            this.leafManager.envVars, LEGATO_ENV.SYSROOT, this).get();
        let legatoTarget = await fromEnvVarString(
            this.leafManager.envVars, LEGATO_ENV.TARGET, this).get();
        let legatoObjectDir = await fromEnvVarString(
            this.leafManager.envVars, LEGATO_ENV.OBJECT_DIR, this).get();

        if (!(legatoRoot && legatoSysRoot && legatoTarget && legatoToolchain && legatoObjectDir)) {
            return;
        }

        if (await getCppToolsApi(Version.v2)) {
            const parsedConfigResult = await this.parseExistingConfigFile();
            if (!parsedConfigResult.configJson) {
                // Create the configuration for C/C++ extension if it is not exist.
                this.configurationJson = {
                    configurations: [
                        this.getLegatoCppConfig(
                            legatoRoot, legatoToolchain, legatoSysRoot,
                            legatoTarget, legatoObjectDir)],
                    version: 4
                };

                if (!fs.existsSync(this.configFolder)) {
                    fs.mkdirSync(this.configFolder);
                }
                vscode.window.showInformationMessage(
                    "Legato configuration has been applied to optimize build process.");
                fs.writeFileSync(
                    this.propertiesFile.fsPath,
                    JSON.stringify(this.configurationJson, undefined, 2));
            } else {
                // Modify the configuration for C/C++ extension if it exists.
                this.configurationJson = parsedConfigResult.configJson;

                if (!parsedConfigResult.legatoConfig) {
                    fs.watchFile(this.propertiesFile.fsPath, (curr, prev) => {
                        fs.unwatchFile(this.propertiesFile.fsPath);
                        vscode.commands.executeCommand('C_Cpp.ConfigurationSelect');
                    });

                    this.configurationJson.configurations.push(
                        this.getLegatoCppConfig(
                            legatoRoot, legatoToolchain, legatoSysRoot,
                            legatoTarget, legatoObjectDir));
                    vscode.window.showInformationMessage(
                        "Legato configuration has been added to the existing " +
                        "c_cpp_properties.json file. Please activate by selecting it from above.");
                    fs.writeFileSync(
                        this.propertiesFile.fsPath,
                        JSON.stringify(this.configurationJson, undefined, 2));
                } else {
                    let newConfig = this.getLegatoCppConfig(
                        legatoRoot, legatoToolchain, legatoSysRoot, legatoTarget, legatoObjectDir);
                    let isSame = false;

                    if (newConfig.includePath && parsedConfigResult.legatoConfig.includePath) {
                        let oldIncludePath = parsedConfigResult.legatoConfig.includePath;
                        isSame = (newConfig.includePath.length == oldIncludePath.length) &&
                            newConfig.includePath.every((element, index) => {
                                return element === oldIncludePath[index];
                            });
                    } else {
                        isSame = true;
                    }

                    let oldCompilerPath = parsedConfigResult.legatoConfig.compilerPath;
                    if (!isSame || newConfig.compilerPath !== oldCompilerPath) {
                        for (let i = 0; i < this.configurationJson.configurations.length; i++) {
                            let configurationName = this.configurationJson.configurations[i].name;
                            if (configurationName === LEGATO_CONFIG_NAME) {
                                this.configurationJson.configurations[i] = newConfig;
                                break;
                            }
                        }

                        vscode.window.showInformationMessage(
                            "Legato configuration has been applied to optimize build process.");
                        fs.writeFileSync(
                            this.propertiesFile.fsPath,
                            JSON.stringify(this.configurationJson, undefined, 2));
                    }
                }
            }
        }
    }

    /**
     * Parse c_cpp_properties.json to the json object
     * @returns the configuration file and the Legato configuration as object.
     */
    private async parseExistingConfigFile(): Promise<{
        configJson: ConfigurationJson | undefined,
        legatoConfig: Configuration | undefined
    }> {
        const noExistingConfig = { configJson: undefined, legatoConfig: undefined };

        if (await pathExists(this.propertiesFile.fsPath)) {
            let readResults: string = fs.readFileSync(this.propertiesFile.fsPath, 'utf8');

            if (readResults === "") {
                return noExistingConfig;
            } else {
                let newJson: ConfigurationJson = JSON.parse(readResults);

                if (!newJson || !newJson.configurations || newJson.configurations.length === 0) {
                    throw new Error("Invalid configuration file. There must be at least one " +
                        "configuration present in the array.");
                }

                this.configurationJson = newJson;
                const filteredConfigs = this.configurationJson.configurations.filter(
                    (value) => value.name === LEGATO_CONFIG_NAME);
                const legatoConfiguration =
                    filteredConfigs.length > 0 ? filteredConfigs[0] : undefined;

                return { configJson: newJson, legatoConfig: legatoConfiguration };
            }
        } else {
            return noExistingConfig;
        }
    }

    /**
     * Create the Legato configuration section in c_cpp_properties.json
     */
    private getLegatoCppConfig(
        legatoRoot: string,
        legatoToolchain: string,
        legatoSysRoot: string,
        legatoTarget: string,
        legatoObjectDir: string
    ): Configuration {

        let compilerPath: string =
            `${legatoToolchain}gcc --sysroot ${legatoSysRoot}`;
        let includePath: string[] = [];

        if (fs.existsSync(`${legatoRoot}/framework/include`)) {
            includePath.push(`${legatoRoot}/framework/include`);
        }

        if (fs.existsSync(`${legatoRoot}/build/${legatoTarget}/framework/include`)) {
            includePath.push(`${legatoRoot}/build/${legatoTarget}/framework/include`);
        }

        let legatoObjectDirPath = getWorkspaceFolderPath(path.normalize(legatoObjectDir));

        if (fs.existsSync(legatoObjectDirPath)) {
            includePath.push(`${legatoObjectDirPath}/**`);
        }

        return {
            name: LEGATO_CONFIG_NAME,
            includePath: includePath,
            defines: [],
            intelliSenseMode: INTELLISENSE_MODE,
            cStandard: C_STANDARD,
            cppStandard: CPP_STANDARD,
            compilerPath: compilerPath
        };
    }

}

export interface ConfigurationJson {
    configurations: Configuration[];
    env?: { [key: string]: string | string[] };
    version: number;
}

export interface Configuration {
    name: string;
    compilerPath?: string;
    cStandard?: string;
    cppStandard?: string;
    includePath?: string[];
    windowsSdkVersion?: string;
    defines?: string[];
    intelliSenseMode?: string;
}