'use strict';

import { exec } from 'child_process';
import * as vscode from 'vscode';
import { EventEmitter } from "events";
import { Commands } from './identifiers';

/**
 * This object can store resolve and reject callbacks of a promise
 */
export interface PromiseCallbacks {
    [key: string]: {
        resolve: (value?: void | PromiseLike<void>) => void,
        reject: (reason?: any) => void
    };
}

/**
 * This index signature for EnvVars qualify keys and values as string
 * undefined is not permitted in values
 */
export interface EnvVars {
    [key: string]: string;
}

/**
 * Execute in a default shell and return a promise
 */
export async function executeInShell(command: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        exec(`${command}`, { encoding: 'utf8' }, (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => {
            if (stderr) {
                reject(new Error(stderr.toString().trim()));
            } else if (error) {
                reject(error);
            } else {
                let stdoutStr = stdout.toString().trim();
                let out = stdoutStr.length === 0 ? undefined : stdoutStr;
                resolve(out);
            }
        });
    });
}

/**
 * Use this as a decorator for a function/method : @debounce(200) for 200ms
 */
export function debounce(delayMs: number) {
    let deb = new Debouncer(delayMs);
    console.log(`[Debouncer] Create debouncer with delay: ${delayMs}ms`);
    return function (target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
        let originalMethod = descriptor.value;
        descriptor.value = function (...args: any[]) {
            deb.debounce(() => originalMethod.apply(this, args));
        };
        return descriptor;
    };
}

/**
 * Debounce notifications
 */
export class Debouncer {
    private delay: number;
    private fsWait: NodeJS.Timeout | undefined = undefined;

    /**
     * delay: number of millisecond between 2 debounce call to debounce
     */
    constructor(delay: number) {
        this.delay = delay;
    }

    /**
     * If called after less than delay, will cancel previous call and launch callback after the delay.
     */
    public debounce(callback: (...args: any[]) => void) {
        if (this.fsWait) {
            console.log(`[Debouncer] Ignore previous event due to another one less than ${this.delay}ms after`);
            clearTimeout(this.fsWait);
        }
        this.fsWait = setTimeout(() => {
            callback();
            this.fsWait = undefined;
        }, this.delay);
    }
}

/**
 * Facilitate dispose management
 */
export class DisposableBag extends Array<vscode.Disposable> implements vscode.Disposable {
	/**
	 * Implements disposable
	 */
    public dispose(): void {
        this.forEach((value, _index, _array) => value.dispose());
    }

	/**
	 * Execute callback in the dispose method
	 */
    public onDispose(callback: () => void) {
        this.push({ dispose: callback });
    }

	/**
	 * Dispose the given disposable in the dispose method
	 */
    public toDispose<T extends vscode.Disposable>(disposable: T): T {
        this.push(disposable);
        return disposable;
    }
}

/**
 * Abstract baseclass for manager using DisposableBag
 */
export abstract class AbstractManager<T extends string> extends EventEmitter implements vscode.Disposable {

    // Dispose management 
    protected readonly disposables = new CommandRegister();
    protected onEventDisposables: { [key: string]: vscode.Disposable[] } = {};

    /**
     * Override super method to add disposable bag
     */
    public addListener(event: T, listener: (...args: any[]) => void, caller?: any, disposables?: DisposableBag): this {
        super.addListener(event, (...args: any[]) => {
            listener.apply(caller, args);
        });
        if (disposables) {
            disposables.onDispose(() => this.removeListener(event, listener));
        } else if (caller instanceof DisposableBag) {
            caller.onDispose(() => this.removeListener(event, listener));
        }
        return this;
    }

    /**
     * Call super implementation and log event in console.
     */
    public emit(event: T, ...args: any[]): boolean {
        let out = super.emit(event, ...args);
        console.log(`[AbstractManager] Event emited: '${event.toString()}' Args: [${args.map(o => o === undefined ? 'undefined' : o.toString()).join(', ')}] Out: ${out}`);
        return out;
    }

    /**
     * Instanciate and dispose elements on events
     * Immediatly instanciate if already in a corresponding workspace kind
     */
    protected async createAndDisposeOn(
        event: T,
        newValueProvider: () => Promise<boolean>,
        ...newComponents: { new(): vscode.Disposable }[]) {

        let listener = (_oldValue: boolean, newValue: boolean) => {
            if (newValue) {
                let dispArray = event in this.onEventDisposables ? this.onEventDisposables[event] : [];
                console.log(`[AbstractManager] Instanciate ${newComponents.length} elements on event '${event}'`);
                for (let newComponent of newComponents) {
                    dispArray.push(new newComponent);
                }
                this.onEventDisposables[event] = dispArray;
            } else if (event in this.onEventDisposables) {
                console.log(`[AbstractManager] Dispose ${this.onEventDisposables[event].length} elements on event '${event}'`);
                this.onEventDisposables[event].forEach(comp => comp.dispose());
                delete this.onEventDisposables[event];
            }
        };
        this.addListener(event, listener, this.disposables);

        // Trig first model refreshing if necessary
        let newValue = await newValueProvider();
        if (newValue !== (event in this.onEventDisposables)) {
            listener(!newValue, newValue);
        }
    }

    /**
     * Register a command then add it to disposables
     * @param id A unique identifier for the command.
     * @param cb A command handler function.
     * @param thisArg The `this` context used when invoking the handler function.
     */
    protected createCommand(id: Commands, cb: (...args: any[]) => any, thisArg: any = this) {
        this.disposables.createCommand(id, cb, thisArg);
    }

    public dispose(): any {
        this.removeAllListeners();
        this.disposables.dispose();
    }
}

/**
 * Let register a command and handle disposing
 */
export class CommandRegister extends DisposableBag {
    /**
     * Register a command then add it to disposables
     * @param id A unique identifier for the command.
     * @param cb A command handler function.
     * @param thisArg The `this` context used when invoking the handler function.
     */
    public createCommand(id: string, cb: (...args: any[]) => any, thisArg: any = this) {
        this.toDispose(vscode.commands.registerCommand(id, cb, thisArg));
    }
}

/**
 * Remove duplicate in an array
 */
export function removeDuplicates<T>(arr: Array<T>): Array<T> {
    return arr.filter((value: T, index: number, array: T[]) => index === array.indexOf(value));
}
