import * as fs from 'fs-extra';
import * as vscode from 'vscode';
import { DidChangeConfigurationNotification, LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';
import { DefinitionObject } from '../../@types/legato-languages';
import { getWorkspaceFolder } from '../../commons/files';
import { DisposableBag } from "../../commons/manager";
import { ModelElement } from '../../commons/model';
import { DelayedPromise } from '../../commons/promise';
import { EnvVars, toStringPartial } from '../../commons/utils';
import { LeafManager } from "../../leaf/api/core";
import { LegatoManager } from "./core";

/**
 * Custom requests specific to Legato
 */
export enum LegatoLanguageRequest {
    LanguageGetProtocolVersion = "le_GetExtensionProtocolVersion",
    LanguageSetProtocolVersion = "le_SetClientExtensionProtocolVersion", // the LSP client can say it supports a specific version
    LegatoRegisterModelUpdates = "le_registerModelUpdates", // since v0.2
    LegatoUnregisterModelUpdates = "le_unregisterModelUpdates", // since v0.2
}

/**
 * Custom notification
 */
export enum LegatoLanguageNotification {
    // to be notified about system view update
    LegatoSystemViewUpdated = "le_UpdateLogicalView",
    LegatoDiagnosticUpdated = "le_SendErrorMessage"
}

export class LegatoLanguageManager extends DisposableBag {
    public languageClient: LanguageClient | undefined = undefined;
    public collection: vscode.DiagnosticCollection;

    // Exposed Model
    public readonly workspaceReady = new ModelElement<boolean>("legato.lsp.ready", this);
    public readonly defFileModel = new ModelElement<DefinitionObject>("legato.lsp.defFileModel", this);

    public constructor(private readonly leafManager: LeafManager, private readonly legatoManager: LegatoManager) {
        super();
        // Create Diagnostic Collection to display errors when parsing the Legato system file
        this.collection = vscode.languages.createDiagnosticCollection('legato');
        // Listen to rootPath and envvars changes
        this.legatoManager.rootPath.addListener(this.stopAndStartLegatoLanguageServer, this);
        this.leafManager.envVars.addListener(this.notifyLeafEnvToLanguageServer, this);
    }

    /**
     *
     * @param start
     * @event LegatoLanguageEvent.LegatoSystemViewUpdated when the language server notifies on [[LegatoLanguageNotification.LegatoSystemViewUpdated]], this event is raised
     */
    private async stopAndStartLegatoLanguageServer() {
        let start = (await this.legatoManager.rootPath.get()) !== undefined;
        if (this.languageClient) {
            this.workspaceReady.set(false);
            await this.languageClient.stop();
        }
        if (start) {
            // Wait for client to start and store instance
            this.languageClient = await this.startLegatoServer();
            await this.languageClient.onReady();
            this.workspaceReady.set(true);
            this.languageClient.onNotification(LegatoLanguageNotification.LegatoSystemViewUpdated, (data: DefinitionObject) => {
                this.defFileModel.set(data);
            });
            // Update Diagnostics for Problems panel when getting notification from Language server
            this.languageClient.onNotification(
                LegatoLanguageNotification.LegatoDiagnosticUpdated, (data: string) => {
                    this.updateDiagnostics(data);
                });
        } else {
            this.workspaceReady.set(false);
            console.warn("Missing Legato env: no attempt to start the Legato language server");
        }
    }

    /**
     * Update Diagnostics for Problems panel
     * @param errorMsg the error message is sent by Language server
     */
    private updateDiagnostics(errorMsg: string): void {
        if (errorMsg) {
            this.collection.clear();
            let diagnosticUri: string[] = new Array;
            let diagnostics: vscode.Diagnostic[][] = new Array;

            let reError =
                /ERROR(( \(root level\)] )+?|(:\n)+?)[\s\S]+?:\d+?:\d+?: error:[\s\S]+?\n/g;
            let errorList = errorMsg.match(reError);
            if (errorList) {
                for (let i = 0; i < errorList.length; i++) {
                    let errorString = errorList[i].replace("ERROR (root level)] ", "")
                        .replace(/ERROR:\n/g, "").replace(/\n$/g, "");
                    let listElement = errorString.split(":");
                    let line = Number(listElement[1]) - 1;
                    let character = Number(listElement[2]);

                    let diagnostic: vscode.Diagnostic = {
                        severity: vscode.DiagnosticSeverity.Error,
                        range: new vscode.Range(new vscode.Position(line, character),
                            new vscode.Position(line, character)),
                        message: `${listElement[3]}:${listElement[4]}`
                    };

                    let j = diagnosticUri.indexOf(listElement[0]);
                    if (j !== -1) {
                        diagnostics[j].push(diagnostic);
                    } else {
                        diagnosticUri.push(listElement[0])
                        diagnostics.push([diagnostic]);
                    }
                }
            }

            for (let i = 0; i < diagnosticUri.length; i++) {
                this.collection.set(vscode.Uri.parse(diagnosticUri[i]), diagnostics[i]);
            }
        } else {
            this.collection.clear();
        }
    }

    private async notifyLeafEnvToLanguageServer(newEnv: EnvVars) {
        console.log(`[LegatoLanguageManager] Leaf env change triggered to LSP: ${toStringPartial(newEnv)}`);
        if (this.languageClient) {
            await this.languageClient.onReady();
            this.languageClient.sendNotification(DidChangeConfigurationNotification.type, newEnv as any);
        }
    }

    /**
      * Start the Legato LSP
      */
    private async startLegatoServer(debug?: boolean): Promise<LanguageClient> {
        try {
            // Get server module
            let serverModule = await this.legatoManager.languageServer.get();
            console.log(`Launching Language server: ${serverModule}`);
            if (!serverModule || (serverModule && !fs.existsSync(serverModule))) {
                throw new Error(`${serverModule} LSP doesn't exist`);
            }

            // The debug options for the server
            // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
            let debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

            // If the extension is launched in debug mode then the debug server options are used
            // Otherwise the run options are used
            let serverOptions: ServerOptions = {
                run: { module: serverModule, transport: TransportKind.ipc },
                debug: {
                    module: serverModule,
                    transport: TransportKind.ipc,
                    options: debugOptions
                }
            };

            // Options to control the language client
            let clientOptions: LanguageClientOptions = {
                // Register the server for plain text documents
                documentSelector: [
                    { scheme: 'file', language: 'sdef' },
                    { scheme: 'file', language: 'adef' },
                    { scheme: 'file', language: 'cdef' },
                    { scheme: 'file', language: 'mdef' },
                    { scheme: 'file', language: 'api' }
                ],
                synchronize: {
                    // Notify the server about file changes to '.clientrc files contained in the workspace
                    fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
                },
                initializationOptions: {
                    env: await this.leafManager.envVars.get(),
                    supportsModelUpdates: true
                },
                workspaceFolder: getWorkspaceFolder()
            };
            // Create the language client and start the client.
            const languageClient = new LanguageClient(
                'legatoServer',
                'Legato Language Server',
                serverOptions,
                clientOptions
            );

            if (!debug) {
                // Start the client. This will also launch the server
                this.toDispose(languageClient.start());
            }

            // Return new client
            return languageClient;
        } catch (reason) {
            let errMsg = `Failed to start the Legato Language server - reason: ${reason}`;
            console.error(errMsg);
            return new DelayedPromise<LanguageClient>() as Promise<LanguageClient>;
        }
    }
}