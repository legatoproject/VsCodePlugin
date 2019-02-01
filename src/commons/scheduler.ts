'use strict';

import * as vscode from "vscode";
import { ACTION_LABELS } from './uiUtils';
import { WaitingPromise } from '../commons/promise';

/**
 * Internal enum used to process waiting queue
 */
const enum Queueing {
    Queue, // Add to execution queue right now
    Wait, // Do nothing, waiting queue will be used later
    Cancel // Cancel and empty waiting queue
}

/**
 * Can schedule a WaitingPromise and return it as a regular promise
 */
export interface Scheduler {
    schedule<T>(operation: WaitingPromise<T>): Promise<T>;
}

/**
 * Execute right now
 */
export class Immediate implements Scheduler {
    public async schedule<T>(operation: WaitingPromise<T>): Promise<T> {
        console.log('[Scheduler][Immediate] Execute operation');
        return operation.execute();
    }
}

/**
 * Ensure than all scheduled operations are executed one after the other
 */
export class Sequencer implements Scheduler {
    private waitingQueue: WaitingPromise<any>[] = [];
    private runningOperation: WaitingPromise<any> | undefined = undefined;
    private readonly executionQueue: WaitingPromise<any>[] = [];
    private currentQueueingPopup: Thenable<string | undefined> | undefined = undefined;

    /**
     * resourceName the name of the resource that need a Sequencer
     */
    public constructor(private readonly resourceName: string) { }

    /**
     * Execute an operation as soon as the queue is empty
     */
    public schedule<T>(operation: WaitingPromise<T>): Promise<T> {
        console.log(`[Scheduler][Sequencer] Add operation to waiting queue: ${operation.id}`);
        this.scheduleOperation(operation);
        return operation;
    }

    /**
     * If there is no operation running, run it
     * If the is already an operation, ask user permission to add operation in a queue.
     */
    private async scheduleOperation(operation: WaitingPromise<any>) {
        this.waitingQueue.push(operation);
        let queueing = this.runningOperation ? await this.askUserAboutAddingToQueue() : Queueing.Queue;
        let waitingQueueAsString = this.waitingQueue.map(op => op.id).join(', ');
        switch (queueing) {
            case Queueing.Queue:
                console.log(`[Scheduler][Sequencer] Add operation(s) to execution queue: [${waitingQueueAsString}]`);
                this.executionQueue.push(...this.waitingQueue);
                this.waitingQueue = [];
                this.runNextOperation();
                break;
            case Queueing.Cancel:
                console.log(`[Scheduler][Sequencer] Operation(s) canceled by user: [${waitingQueueAsString}]`);
                this.waitingQueue.forEach(op => op.reject(new Error("Operation canceled by user")));
                this.waitingQueue = [];
                break;
            case Queueing.Wait:
                // Do nothing
                break;
        }
    }

    /**
     * Show warning message with "Forget" and "Cancel" buttons
     */
    private async askUserAboutAddingToQueue(): Promise<Queueing> {
        // If there is already a popup, do nothing
        if (this.currentQueueingPopup) {
            return Queueing.Wait;
        }

        // If not, let's show a new one
        this.currentQueueingPopup = vscode.window.showWarningMessage(
            `${this.resourceName} is already busy. Do you want to queue this new operation for later execution, or simply forget it?`,
            ACTION_LABELS.FORGET,
            ACTION_LABELS.ADD_TO_QUEUE);

        // Wait for user response
        let result = await this.currentQueueingPopup;

        // Mark popup as closed
        this.currentQueueingPopup = undefined;

        // Return result
        return result === ACTION_LABELS.ADD_TO_QUEUE ? Queueing.Queue : Queueing.Cancel;
    }

    /**
     * Run next task if any
     */
    private async runNextOperation() {
        if (this.runningOperation) {
            let len = this.executionQueue.length;
            if (len > 0) {
                console.log(`[Scheduler][Sequencer] ${len} operation(s) postponed due to other operation running: #${this.runningOperation.id}`);
            }
        } else {
            // Update queue
            this.runningOperation = this.executionQueue.shift();

            // If there is a next operation, let's execute it
            if (this.runningOperation) {
                console.log(`[Scheduler][Sequencer] Execute operation: #${this.runningOperation.id}`);
                await this.runningOperation.execute(); // Wait until the end of this operation
                this.runningOperation = undefined;
                this.runNextOperation(); // Try running next one if exist
            }
        }
    }
}
