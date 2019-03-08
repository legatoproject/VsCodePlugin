import * as fs from 'fs-extra';
import * as vscode from 'vscode';
import { DidChangeConfigurationNotification, DocumentSymbol, LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';
import { AbstractManager } from "../commons/manager";
import { DelayedPromise } from '../commons/promise';
import { LeafEvent, LeafManager } from "../leaf/core";
import { LegatoEvent, LegatoManager, LEGATO_ENV } from "./core";

enum LegatoLanguageRequest {
    LegatoSystemView = "le_GetLogicalView"
}

enum LegatoLanguageNotification {
    LegatoSystemViewUpdated = "le_UpdateLogicalView"
}

export enum LegatoLanguageEvent { // Events with theirs parameters
    OnLegatoSystemViewUpdated = "LegatoSystemViewUpdated", // newLogicalView: le_DefinitionObject
}

export class LegatoLanguageManager extends AbstractManager<LegatoLanguageEvent> {
    public lspClient: LanguageClient | undefined = undefined;
    public lspClientPromise: Promise<LanguageClient> = new DelayedPromise<LanguageClient>();
    public constructor(private readonly leafManager: LeafManager, private readonly legatoManager: LegatoManager) {
        super();

        // Listen to leaf events
        this.legatoManager.addListener(LegatoEvent.OnLegatoRootChange, this.onLegatoRootChange, this);
        this.legatoManager.addListener(LegatoEvent.OnInLegatoWorkspaceChange, this.onInLegatoWorkspaceChange, this);
        this.leafManager.addListener(LeafEvent.EnvVarsChanged, this.notifyLeafEnvToLanguageServer, this);

        // Launch server
        this.stopAndStartLegatoLanguageServer();
    }

    private async onLegatoRootChange(_oldLegatoRoot: string | undefined, newLegatoRoot: string | undefined) {
        this.stopAndStartLegatoLanguageServer(newLegatoRoot !== undefined);
    }

    private async onInLegatoWorkspaceChange(_oldIsLegatoWorkspace: boolean, newIsLegatoWorkspace: boolean) {
        this.stopAndStartLegatoLanguageServer(newIsLegatoWorkspace);
    }

    /**
     * 
     * @param start 
     * @event LegatoLanguageEvent.LegatoSystemViewUpdated when the language server notifies on [[LegatoLanguageNotification.LegatoSystemViewUpdated]], this event is raised
     */
    private async stopAndStartLegatoLanguageServer(start?: boolean) {
        if (!start) {
            start = (await this.legatoManager.getLegatoRoot()) !== undefined;
        }

        if (this.lspClient) {
            this.lspClient.stop(); // Should wait for end of stopping by using 'await' ?
        }
        if (start) {
            let oldlspClientPromise = this.lspClientPromise;
            let newlspClientPromise = this.startLegatoServer();

            // Store new promise
            this.lspClientPromise = newlspClientPromise;

            // Wait for client to start and store instance
            this.lspClient = await newlspClientPromise;
            await this.lspClient.onReady();

            this.lspClient.onNotification(LegatoLanguageNotification.LegatoSystemViewUpdated, (data: any) => {
                //the received data does not fit DocumentSymbol class
                this.emit(LegatoLanguageEvent.OnLegatoSystemViewUpdated, data);
            });

            // Resolve the delayed promise if exist
            if (oldlspClientPromise) {
                // All modules which await for this.lspClientPromise will be resumed
                (oldlspClientPromise as DelayedPromise<LanguageClient>).resolve(this.lspClient);
            }
        } else {
            console.warn("Missing Legato env: no attempt to start the Legato language server");
        }
    }

    private async notifyLeafEnvToLanguageServer(_oldEnv: any | undefined, newEnv: any | undefined) {
        console.log(`[LegatoLanguageManager] Leaf env change triggered to LSP: ${JSON.stringify(newEnv)}`);
        if (this.lspClient) {
            await this.lspClient.onReady();
            this.lspClient.sendNotification(DidChangeConfigurationNotification.type, newEnv);
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
            // Get Legato root
            let legatoPath = await this.legatoManager.getLegatoRoot();
            if (!legatoPath) {
                // Should not happen - This component is loaded only when this envvar is set
                throw new Error(`${LEGATO_ENV.LEGATO_ROOT} not available in env`);
            }

            // Get server module
            let serverModule = await this.leafManager.getEnvValue(LEGATO_ENV.LEGATO_LANGUAGE_SERVER);
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
                initializationOptions: await this.leafManager.getEnvVars(),
                workspaceFolder: this.leafManager.getVsCodeLeafWorkspaceFolder()
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
                let disposable: vscode.Disposable = lspClient.start();
                this.disposables.push(disposable);
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