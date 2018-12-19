'use strict';

import { workspace } from "vscode";
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { PromiseCallbacks } from '../utils';

/**
 * Available leaf interface commands
 */
export const enum LeafBridgeCommands {
    Info = "info",
    Remotes = "remotes",
    Packages = "packages",
    WorkspaceInfo = "workspaceInfo",
    ResolveVar = "resolveVariables",
    Exit = "exit"
}

/**
 * Interface for result returned by leaf bridge
 */
export interface LeafBridgeElement {
    [key: string]: any;
}

/**
 * LeafInterface read and write to the IDE dedicated python leaf's extension
 */
export class LeafBridge {

    private readonly process: ChildProcess; // Python leaf extension process
    private readonly idGenerator: IterableIterator<number> = LeafBridge.newIdGenerator(); // request id generator
    private stdoutBuffer: string = ""; // Buffer for too loog response
    private pendingRequests: PromiseCallbacks<LeafBridgeElement | undefined> = {}; // pending promises callbacks

    public constructor() {
        // Launch interface
        let pathToExec = join(__filename, '..', '..', '..', 'python-src', 'leaf-bridge.py');

        // Copy system env vars
        let env: NodeJS.ProcessEnv = {};
        Object.keys(process.env).forEach(key => env[key] = process.env[key]);

        // Add Leaf en var
        env.LEAF_NON_INTERACTIVE = "1";
        env.LEAF_DEBUG = "1";

        // Spawn the process
        this.process = spawn(pathToExec, [], {
            cwd: workspace.rootPath,
            env: env
        });

        // Listen from stdout
        this.process.stdout.addListener("data", (chunk: Buffer | string) => this.onInterfaceResponse(chunk));

        // Listen from stderr
        this.process.stderr.addListener("data", (chunk: Buffer | string) => console.log(`Error from leaf interface: ${chunk.toString()}`));

        // Configure stdin
        this.process.stdin.setDefaultEncoding('utf-8');
    }

    /**
     * Send request to leaf extension interface
     */
    public async send(cmd: LeafBridgeCommands): Promise<LeafBridgeElement | undefined> {
        return new Promise<LeafBridgeElement | undefined>((resolve, reject) => {
            let id = this.idGenerator.next().value;
            this.pendingRequests[id] = {
                resolve: resolve,
                reject: reject
            };
            let requestObject = {
                id: id,
                command: cmd,
                workspace: workspace.rootPath
            };
            this.process.stdin.write(JSON.stringify(requestObject) + '\n');
            console.log(`[Leaf Bridge] Sent comand '${cmd}' with id '${id}'`);
        });
    }

    /**
     * Called on interface response.
     * Concatenate and parse the resolve or reject the corresponding promise
     */
    private onInterfaceResponse(chunk: Buffer | string) {
        this.stdoutBuffer += chunk.toString();
        if (this.stdoutBuffer.endsWith("\n")) {
            let lines: string[] = this.stdoutBuffer.split(/\r?\n/).filter((value) => value.length > 0);
            this.stdoutBuffer = "";
            for (let line of lines) {
                try {
                    let anyResponse: any = JSON.parse(line);
                    if (this.pendingRequests && anyResponse.id in this.pendingRequests) {
                        let pendingRequest = this.pendingRequests[anyResponse.id];
                        if (anyResponse.result) {
                            pendingRequest.resolve(anyResponse.result);
                            console.log(`[Leaf Bridge] Response received for id '${anyResponse.id}': '${line.substring(0, 10)}...'`);
                        } else if (anyResponse.error) {
                            pendingRequest.resolve(undefined);
                            console.log(`[Leaf Bridge] Error received for id '${anyResponse.id}': '${anyResponse.error}...'`);
                        } else {
                            pendingRequest.resolve(undefined);
                            console.log(`[Leaf Bridge] No 'result' or 'error' child node in parsed json '${line.substring(0, 10)}...'`);
                        }
                        delete this.pendingRequests[anyResponse.id];
                    } else {
                        console.log(`[Leaf Bridge] Unknown response id ${anyResponse.id}`);
                        throw new Error(`Unknown response id ${anyResponse.id}`);
                    }
                } catch (e) {
                    console.log(`${e}: ${chunk}`);
                }
            }
        }
    }

    /**
     * Request Id generator
     */
    private static * newIdGenerator(): IterableIterator<number> {
        var id = 0;
        while (true) {
            yield id++;
        }
    }

    public async dispose() {
        this.process.stdin.end();
        this.process.stdout.removeAllListeners();
        this.process.stderr.removeAllListeners();
        this.send(LeafBridgeCommands.Exit);
    }
}
