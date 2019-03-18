import * as fs from 'fs-extra';
import * as vscode from 'vscode';
import { DidChangeConfigurationNotification, DocumentSymbol, LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';
import { DisposableBag } from "../../commons/manager";
import { DelayedPromise } from '../../commons/promise';
import { LeafManager } from "../../leaf/api/core";
import { LegatoManager } from "./core";
import { EnvVars, toStringPartial } from '../../commons/utils';
import { ModelElement, StateModelElement } from '../../commons/model';
import { getWorkspaceFolder } from '../../commons/files';

enum LegatoLanguageRequest {
    LegatoSystemView = "le_GetLogicalView"
}

enum LegatoLanguageNotification {
    LegatoSystemViewUpdated = "le_UpdateLogicalView"
}

export class LegatoLanguageManager extends DisposableBag {
    private lspClient: LanguageClient | undefined = undefined;

    // Exposed Model
    public readonly workspaceReady = new StateModelElement("legato.lsp.ready", this);
    public readonly lspData = new ModelElement<any>("legato.lsp.data", this);

    public constructor(private readonly leafManager: LeafManager, private readonly legatoManager: LegatoManager) {
        super();

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

        if (this.lspClient) {
            this.workspaceReady.set(false);
            await this.lspClient.stop();
        }
        if (start) {
            // Wait for client to start and store instance
            this.lspClient = await this.startLegatoServer();
            await this.lspClient.onReady();
            this.workspaceReady.set(true);

            this.lspClient.onNotification(LegatoLanguageNotification.LegatoSystemViewUpdated, (data: any) => {
                //the received data does not fit DocumentSymbol class
                this.lspData.set(data);
            });
        } else {
            this.workspaceReady.set(false);
            console.warn("Missing Legato env: no attempt to start the Legato language server");
        }
    }

    private async notifyLeafEnvToLanguageServer(newEnv: EnvVars) {
        console.log(`[LegatoLanguageManager] Leaf env change triggered to LSP: ${toStringPartial(newEnv)}`);
        if (this.lspClient) {
            await this.lspClient.onReady();
            this.lspClient.sendNotification(DidChangeConfigurationNotification.type, newEnv as any);
        }
    }

    public async requestLegatoActiveDefFileOutline(activeDefFile: vscode.Uri): Promise<DocumentSymbol> {
        if (this.lspClient) {
            //active definition file URI in its deep dive version
            console.log(`Going to request listSystemInterfaces`);
            await this.lspClient.onReady();
            return this.lspClient.sendRequest<DocumentSymbol>(LegatoLanguageRequest.LegatoSystemView);
        } else {
            throw new Error("No Legato language server found to request symbols");
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
                    { scheme: 'file', language: 'mdef' }
                ],
                synchronize: {
                    // Notify the server about file changes to '.clientrc files contained in the workspace
                    fileEvents: vscode.workspace.createFileSystemWatcher('**/.clientrc')
                },
                initializationOptions: await this.leafManager.envVars.get(),
                workspaceFolder: getWorkspaceFolder()
            };
            // Create the language client and start the client.
            let lspClient = new LanguageClient(
                'legatoServer',
                'Legato Language Server',
                serverOptions,
                clientOptions
            );

            if (!debug) {
                // Start the client. This will also launch the server
                this.toDispose(lspClient.start());
            }

            // Return new client
            return lspClient;
        } catch (reason) {
            let errMsg = `Failed to start the Legato Language server - reason: ${reason}`;
            console.error(errMsg);
            return new DelayedPromise<LanguageClient>() as Promise<LanguageClient>;
        }
    }
}