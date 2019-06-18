'use strict';

import * as vscode from "vscode";
import { ACTION_LABELS } from './uiUtils';
import { WaitingPromise } from './promise';
import { LEAF_TASK_PREFIX } from "./process";

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
    /**
     * Very simple implementation, just log and execute it
     */
    public async schedule<T>(operation: WaitingPromise<T>): Promise<T> {
        console.log('[Scheduler][Immediate] Execute operation');
        return operation.execute();
    }
}

/**
 * Ensure than all scheduled operations are executed one after the other
 */
export class Sequencer implements Scheduler {
    /**
     * This queue is where all scheduled operation are stacked
     */
    private waitingQueue: WaitingPromise<any>[] = [];

    /**
     * When the operation is scheduled, it is moved from waitingQueue to executionQueue
     */
    private executionQueue: WaitingPromise<any>[] = [];

    /**
     * The currently running operation
     */
    protected runningOperation: WaitingPromise<any> | undefined = undefined;

    /**
     * resourceName the name of the resource that need a Sequencer
     */
    public constructor(protected readonly resourceName: string) { }

    /**
     * Execute an operation as soon as the queue is empty
     */
    public schedule<T>(operation: WaitingPromise<T>): Promise<T> {
        console.log(`[Scheduler][Sequencer] Add operation to waiting queue: ${operation.id}`);
        this.scheduleOperation(operation);
        return operation;
    }

    /**
     * Return human readable list of an operation queue
     */
    private getOperationQueueAsString(queue: WaitingPromise<any>[]): string {
        return queue.map(op => op.id).join(', ');
    }

    /**
     * If there is no operation running, run it
     * If the is already an operation, ask user permission to add operation in a queue.
     */
    private async scheduleOperation(operation: WaitingPromise<any>) {
        try {
            this.waitingQueue.push(operation);
            let queueing = await this.getQueuing();
            let waitingQueueAsString = this.getOperationQueueAsString(this.waitingQueue);
            switch (queueing) {
                case Queueing.Queue:
                    console.log(`[Scheduler][Sequencer] Add operation(s) to execution queue: [${waitingQueueAsString}]`);
                    this.executionQueue.push(...this.waitingQueue);
                    this.waitingQueue = [];
                    await this.runNextOperation();
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
        } catch (reason) {
            // Catch and log because this method is never awaited
            console.error(reason);
        }
    }

    /**
     * @return queuing strategy to use (always Queueing.Queue)
     */
    protected async getQueuing(): Promise<Queueing> {
        return Queueing.Queue;
    }

    /**
     * Run next task if any
     */
    private async runNextOperation(): Promise<void> {
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
                try {
                    await this.runningOperation.execute(); // Wait until the end of this operation
                } catch (reason) {
                    // If the operation fail, log error and cancel all scheduled operations
                    console.error(reason);
                    let allOperations = this.waitingQueue.concat(this.executionQueue);
                    let len = allOperations.length;
                    if (len > 0) {
                        console.log(`[Scheduler][Sequencer] ${len} operation(s) canceled due to an error in current operation: [${this.getOperationQueueAsString(allOperations)}]`);
                        allOperations.forEach(op => op.reject(new Error("Operation canceled due to current operation error")));
                        this.waitingQueue = [];
                        this.executionQueue = [];
                    }
                } finally {
                    this.runningOperation = undefined;
                    await this.runNextOperation(); // Try running next one if exist
                }
            }
        }
    }
}

/**
 * Ensure than all scheduled operations are executed one after the other
 * If an operation is already running when another is requested, ask if the operation must be forgotten or queued
 */
export class PoliteSequencer extends Sequencer {
    /**
     * Current visible queuing popup if any
     */
    private currentQueueingPopup: Thenable<string | undefined> | undefined = undefined;

    /**
     * resourceName the name of the resource that need a Sequencer
     */
    constructor(resourceName: string) {
        super(resourceName);
    }

    /**
     * @return queuing strategy choosen by user
     */
    protected async getQueuing(): Promise<Queueing> {
        return this.runningOperation ? await this.askUserAboutAddingToQueue() : Queueing.Queue;
    }

    /**
     * Show warning message with "Forget" and "Cancel" buttons
     */
    private async askUserAboutAddingToQueue(): Promise<Queueing> {
        // Bring Leaf task terminal to top if exist
        let taskTerm = vscode.window.terminals
            .filter(term => term.name.startsWith(`Task - ${LEAF_TASK_PREFIX}`))
            .shift();
        if (taskTerm) {
            taskTerm.show(false); // false: terminal will take focus
        }

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
}