'use strict';

import { EventEmitter } from "events";
import * as vscode from 'vscode';
import { DisposableBag } from './manager';
import { DelayedPromise } from './promise';
import { deepEquals, toStringPartial } from "./utils";

/**
 * Type of listeners that can be added to Listenable
 */
type Listener = (...args: any[]) => void;

/**
 * Conditional types that return the parameters of a given LISTENER
 * 
 * Conditional types in typescript allow us to introduce type variables into the expression in a rather dynamic way.
 * Notice the 'infer' keyword. That says to TypeScript: "I want to take whatever TypeScript infers to be at this position and assign it to the name ARGS".
 * It just so happens that the thing at that position is the arguments of a given listener, that we have called LISTENER.
 * 
 * This is used to ensure than Listenable#emit take the same arguments than the listeners
 */
type ListenerParameters<LISTENER extends Listener> =
    LISTENER extends (...args: infer ARGS) => void ? ARGS : never;

/**
 * A listenable event
 * @argument LISTENER_TYPE the type of listener that can be added to this Listenable. Default as listener without arguments
 */
export class Listenable<LISTENER_TYPE extends Listener = () => void> extends DisposableBag {
    /**
     * The symbol used to identify event
     */
    private readonly event: symbol;

    /**
     * The event emitter
     */
    private readonly emitter = new EventEmitter();

    /**
     * @param name The name of the event
     * @param disposables the disposable array to register to
     * @param callOnSubscribe if true, when a listener is added, it is called immediately without parameters (default: true)
     */
    public constructor(
        protected readonly name: string,
        disposables: vscode.Disposable[],
        private readonly callOnSubscribe = true
    ) {
        super();
        this.event = Symbol(name); // We use symbols to ensure than each ModelElement have it's own event
        disposables.push(this);
    }

    /**
     * Add listener to this listenable and call listener immediately without parameter
     * @param listener the listener to add
     * @param thisArg The `this`-argument which will be used when calling the listener (used as disposable if is a DisposableBag)
     * @param disposables the array when to add listeners' disposes (not used if thisArg is a already DisposableBag)
     */
    public addListener(
        listener: LISTENER_TYPE,
        thisArg?: any,
        disposables?: DisposableBag
    ): this {
        // Ensure the listener is call from the given thisArg
        let listenerAsFn = listener.bind(thisArg) as LISTENER_TYPE;

        this.emitter.addListener(this.event, listenerAsFn);
        let removeThisListenerFn = this.emitter.removeListener.bind(this.emitter, this.event, listenerAsFn);
        this.onDispose(removeThisListenerFn);
        if (disposables) {
            disposables.onDispose(removeThisListenerFn);
        } else if (thisArg instanceof DisposableBag) {
            thisArg.onDispose(removeThisListenerFn);
        }

        // Initial call
        if (this.callOnSubscribe) {
            this.initialListenerCall(listenerAsFn);
        }
        return this;
    }

    /**
     * Called once when a listener is added
     * Overriden by subclass
     * @param listener the listener to call
     */
    protected async initialListenerCall(listener: LISTENER_TYPE) {
        listener();
    }

    /**
     * Emit event using given args
     * @param args the arg to pass to listeners when calling its
     */
    public emit(...args: ListenerParameters<LISTENER_TYPE>): boolean {
        return this.emitter.emit(this.event, ...args);
    }

    /**
     * Remove all listeners
     */
    public dispose(): any {
        this.emitter.removeAllListeners();
        super.dispose();
    }
}

/**
 * Type of listeners that can be added to ModelElement
 */
export type ModelListener<VALUE_TYPE> = (newValue: VALUE_TYPE, oldValue: VALUE_TYPE) => void;

/**
 * A model value that can be get, set and listened
 */
export class ModelElement<VALUE_TYPE> extends Listenable<ModelListener<VALUE_TYPE>> {
    /**
     * Initial value of the model element: a promise not yet resolved
     */
    private readonly initialValue: DelayedPromise<VALUE_TYPE> = new DelayedPromise<VALUE_TYPE>();

    /**
     * A promise that represent the  current value of this model element
     */
    private currentValuePromise: Promise<VALUE_TYPE> = this.initialValue;

    /**
     * @param name the name of this model element (used for event and logs)
     * @param disposables the disposable array to register to
     */
    public constructor(name: string, disposables: vscode.Disposable[]) {
        super(name, disposables);
    }

    /**
     * Called once when a listener is added
     * @param listener the listener to call
     */
    protected async initialListenerCall(listener: ModelListener<VALUE_TYPE>) {
        let value = await this.currentValuePromise;
        listener(value, value);
    }

