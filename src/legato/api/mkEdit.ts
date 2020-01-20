'use strict';
import * as path from 'path';
import * as vscode from "vscode";
import { ModelElement } from "../../commons/model";
import { TaskProcessLauncher, ProcessLauncherOptions } from "../../commons/process";
import { TaskDefinitionType } from "../../commons/identifiers";

/**
 * Same as ProcessLauncherOptions with deffile model element
 */
export interface MkEditOptions extends ProcessLauncherOptions {
    readonly defFile: ModelElement<vscode.Uri | undefined>;
}

/**
 * Expose MkEdit tool API
 */
export class MkEditManager {
    /**
     * Used to call mkedit
     */
    private readonly processLauncher: TaskProcessLauncher;

    /**
     * The def file model element to keep an handle on current def file
     */
    private readonly defFile: ModelElement<vscode.Uri | undefined>;

    /**
     * Create process launcher
     */
    public constructor(options: MkEditOptions) {
        this.defFile = options.defFile;

        // Create the task process launcher (this class can launch a process as a vscode task)
        this.processLauncher = new TaskProcessLauncher(TaskDefinitionType.LegatoBuild, options);
    }

    /**
     * @returns directory path of the current def file
     * Throw an error of no def file is set
     */
    private async getDefFileDirPath(): Promise<string> {
        let uri = await this.defFile.get();
        if (!uri) {
            throw new Error('No active def file selected');
        }
        return path.dirname(uri.fsPath);
    }

    /**
     * Invoke mkedit to create new system
     * @param name the new system name
     */
    public createSystem(name: string): Promise<void> {
        return this.processLauncher.executeInShell(
            `Create new system ${name}`,
            `mkedit create system ${name}`);
    }

    /**
     * Invoke mkedit to rename an existing system
     * @param oldName the system to rename
     * @param newName the new name of the system
     */
    public async renameSystem(oldName: string, newName: string): Promise<void> {
        return this.processLauncher.executeInShell(
            `Rename system ${oldName} to ${newName}`,
            `mkedit rename system ${oldName} ${newName}`,
            await this.getDefFileDirPath());
    }

    /**
     * Invoke mkedit to create new application
     * @param name the name of the new application
     */
    public async newApplication(name: string): Promise<void> {
        return this.processLauncher.executeInShell(
            `Create new app ${name}`,
            `mkedit create app ${name}`,
            await this.getDefFileDirPath());
    }

    /**
     * Invoke mkedit to add an existing application to the current system
     * @param name the name of the new application
     */
    public addExistingApplication(filePath: string): Promise<void> {
        let name = path.basename(filePath, path.extname(filePath));

        return this.processLauncher.executeInShell(
            `Add existing application ${name}`,
            `mkedit add app ${filePath}`);
    }

    /**
     * Invoke mkedit to rename an existing application
     * @param oldName the application to rename
     * @param newName the new name of the application
     */
    public async renameApplication(oldName: string, newName: string): Promise<void> {
        return this.processLauncher.executeInShell(
            `Rename application from ${oldName} to ${newName}`,
            `mkedit rename app ${oldName} ${newName}`,
            await this.getDefFileDirPath());
    }

    /**
     * Invoke mkedit to remove an existing application
     * @param name the name of the application to remove
     */
    public async removeApplication(filePath: string): Promise<void> {
        let name = path.basename(filePath, path.extname(filePath));
        return this.processLauncher.executeInShell(
            `Remove application ${name}`,
            `mkedit remove app ${filePath}`,
            await this.getDefFileDirPath());
    }

    /**
     * Invoke mkedit to delete an existing application
     * @param name the name of the application to delete
     */
    public async deleteApplication(filePath: string): Promise<void> {
        let name = path.basename(filePath, path.extname(filePath));
        return this.processLauncher.executeInShell(
            `Delete application ${name}`,
            `mkedit delete app ${filePath}`,
            await this.getDefFileDirPath());
    }

    /**
     * Invoke mkedit to add an existing component to the current system
     * @param name the name of the existing component to add
     */
    public async addExistingComponent(appFilePath: string, componentName: string): Promise<void> {
        return this.processLauncher.executeInShell(
            `Add existing component ${componentName}`,
            `mkedit add component ${componentName} app ${appFilePath}`,
            await this.getDefFileDirPath());
    }

    /**
     * Invoke mkedit to create new component in an application
     * @param appName the name of the application where to add the component
     * @param compName the name of the component to create in the application
     */
    public async newComponent(appPath: string, compName: string): Promise<void> {
        let appName = path.basename(appPath, path.extname(appPath));
        return this.processLauncher.executeInShell(
            `Create new component ${compName} in application ${appName}`,
            `mkedit create component ${compName} app ${appPath}`,
            await this.getDefFileDirPath());
    }

    /**
     * Invoke mkedit to rename an existing component
     * @param oldName the component to rename
     * @param newName the new name of the component
     */
    public async renameComponent(oldName: string, newName: string): Promise<void> {
        return this.processLauncher.executeInShell(
            `Rename component from ${oldName} to ${newName}`,
            `mkedit rename component ${oldName} ${newName}`,
            await this.getDefFileDirPath());
    }

    /**
     * Invoke mkedit to remove an existing component
     * @param name the name of the component to remove
     */
    public async removeComponent(name: string): Promise<void> {
        return this.processLauncher.executeInShell(
            `Remove component ${name}`,
            `mkedit remove component ${name}`,
            await this.getDefFileDirPath());
    }

    /**
     * Invoke mkedit to delete an existing component
     * @param name the name of the component to delete
     */
    public async deleteComponent(name: string): Promise<void> {
        return this.processLauncher.executeInShell(
            `Delete component ${name}`,
            `mkedit delete component ${name}`,
            await this.getDefFileDirPath());
    }
}