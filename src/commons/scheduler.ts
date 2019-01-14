'use strict';

import * as vscode from "vscode";
import { ACTION_LABELS } from './uiUtils';
import { PromiseCallback, PromiseExecutor, newIdGenerator } from './utils';

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
    private runningOperation: Operation<any> | undefined = undefined;
    private currentOperationsQueue: Operation<any>[] = [];
    private readonly idGenerator: IterableIterator<number> = newIdGenerator(); // task id generator

    /**
     * resourceName the name of the resource that need a Sequencer
     */
    public constructor(private readonly resourceName: string) { }

    /**
     * Execute an operation as soon as the queue is empty
     */
    public async schedule<T>(promiseExecutor: PromiseExecutor<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.scheduleOperation({
                id: this.idGenerator.next().value,
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
        if (!this.runningOperation || await this.askUserAboutAddingToQueue()) {
            console.log(`[Scheduler][Sequencer] Add operation to queue: #${operation.id}`);
            this.currentOperationsQueue.push(operation);
            this.runNextOperation();
        } else {
            console.log(`[Scheduler][Sequencer] Operation canceled by user: #${operation.id}`);
            operation.callback.reject(new Error("Operation canceled by user"));
        }
    }

    /**
     * Show warning message with "Forget" and "Cancel" buttons
     */
    private async askUserAboutAddingToQueue(): Promise<boolean> {
        return ACTION_LABELS.ADD_TO_QUEUE === await vscode.window.showWarningMessage(
            `${this.resourceName} is already busy. Do you want to queue this new operation for later execution, or simply forget it?`,
            ACTION_LABELS.FORGET,
            ACTION_LABELS.ADD_TO_QUEUE);
    }

    /**
     * Run next task if any
     */
    private async runNextOperation() {
        if (this.runningOperation) {
            let len = this.currentOperationsQueue.length;
            if (len > 0) {
                console.log(`[Scheduler][Sequencer] ${len} operation(s) postponed due to other operation running: #${this.runningOperation.id}`);
            }
        } else {
            // Update queue
            this.runningOperation = this.currentOperationsQueue.shift();

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
