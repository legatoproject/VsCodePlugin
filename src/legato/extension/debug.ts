'use strict';
import * as vscode from 'vscode';
import { DisposableBag } from '../../commons/manager';
import { LegatoToolchainManager } from '../api/toolchain';
import { ResourcesManager, ExtensionPaths } from '../../commons/resources';
import { LegatoManager } from '../api/core';

/**
 * This configuration is automatically added to the launch.json created when the user try to launch
 * a Legato debug session while no launch.json exist
 */
const DEFAULT_ATTACH_CONF: vscode.DebugConfiguration = {
    name: "Debug Legato application (attach)",
    type: "legato",
    request: "attach",
    application: "myNewApp",
    executable: "myNewAppComponentExe"
};


/**
 * Provide Debug configuration and convert Legato conf to cppdebugger conf
 */
export class LegatoDebugManager extends DisposableBag implements vscode.DebugConfigurationProvider {

    /**
     * This manager need 2 others managers
     */
    public constructor(
        private readonly resourcesManager: ResourcesManager,
        private readonly legatoManager: LegatoManager,
        private readonly toolchainManager: LegatoToolchainManager
    ) {
        super();
        this.toDispose(vscode.debug.registerDebugConfigurationProvider("legato", this));
    }

    /**
     * Provides initial [debug configuration](#DebugConfiguration). If more than one debug configuration provider is
     * registered for the same type, debug configurations are concatenated in arbitrary order.
     *
     * @param _folder The workspace folder for which the configurations are used or `undefined` for a folderless setup.
     * @param _token A cancellation token.
     * @return An array of [debug configurations](#DebugConfiguration).
     */
    provideDebugConfigurations(
        _folder: vscode.WorkspaceFolder | undefined,
        _token?: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DebugConfiguration[]> {
        return [DEFAULT_ATTACH_CONF];
    }

    /**
     * Resolves a [debug configuration](#DebugConfiguration) by filling in missing values or by adding/changing/removing attributes.
     * If more than one debug configuration provider is registered for the same type, the resolveDebugConfiguration calls are chained
     * in arbitrary order and the initial debug configuration is piped through the chain.
     * Returning the value 'undefined' prevents the debug session from starting.
     * Returning the value 'null' prevents the debug session from starting and opens the underlying debug configuration instead.
     *
     * @param _folder The workspace folder from which the configuration originates from or `undefined` for a folderless setup.
     * @param legatoDebugConf The [debug configuration](#DebugConfiguration) to resolve.
     * @param _token A cancellation token.
     * @return The resolved debug configuration or undefined or null.
     */
    public async resolveDebugConfiguration(
        _folder: vscode.WorkspaceFolder | undefined,
        legatoDebugConf: vscode.DebugConfiguration,
        _token?: vscode.CancellationToken
    ): Promise<vscode.DebugConfiguration | undefined | null> {
        if (!legatoDebugConf.name) {
            return null;
        }
        let confName = legatoDebugConf.name;
        let localPort: number = legatoDebugConf.localPort || 2000;
        let remotePort: number = legatoDebugConf.remotePort || 2000;
        let applicationName: string = legatoDebugConf.application;
        let executableName: string = legatoDebugConf.executable;
        let sysroot = await this.toolchainManager.getSysroot();
        let symbolsFolder = await this.legatoManager.debugDir.getMandatory();
        let soLibPaths = await this.toolchainManager.getSOLibPaths(applicationName);
        let sshWrapper = this.resourcesManager.getExtensionPath(ExtensionPaths.DebugSshWrapper);
        let appStagging = await this.toolchainManager.getAppStaging(applicationName);
        let executablePath = await this.toolchainManager.getExecutablePath(applicationName, executableName);
        let gdbClient = await this.toolchainManager.getGdb();
        let gdbServer = this.toolchainManager.gdbServerPath;
        let deviceIp = legatoDebugConf.deviceIp || await this.legatoManager.destIp.get() || "192.168.2.2";
        return {
            name: confName,
            type: "cppdbg",
            request: "launch",
            stopAtEntry: false,
            cwd: appStagging,
            externalConsole: false,
            setupCommands: [
                {
                    description: "Set sysroot",
                    text: `set sysroot ${sysroot}`,
                    ignoreFailures: false
                },
                {
                    description: "Set symbols location",
                    text: `set debug-file-directory ${symbolsFolder}`,
                    ignoreFailures: false
                }
            ],
            logging: {
                engineLogging: true,
                trace: true
            },
            program: executablePath,
            MIMode: "gdb",
            miDebuggerPath: gdbClient,
            miDebuggerServerAddress: `localhost:${localPort}`,
            additionalSOLibSearchPath: soLibPaths.join(';'),
            debugServerPath: sshWrapper,
            filterStderr: true,
            filterStdout: false,
            debugServerArgs: `${remotePort} ${localPort} ${gdbServer} ${deviceIp} --attach \$(pidof ${executableName})`,
            serverStarted: `Listening\\ on\\ port\\ ${remotePort}`,
            serverLaunchTimeout: 30000
        };
    }
}