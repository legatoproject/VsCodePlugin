'use strict';
import { LeafManager } from "../../leaf/api/core";
import { join } from 'path';
import { LegatoManager } from "./core";

/**
 * Provide Legato toolchain data
 */
export class LegatoToolchainManager {

    /**
     * The path to the gdb server on the device
     */
    public readonly gdbServerPath = "/legato/systems/current/apps/devMode/read-only/bin/gdbserver";

    /**
     * This manager need leaf and legato managers
     */
    public constructor(
        private readonly leafManager: LeafManager,
        private readonly legatoManager: LegatoManager
    ) { }

    /**
     * @param key of the env var to get
     * @returns the value of the env var
     * @throws error if the env var is not defined
     */
    private async getMandatoryEnv(key: string): Promise<string> {
        let env = await this.leafManager.envVars.get();
        let value = env[key];
        if (value) {
            return value;
        }
        throw new Error(`${key} not available`);
    }

    /**
     * @returns the path to the gdb client
     */
    public async getGdb(): Promise<string> {
        let dir = await this.getToolchainDir();
        let prefix = await this.getToolchainPrefix();
        return join(dir, `${prefix}gdb`);
    }

    /**
     * @returns the current toolchain directory path
     */
    private async getToolchainDir(): Promise<string> {
        let target = await this.legatoManager.target.getMandatory();
        let key = `${target.toUpperCase()}_TOOLCHAIN_DIR`;
        return this.getMandatoryEnv(key);
    }

    /**
     * @returns the current toolchain prefix
     */
    private async getToolchainPrefix(): Promise<string> {
        let target = await this.legatoManager.target.getMandatory();
        let key = `${target.toUpperCase()}_TOOLCHAIN_PREFIX`;
        return this.getMandatoryEnv(key);
    }

    /**
     * @returns the current sysroot path
     */
    public async getSysroot(): Promise<string> {
        let target = await this.legatoManager.target.getMandatory();
        let key = `${target.toUpperCase()}_SYSROOT`;
        return this.getMandatoryEnv(key);
    }

    /**
     * @param applicationName the name of the Legato application
     * @returns the corresponding application staging folder
     */
    public async getAppStaging(applicationName: string): Promise<string> {
        let buildFolder = await this.legatoManager.objectDir.getMandatory();
        return join(buildFolder, "app", applicationName, "staging", "read-only");
    }

    /**
     * @returns the corresponding system staging folder
     */
    private async getSystemStaging(): Promise<string> {
        let buildFolder = await this.legatoManager.objectDir.getMandatory();
        return join(buildFolder, "staging");
    }

    /**
     * @param applicationName the name of the Legato application
     * @param executableName the name of the executable file
     * @returns the absolute executable path
     */
    public async  getExecutablePath(applicationName: string, executableName: string): Promise<string> {
        let appStaging = await this.getAppStaging(applicationName);
        return join(appStaging, 'bin', executableName);
    }

    /**
     * @param applicationName the name of the Legato application
     * @returns the list of SO libs path
     */
    public async  getSOLibPaths(applicationName: string): Promise<string[]> {
        let appStaging = await this.getAppStaging(applicationName);
        let systemStaging = await this.getSystemStaging();
        return [
            join(appStaging, 'lib'),
            join(systemStaging, 'lib')
        ];
    }
}
