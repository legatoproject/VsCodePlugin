'use strict';

import { workspace } from "vscode";
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import {PromiseCallbacks} from '../utils'

export const LEAF_INTERFACE_COMMANDS = {
    VERSION: "version",
    REMOTES: "remotes",
    INSTALLED_PACKAGES: "installedPackages",
    AVAILABLE_PACKAGES: "availablePackages",
    WORKSPACE_INFO: "workspaceInfo",
    RESOLVE_VAR: "resolveVariables",
    EXIT: "exit"
};


/**
 * LeafInterface read and write to the IDE dedicated python leaf's extension
 */
export class LeafInterface {

    private readonly process: ChildProcess;
    private readonly idGenerator: IterableIterator<number> = LeafInterface.newIdGenerator();
    private stdoutBuffer: string = "";
    private pendingRequests: PromiseCallbacks = {};

    public constructor() {
        // Launch interface
        let pathToExec = path.join(__filename, '..', '..', '..', 'python-src', 'leaf-codeInterface.py');
        this.process = spawn(pathToExec, [], {
            cwd: workspace.rootPath,
            env: {
                LEAF_NON_INTERACTIVE: 1,
                LEAF_DEBUG: 1,
                PWD: workspace.rootPath
            }
        });

        // Listen from stdout
        this.process.stdout.addListener("data", (chunk: Buffer | string) => this.onInterfaceResponse(chunk));

        // Listen from stderr
        this.process.stderr.addListener("data", (chunk: Buffer | string) => console.log(`Error from leaf interface: ${chunk.toString()}`));

        // Configure stdin
        this.process.stdin.setDefaultEncoding('utf-8');
    }

    public async send(cmd: string): Promise<any> {
        return new Promise<any>((resolve, reject) => {
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
        });
    }

    private onInterfaceResponse(chunk: Buffer | string) {
        this.stdoutBuffer += chunk.toString();
        if (this.stdoutBuffer.endsWith("\n")) {
            let lines = this.stdoutBuffer.split(/\r?\n/).filter((value) => value.length > 0);
            this.stdoutBuffer = "";
            for (var index in lines) {
                try {
                    let leafResponse = JSON.parse(lines[index]);
                    if (this.pendingRequests && leafResponse.id in this.pendingRequests) {
                        let pendingRequest = this.pendingRequests[leafResponse.id];
                        if (leafResponse.result) {
                            pendingRequest.resolve(leafResponse.result);
                        } else if (leafResponse.error) {
                            pendingRequest.reject(new Error(leafResponse.error));
                        } else {
                            pendingRequest.reject(new Error(`Unable to parse leaf interface : ${leafResponse}`));
                        }
                        delete this.pendingRequests[leafResponse.id];
                    } else {
                        throw new Error(`Unknown response id ${leafResponse.id}`);
                    }
                } catch (e) {
                    console.log(`${e}: ${chunk}`);
                }
            }
        }
    }

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
        this.send(LEAF_INTERFACE_COMMANDS.EXIT);
    }
}
