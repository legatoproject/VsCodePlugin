'use strict';

import * as vscode from "vscode";
import { ACTION_LABELS } from './uiUtils';
import { PromiseCallback, PromiseExecutor, newIdGenerator } from './utils';

/**
 * Internal enum used to process waiting queue
 */
const enum Queueing {
    Queue, // Add to execution queue right now
    Wait, // Do nothing, waiting queue will be used later
    Cancel // Cancel and empty waiting queue
}

/**
 * Internal object used to track promise executions
 */
interface Operation<T> {
    id: number;
    executor: PromiseExecutor<T>;
    callback: PromiseCallback<T>;
}

/**
 * Can schedule a executor and return the corresponding promise
 */
export interface Scheduler {
    schedule<T>(promiseExecutor: PromiseExecutor<T>): Promise<T>;
}

/**
 * Execute right now
 */
export class Immediate implements Scheduler {
    public async schedule<T>(promiseExecutor: PromiseExecutor<T>): Promise<T> {
        console.log('[Scheduler][Immediate] Execute operation');
        return new Promise<T>(promiseExecutor);
    }
}

/**
 * Ensure than all scheduled promiseExecutors are executed one after the other
 */
export class Sequencer implements Scheduler {
    private waitingQueue: Operation<any>[] = [];
    private runningOperation: Operation<any> | undefined = undefined;
    private readonly executionQueue: Operation<any>[] = [];
    private readonly idGenerator: IterableIterator<number> = newIdGenerator(); // task id generator
    private currentQueueingPopup: Thenable<string | undefined> | undefined = undefined;

    /**
     * resourceName the name of the resource that need a Sequencer
     */
    public constructor(private readonly resourceName: string) { }

    /**
     * Execute an operation as soon as the queue is empty
     */
    public async schedule<T>(promiseExecutor: PromiseExecutor<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            let newId = this.idGenerator.next().value;
            console.log(`[Scheduler][Sequencer] Add operation to waiting queue: ${newId}`);
            this.scheduleOperation({
                id: newId,
                executor: promiseExecutor,
                callback: new PromiseCallback(resolve, reject)
            });
        });
    }

    /**
     * If there is no operation running, run it
     * If the is already an operation, ask user permission to add operation in a queue.
     */
    private async scheduleOperation(operation: Operation<any>) {
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
                this.waitingQueue.forEach(op => op.callback.reject(new Error("Operation canceled by user")));
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
                try {
                    // Wait until the end of this operation
                    let result = await new Promise<any>(this.runningOperation.executor);
                    this.runningOperation.callback.resolve(result);
                } catch (e) {
                    this.runningOperation.callback.reject(e);
                }
                this.runningOperation = undefined;
                this.runNextOperation(); // Try running next one if exist
            }
        }
    }
}
