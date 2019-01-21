'use strict';
import * as vscode from 'vscode';
import * as marked from 'marked';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CommandRegister } from './manager';
import { extPromise, ExtensionPaths } from '../extension';
import { Command } from './identifiers';
import { Configuration } from './configuration';
import { VersionManager, VersionChangeKind } from './version';

/**
 * Manage Welcome page command and auto display
 */
export class WelcomePageManager extends CommandRegister {
    private currentWelcomePage: vscode.WebviewPanel | undefined = undefined;
    private readonly htmlChangeLogProvider = new HtmlChangeLogProvider();

    /**
     * Show welcome page if necessary
     */
    public constructor(private versionManager: VersionManager) {
        super();
        this.createCommand(Command.LegatoCommonShowWelcomePage, this.showWelcomePage, this);
        this.showWelcomePageIfNecessary();
    }

    /**
     * Show welcome page if this is a first install or a major upgrade, show a popup about welcome page it's an upgrade
     */
    private showWelcomePageIfNecessary() {
        switch (this.versionManager.changeKind) {

            // First time install
            case VersionChangeKind.FirstInstall:
                this.showWelcomePage();
                break;

            // Minor upgrade
            case VersionChangeKind.MinorUpgrade:
                // Just show a little popup
                this.showWhatsNewMessage();
                break;

            // Major upgrade
            case VersionChangeKind.MajorUpgrade:
                // Show welcome page if the conf is ok
                if (Configuration.Common.showWhatsNewAfterUpgrades.getValue()) {
                    this.showWelcomePage();
                }
                break;

            // Same version than before or downgrade
            case VersionChangeKind.Same:
            case VersionChangeKind.Downgrade:
                // Do nothing
                break;
        }
    }

    /**
     * Show Welcome page (create it if not created yet)
     */
    private async showWelcomePage() {
        // If there is already a opened welcome page
        if (this.currentWelcomePage) {
            // Just show it
            this.currentWelcomePage.reveal();
            return;
        }

        // Create Webview Panel 
        let ext = await extPromise;
        let welcomeFolder = ext.getExtensionPath(ExtensionPaths.WelcomePage);
        let column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
        this.currentWelcomePage = vscode.window.createWebviewPanel('WelcomePage', 'Welcome to Legato', column || vscode.ViewColumn.One, {
            enableScripts: true,
            enableCommandUris: false,
            localResourceRoots: [
                vscode.Uri.file(welcomeFolder)
            ]
        });
        this.currentWelcomePage.iconPath = vscode.Uri.file(ext.getExtensionPath(ExtensionPaths.Resources, 'legato.png'));
        this.currentWelcomePage.onDidDispose(() => this.currentWelcomePage = undefined);

        // Read html file
        let html = readFileSync(join(welcomeFolder, 'index.html')).toString();

        // Replace special tags and use it
        this.currentWelcomePage.webview.html = html
            .replace(/\$\$\$RESOURCES\$\$\$/gi, welcomeFolder)
            .replace(/\$\$\$CHANGELOG\$\$\$/gi, await this.htmlChangeLogProvider.getChangeLogAsHtml());
    }

    /**
     * Show a popup about new features
     */
    private async showWhatsNewMessage() {
        const action: vscode.MessageItem = { title: "Show welcome page" };

        const result = await vscode.window.showInformationMessage(
            `LegatoExtension has been updated to v${this.versionManager.currentVersion} — check out what's new!`,
            action);

        if (result === action) {
            this.showWelcomePage();
        }
    }
}

/**
 * Convert changelog from markdown to html list using marked lib
 * https://marked.js.org/#/README.md
 * Marked is already used by vscode to embed README.MD to extension pages
 */
class HtmlChangeLogProvider extends marked.Renderer {

    /**
     * Just call super constructor
     */
    constructor() {
        super();
    }

    /**
     * Start first header with h4 instead of h1
     */
    public heading(text: string, level: number, raw: string, slugger: marked.Slugger): string {
        return super.heading(text, level + 3, raw, slugger);
    }

    /**
     * Read changelog.md and convert it from markdown to html
     */
    public async getChangeLogAsHtml(): Promise<string> {
        let changeLogPath = (await extPromise).getExtensionPath(ExtensionPaths.ChangeLog);
        let changeLogContent = readFileSync(changeLogPath).toString();
        // Remove first line (title)
        changeLogContent = changeLogContent.substring(changeLogContent.indexOf('\n'));
        return marked.parse(changeLogContent, { renderer: this });
    }
}