    /**
     * Set the new value of this model element
     * @param newValuePromise the new value or a promise of the new value
     * @returns a promise of boolean to wait for event and listeners (true if the value change)
     */
    public async set(newValuePromise: Promise<VALUE_TYPE> | VALUE_TYPE): Promise<boolean> {
        // Resolve new value
        let newValue = await newValuePromise;

        // Resolve initial promise if this is the first set, so waiting users get theirs initial value
        if (this.currentValuePromise === this.initialValue) {
            console.log(`[ModelElement] Initialisation of ${this.name} to '${toStringPartial(newValue)}'`);
            this.initialValue.resolve(newValue);
        }

        // Resolve old value
        let oldValue = await this.currentValuePromise;

        // Update current value promise
        this.currentValuePromise = newValuePromise instanceof Promise ? newValuePromise : Promise.resolve(newValuePromise);

        // if value changed, emit event
        if (!deepEquals(newValue, oldValue) && this.emit(newValue, oldValue)) {
            // then log it 
            console.log(`[ModelElement] Value of ${this.name} changed from '${toStringPartial(oldValue)}' to '${toStringPartial(newValue)}'`);
            return true;
        }
        return false;
    }

    /**
     * @returns current value as a promise
     */
    public get(): Promise<VALUE_TYPE> {
        return this.currentValuePromise;
    }

    /**
     * Add another ModelElement as a dependency to this one
     * @param dependency the ModelElement computed fom this one
     * @param converter a function that convert value from this VALUE_TYPE to DEPENDENCY_TYPE
     * @param thisArg The `this`-argument which will be used when calling the converter (used as disposable if is a DisposableBag)
     * @param disposables the array when to add listeners' disposes (not used if thisArg is a already DisposableBag)
     * @returns this (let user chain calls)
     */
    public addDependency<DEPENDENCY_TYPE>(
        dependency: ModelElement<DEPENDENCY_TYPE>,
        converter: (newValue: VALUE_TYPE) => DEPENDENCY_TYPE | Promise<DEPENDENCY_TYPE>,
        thisArg?: any,
        disposables?: DisposableBag
    ): this {
        let newListener: ModelListener<VALUE_TYPE> = (newValue: VALUE_TYPE) =>
            dependency.set(converter.apply(thisArg, [newValue]));
        return this.addListener(newListener, thisArg, disposables);
    }
}

/**
 * A boolean model element that can be listened for both values
 */
export class StateModelElement extends ModelElement<boolean> {

    /**
     * Call callbacks when entering/exiting event
     * Immediatly call enable/disable from current value
     * @param activator.onWillEnable callback called when the event return true to wait for component creation
     * @param activator.onDidDisable callback called when the event return false after disposing components
     * @param thisArg The `this`-argument which will be used when calling the activator (used as disposable if is a DisposableBag)
     * @param disposables the array when to add listeners' disposes (not used if thisArg is a already DisposableBag)
     * @returns this (let user chain calls)
     */
    public onEvent(
        activator: {
            onWillEnable: () => vscode.Disposable[],
            onDidDisable?: (components: vscode.Disposable[]) => any
        },
        thisArg?: any,
        disposables?: DisposableBag
    ): this {

        // Call onDidDisable callback when necessary
        let currentUndisposedComponents: vscode.Disposable[] = [];
        let disposeCurrentComponents = () => currentUndisposedComponents.forEach(comp => comp.dispose());
        let notifyDidDisable = () => activator.onDidDisable ? activator.onDidDisable.apply(thisArg, [currentUndisposedComponents]) : undefined;

        // Call onWillEnable callback when necessary
        let listener = async (newValue: boolean) => {
            disposeCurrentComponents();
            if (newValue) {
                currentUndisposedComponents = activator.onWillEnable.apply(thisArg);
            } else {
                notifyDidDisable();
                currentUndisposedComponents = [];
            }
        };
        this.addListener(listener, this, disposables);

        // Return disposable which, upon dispose, will dispose all provided disposables and event listener
        let removeThisListenerFn = () => {
            disposeCurrentComponents(); // Dispose current component if any
            notifyDidDisable(); // Notify disabling
        };
        this.onDispose(removeThisListenerFn);
        if (disposables) {
            disposables.onDispose(removeThisListenerFn);
        } else if (thisArg instanceof DisposableBag) {
            thisArg.onDispose(removeThisListenerFn);
        }
        return this;
    }
}
