'use strict';

import { exec } from 'child_process';

/**
 * This index signature for EnvVars qualify keys and values as string
 * undefined is not permitted in values
 */
export interface EnvVars {
    [key: string]: string;
}

/**
 * Interface for result returned by leaf bridge
 */
export interface LeafBridgeElement {
    [key: string]: any;
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
 * Remove duplicate in an array
 */
export function removeDuplicates<T>(arr: Array<T>): Array<T> {
    return arr.filter((value: T, index: number, array: T[]) => index === array.indexOf(value));
}

/**
 * Generate unique task id used to resolve promises
 */
export function* newIdGenerator(): IterableIterator<number> {
    var id = 0;
    while (true) {
        yield id++;
    }
}

/**
 * Clone an object by converting it to json then converting back to object
 * @param object the object to clone
 */
export function deepClone<T>(object: T): T {
    return JSON.parse(JSON.stringify(object));
}

/**
 * Compare json of 2 objects
 * @returns true if both object have the same json equivalent
 */
export function deepEquals(a: any, b: any): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Limit used by toStringPartial
 */
const LIMIT: number = 30;

/**
 * Used to log a part of the json of any object
 * @param x the object to stringify
 * @returns the first chars of the json of the give object
 */
export function toStringPartial(x: any) {
    let out = JSON.stringify(x);
    if (out) {
        if (out.length > LIMIT) {
            out = out.substr(0, LIMIT) + '...';
        }
    } else {
        out = '';
    }
    return out;
}