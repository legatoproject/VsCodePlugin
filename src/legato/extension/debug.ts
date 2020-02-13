'use strict';
import * as vscode from 'vscode';
import { DisposableBag } from '../../commons/manager';
import { LegatoToolchainManager } from '../api/toolchain';
import { ResourcesManager, ExtensionPaths } from '../../commons/resources';
import { LegatoManager } from '../api/core';
import { RemoteDeviceManager, AppStatus } from '../../tm/api/remote';
import { LeafManager, LeafEnvScope } from '../../leaf/api/core';
import { LegatoBuildTasks } from './buildtasks';
import { basename } from 'path';
import { executeInShell } from '../../commons/utils';

/**
 * Provide Debug configuration and convert Legato conf to cppdebugger conf
 */
export class LegatoDebugManager extends DisposableBag implements vscode.DebugConfigurationProvider {

    /**
     * This manager need 2 others managers
     */
    public constructor(
        private readonly resourcesManager: ResourcesManager,
        private readonly leafManager: LeafManager,
        private readonly legatoManager: LegatoManager,
        private readonly legatoBuildTasks: LegatoBuildTasks,
        private readonly toolchainManager: LegatoToolchainManager,
        private readonly remoteDeviceManager: RemoteDeviceManager
    ) {
        super();
        this.toDispose(vscode.debug.registerDebugConfigurationProvider("legato-attach", this));
        this.toDispose(vscode.debug.registerDebugConfigurationProvider("legato-launch", this));
        this.toDispose(vscode.debug.onDidTerminateDebugSession(this.onDidTerminateDebugSession, this));
    }

    /**
     * Create build and install task.
     * Execute it if available. Throw an error if not.
     * @returns An object representing an executed Task. It can be used to terminate a task.
     */
    private async buildAndInstall(): Promise<vscode.TaskExecution> {
        let task = await this.legatoBuildTasks.createBuildAndInstallTask();
        if (task) {
            return vscode.tasks.executeTask(task);
        } else {
            throw new Error('Build and install command is not available. Please ensure that def file is set');
        }
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

        // Check debug dir
        let symbolsFolder = await this.legatoManager.debugDir.get();
        if (!symbolsFolder) {
            let action = 'Toggle the build in debug mode';
            let result = await vscode.window.showInformationMessage(
                'Debug symbols not found. Do you want to toggle the build in debug mode?',
                action);
            if (result === action) {
                await this.leafManager.setEnvValue(this.legatoManager.debugDir.name, '.debug', LeafEnvScope.Workspace);
                await this.buildAndInstall();
            }
            // Debug session canceled
            return;
        }

        // Provision config
        let confName = legatoDebugConf.name;
        let localPort: number = legatoDebugConf.localPort || 2000;
        let remotePort: number = legatoDebugConf.remotePort || 2000;
        let applicationName: string = legatoDebugConf.application;
        let executableName: string = legatoDebugConf.executable;
        let soLibPaths = await this.toolchainManager.getSOLibPaths(applicationName);
        let sshWrapper = this.resourcesManager.getExtensionPath(ExtensionPaths.DebugSshWrapper);
        let appStagging = await this.toolchainManager.getAppStaging(applicationName);
        let executablePathFromHost = await this.toolchainManager.getExecutablePath(applicationName, executableName);
        let executablePathFromDevice = await this.remoteDeviceManager.getExecutablePath(applicationName, executableName);
        let gdbClient = await this.toolchainManager.getGdb();
        let gdbServer = this.remoteDeviceManager.gdbServerPath;
        let deviceIp = legatoDebugConf.deviceIp || await this.legatoManager.destIp.get() || "192.168.2.2";

        // Check DevModeInstalled
        let installedApps = await this.remoteDeviceManager.getInstalledApps();
        if (!('devMode' in installedApps)) {
            let action = "Build and install 'devMode' application";
            let result = await vscode.window.showInformationMessage(
                "'devMode' application is not installed, do you want to build and install it?",
                action);
            if (result === action) {
                await this.leafManager.setEnvValue(this.legatoManager.devMode.name, '1', LeafEnvScope.Workspace);
                await this.buildAndInstall();
            }
            // Debug session canceled
            return;
        }

        // Check debugged app is installed
        if (!(applicationName in installedApps)) {
            throw new Error(`${applicationName} app is not installed on device`);
        }

        // Check debugged app is launched with the right mode
        let debugLaunchModeProcesses: string[];
        let gdbserverArgs: string;
        let stopAtEntry: boolean;
        let sysroot: string;
        if (legatoDebugConf.request === 'attach') {
            // Attach mode
            debugLaunchModeProcesses = [];
            gdbserverArgs = `--attach \$(pidof ${executableName})`;
            stopAtEntry = false;
            sysroot = await this.toolchainManager.getSysroot();
        } else {
            // Launch mode
            debugLaunchModeProcesses = [executableName];
            gdbserverArgs = executablePathFromDevice;
            stopAtEntry = true;
            sysroot = "remote:/";
        }
        // Stop app if running or paused
        if (installedApps[applicationName] !== AppStatus.Stopped) {
            await this.remoteDeviceManager.stopApp(applicationName);
        }
        // Start app with the right mode
        await this.remoteDeviceManager.startApp(applicationName, ...debugLaunchModeProcesses);

        // Launch debug session
        return {
            name: confName,
            type: "cppdbg",
            request: "launch",
            stopAtEntry: stopAtEntry,
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
            program: executablePathFromHost,
            MIMode: "gdb",
            miDebuggerPath: gdbClient,
            miDebuggerServerAddress: `localhost:${localPort}`,
            additionalSOLibSearchPath: soLibPaths.join(';'),
            debugServerPath: sshWrapper,
            filterStderr: true,
            filterStdout: false,
            debugServerArgs: `${remotePort} ${localPort} ${gdbServer} ${deviceIp} ${gdbserverArgs}`,
            serverStarted: `Listening\\ on\\ port\\ ${remotePort}`,
            serverLaunchTimeout: 30000
        };
    }

    /**
     * Ensure gdbserver is killed at the end of the session
     * @param session the terminated debug session
     */
    public async onDidTerminateDebugSession(session: vscode.DebugSession) {
        let gdbServerBinName = basename(this.remoteDeviceManager.gdbServerPath);
        let deviceIp = await this.legatoManager.destIp.get() || "192.168.2.2";
        let remoteCmd = `ssh root@${deviceIp} "killall -9 ${gdbServerBinName}"`;
        try {
            await executeInShell(remoteCmd);
        } catch {
            // No gdbserver to kill
        }
    }
}
