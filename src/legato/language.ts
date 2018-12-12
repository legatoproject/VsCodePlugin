import * as fs from 'fs';
import * as vscode from 'vscode';
import { join } from 'path';
import { DidChangeConfigurationNotification, LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';
import { LeafManager, LEAF_EVENT } from "../leaf/core";
import { DisposableBag } from "../utils";
import { LegatoManager, LEGATO_EVENT, LEGATO_ENV } from "./core";


export class LegatoLanguageManager extends DisposableBag {
    public lspClient: Promise<LanguageClient | undefined>;
    public constructor() {
        super();

        // Listen to leaf events
        LeafManager.getInstance().addListener(LEGATO_EVENT.onLegatoRootChange, this.stopAndStartLegatoLanguageServer, this);
        LeafManager.getInstance().addListener(LEAF_EVENT.leafEnvVarChanged, this.notifyLeafEnvToLanguageServer, this);

        // Launch server
        this.lspClient = this.startLegatoServer();
    }

    private async stopAndStartLegatoLanguageServer(_oldLegatoRoot: string | undefined, newLegatoRoot: string | undefined) {
        let languageClient = await this.lspClient; // wait for end of starting
        if (languageClient) {
            languageClient.stop(); // Should wait for end of stopping by using 'await' ?
        }
        if (newLegatoRoot) {
            this.lspClient = this.startLegatoServer();
        } else {
            console.warn("Missing Legato env: no attempt to start the Legato language server");
        }
    }

    private async notifyLeafEnvToLanguageServer(_oldEnvVar: any | undefined, newEnvVar: any | undefined) {
        console.log(`LEAF ENV CHANGED triggered to LSP`);
        console.log(newEnvVar ? JSON.stringify(newEnvVar) : "undefined");
        let languageClient = await this.lspClient;
        if (languageClient) {
            languageClient.sendNotification(DidChangeConfigurationNotification.type, newEnvVar);
        }
    }

    /**
      * Start the Legato LSP
      */
    public async startLegatoServer(debug?: boolean): Promise<LanguageClient | undefined> {
        try {
            // Get Legato root
            let legatoPath = await LegatoManager.getInstance().getLegatoRoot();
            if (!legatoPath) {
                // Should not happen - This component is loaded only when this envvar is set
                throw new Error(`${LEGATO_ENV.LEGATO_ROOT} not available in env`);
            }

            // Get server module
            let serverModule = join(legatoPath, 'bin', 'languageServer', 'languageServer.js');
            if (!fs.existsSync(serverModule)) {
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
                }
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
                this.toDispose(disposable);
            }
            return lspClient;
        } catch (reason) {
            let errMsg = `Failed to start the Legato Language server - reason: ${reason}`;
            console.error(errMsg);
            return undefined;
        }
    }
}