import * as fs from 'fs';
import * as vscode from 'vscode';
import { DidChangeConfigurationNotification, LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';
import { LeafManager, LEAF_EVENT } from "../leaf/leafCore";
import { DisposableBag } from "../utils";
import { LegatoManager, LEGATO_EVENT } from "./legatoCore";


export class LegatoLanguageManager extends DisposableBag {
    public lspClient: LanguageClient | undefined;
    public constructor() {
        super();

        LeafManager.getInstance().addListener(LEGATO_EVENT.onInLegatoRootChange,
            this.stopAndStartLegatoLanguageServer);

        LeafManager.getInstance().addListener(LEAF_EVENT.leafEnvVarChanged,
            this.notifyLeafEnvToLanguageServer);

        this.startLegatoServer().catch(reason => {
            this.onLanguageServerLaunchError(reason);
        });
    }

    private onLanguageServerLaunchError(reason: any) {
        this.dispose();
        console.error(`Failed to start the Legato Language server - reason: ${reason}`);
    }

    private stopAndStartLegatoLanguageServer(_old: any, newLegatoRoot: any): void {
        (<LanguageClient>this.lspClient).stop();
        if (newLegatoRoot) {
            this.startLegatoServer();
        } else {
            console.warn("Missing Legato env: no attempt to start the Legato language server");
        }
    }

    private notifyLeafEnvToLanguageServer(this: LegatoLanguageManager, _oldEnv: any, newEnv: any): void {
        console.log(`LEAF ENV CHANGED triggered to LSP`);
        console.log(JSON.stringify(newEnv));
        let languageClient = (<LanguageClient>this.lspClient);
        if (languageClient) {
            languageClient.sendNotification(DidChangeConfigurationNotification.type, newEnv);
        }
    }

    /**
      * Start the Legato LSP
      */
    public async startLegatoServer(debug?: boolean): Promise<LanguageClient> {
        let path = require('path');
        let legatoPath = await LegatoManager.getInstance().getLegatoRoot();
        let serverModule = path.join(legatoPath, 'bin', 'languageServer', 'languageServer.js');
        if (!fs.existsSync(serverModule)) {
            throw new Error(serverModule + " LSP doesn't exist");
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
        this.lspClient = new LanguageClient(
            'legatoServer',
            'Legato Language Server',
            serverOptions,
            clientOptions
        );

        if (!debug) {
            // Start the client. This will also launch the server
            let disposable: vscode.Disposable = this.lspClient.start();
            this.toDispose(disposable);
        }
        return this.lspClient;
    }
}