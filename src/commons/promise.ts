'use strict';

import { newIdGenerator } from './utils';

/**
 * This object can store resolve and reject callbacks of a promise
 */
class PromiseCallback<T> {
    constructor(
        public readonly resolve: (value?: T | PromiseLike<T>) => void,
        public readonly reject: (reason?: any) => void
    ) { }
}

/**
 * This type is used for the unique parameter in Promise constructor
 */
type PromiseExecutor<T> = (resolve: (value?: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void;

/**
 * A promise that execute nothing but can be resolved or rejected anytime
 */
export class DelayedPromise<T> implements Promise<T> {
    private static readonly idGenerator: IterableIterator<number> = newIdGenerator(); // task id generator
    public readonly id: number = DelayedPromise.idGenerator.next().value; // Add id for debug purpose
    private callback: PromiseCallback<T> | undefined = undefined; // The callback of the actual promise
    private readonly actualPromise: Promise<T>; // The promise that is instanciated in constructor
    readonly [Symbol.toStringTag]: "Promise"; // Needed to extend Promise

    constructor() {
        // Juste store callbacks for later call
        this.actualPromise = new Promise<T>((resolve, reject) => this.callback = new PromiseCallback(resolve, reject));
    }

    /**
     * Deleguate to actual promise
     */
    public then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): Promise<TResult1 | TResult2> {
        return this.actualPromise.then(onfulfilled, onrejected);
    }

    /**
     * Deleguate to actual promise
     */
    public catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): Promise<T | TResult> {
        return this.actualPromise.catch(onrejected);
    }

    /**
     * Deleguate to actual promise
     */
    public finally(onfinally?: (() => void) | undefined | null): Promise<T> {
        return this.actualPromise.finally(onfinally);
    }

    /**
     * @returns a PromiseCallback that cannot be undefined
     */
    private getCallback(): PromiseCallback<T> {
        if (!this.callback) {
            throw new Error('callback not stored yet'); // Never called, just to avoid tslink problems
        }
        return this.callback;
    }

    /**
     * Resolve the promise
     * Can be called only once
     */
    public resolve(value?: T | PromiseLike<T>): void {
        this.getCallback().resolve(value);
    }

    /**
     * Reject the promise
     * Can be called only once
     */
    public reject(reason?: any): void {
        this.getCallback().reject(reason);
    }
}

/**
 * A promise that is not executed until [execute](#execute) is called
 */
export class WaitingPromise<T> extends DelayedPromise<T> {

    /**
     * Same constructor than a regular Promise
     */
    constructor(private readonly executor: PromiseExecutor<T>) {
        super();
    }

    /**
     * Execute the content of the executor then return itself as a regular Promise
     */
    public execute(): Promise<T> {
        this.executor(this.resolve.bind(this), this.reject.bind(this));
        return this;
    }
}