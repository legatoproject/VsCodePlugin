'use strict';

import * as vscode from 'vscode';
import { workspace } from "vscode";
import { spawn, ChildProcess } from 'child_process';
import { DelayedPromise } from '../../commons/promise';
import { newIdGenerator, deepClone, LeafBridgeElement } from '../../commons/utils';
import { ExtensionPaths, ResourcesManager } from '../../commons/resources';

/**
 * Available leaf bridge commands
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
 * This custom error is thrown when we are in the 'profile out of sync' state
 * where envvars cannot be computed by leaf
 */
export const PROFILE_OUT_OF_SYNC_ERROR = new Error("Profile out of sync");

/**
 * LeafBridge read and write to the IDE dedicated python leaf's extension
 */
export class LeafBridge implements vscode.Disposable {

    /**
     * Python leaf extension process
     */
    private readonly process: ChildProcess;

    /**
     * Request id generator
     */
    private readonly idGenerator: IterableIterator<number> = newIdGenerator();

    /**
     * Buffer for too long response
     */
    private stdoutBuffer: string = "";

    /**
     * Pending promises callbacks
     */
    private pendingRequests: { [key: number]: DelayedPromise<LeafBridgeElement | undefined> } = {};

    /**
     * Need the resource manager to get the bridge path
     */
    public constructor(resources: ResourcesManager) {
        // Launch bridge
        let pathToExec = resources.getExtensionPath(ExtensionPaths.bridge);

        // Copy system env vars
        let env: NodeJS.ProcessEnv = deepClone(process.env);

        // Add Leaf en var
        env.LEAF_NON_INTERACTIVE = "1";
        env.LEAF_DEBUG = "1";

        // Spawn the process
        this.process = spawn(pathToExec, [], {
            cwd: workspace.rootPath,
            env: env
        });

        // Listen from stdout
        this.process.stdout.addListener("data", (chunk: Buffer | string) => this.onBridgeData(chunk));

        // Listen from stderr
        this.process.stderr.addListener("data", (chunk: Buffer | string) => console.log(`[Leaf Bridge] Error from leaf bridge: ${chunk.toString()}`));

        // Configure stdin
        this.process.stdin.setDefaultEncoding('utf-8');
    }

    /**
     * Send request to leaf extension bridge
     */
    public send(cmd: LeafBridgeCommands): Promise<LeafBridgeElement | undefined> {
        let out = new DelayedPromise<LeafBridgeElement | undefined>();
        let id = this.idGenerator.next().value;
        this.pendingRequests[id] = out;
        let requestObject = {
            id: id,
            command: cmd,
            workspace: workspace.rootPath
        };
        this.process.stdin.write(JSON.stringify(requestObject) + '\n');
        console.log(`[Leaf Bridge] Sent comand '${cmd}' with id '${id}'`);
        return out;
    }

    /**
     * Called on bridge data
     * Concatenate, parse then resolve or reject the corresponding promise
     */
    private onBridgeData(chunk: Buffer | string) {
        this.stdoutBuffer += chunk.toString();
        if (this.stdoutBuffer.endsWith("\n")) {
            this.stdoutBuffer
                .split(/\r?\n/) // Split to lines
                .filter(value => value.length > 0) // Discard empty lines
                .forEach(line => this.onBridgeResponse(line)); // Parse line
            this.stdoutBuffer = "";
        }
    }

    /**
     * Called on bridge response
     * Parse then resolve or reject the corresponding promise
     */
    private onBridgeResponse(line: string) {
        try {
            let anyResponse: any = JSON.parse(line);
            if (this.pendingRequests && anyResponse.id in this.pendingRequests) {
                let pendingRequest = this.pendingRequests[anyResponse.id];
                if (anyResponse.result) {
                    pendingRequest.resolve(anyResponse.result);
                    console.log(`[Leaf Bridge] Response received for id '${anyResponse.id}': '${line.substring(0, 10)}...'`);
                } else if (anyResponse.error) {
                    let errorType = anyResponse.error.type;
                    if (errorType === 'ProfileOutOfSyncException') {
                        pendingRequest.reject(PROFILE_OUT_OF_SYNC_ERROR);
                    } else {
                        pendingRequest.resolve(undefined);
                    }
                    console.log(`[Leaf Bridge] Error received for id '${anyResponse.id}': '${errorType} -> ${anyResponse.error.message}'`);
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
            console.log(`[Leaf Bridge] ${e}: ${line}`);
        }
    }

    /**
     * Terminate bridge binary and remove all listeners
     */
    public async dispose() {
        await this.send(LeafBridgeCommands.Exit);
        this.process.stdin.end();
        this.process.stdout.removeAllListeners();
        this.process.stderr.removeAllListeners();
    }
}
