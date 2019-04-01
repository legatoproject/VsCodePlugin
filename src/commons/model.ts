'use strict';

import { EventEmitter } from "events";
import { isAbsolute } from "path";
import * as vscode from 'vscode';
import { getWorkspaceFolderPath } from "./files";
import { DisposableBag } from './manager';
import { DelayedPromise } from './promise';
import { deepEquals, EnvVars, toStringPartial } from "./utils";

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
        public readonly name: string,
        disposables: DisposableBag,
        private readonly callOnSubscribe = true
    ) {
        super();

        // Listenable is the base of model mangement of this app so a bunch of listener is added to each emitter
        // setMaxListeners is used to set the number of listener above which a warning is logged
        // This feature exist to detect memory leak (typically listener which are not removed on dispose)
        // Default value is 10, which is not enough in our case, 20 is working for now
        this.emitter.setMaxListeners(20);

        // We use symbols to ensure than each ModelElement have it's own event
        this.event = Symbol(name);

        // Register for dispose
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
    public constructor(name: string, disposables: DisposableBag) {
        super(name, disposables);
        this.logInitialValue();
    }

    /**
     * Wait for initial value to be resolved then log value
     */
    private async logInitialValue() {
        let value = await this.initialValue;
        console.log(`[ModelElement] Initialisation of ${this.name} to '${toStringPartial(value)}'`);
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
        // Resolve initial promise if this is the first set, so waiting users get theirs initial value
        if (this.currentValuePromise === this.initialValue) {
            this.initialValue.resolve(newValuePromise);
        }

        // Update current value promise
        let oldValuePromise = this.currentValuePromise;
        this.currentValuePromise = newValuePromise instanceof Promise ? newValuePromise : Promise.resolve(newValuePromise);

        try {
            // Resolve new value
            let newValue = await newValuePromise;
            // Resolve old value
            let oldValue = await oldValuePromise;

            // if value changed, emit event
            if (!deepEquals(newValue, oldValue) && this.emit(newValue, oldValue)) {
                // then log it
                console.log(`[ModelElement] Value of ${this.name} changed from '${toStringPartial(oldValue)}' to '${toStringPartial(newValue)}'`);
                return true;
            }
        } catch (reason) {
            console.error(`[ModelElement] Value of ${this.name} failed to be resolved: '${reason}'`);
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
     * @returns current value as a promise
     * @throws an error if the value is undefined
     */
    public async getMandatory(): Promise<VALUE_TYPE extends undefined ? never : VALUE_TYPE> {
        let out: any = await this.currentValuePromise;
        if (out !== undefined) {
            return out;
        }
        throw new Error(`${this.name} not available`);
    }

    /**
     * Add another ModelElement as a dependency to this one
     * @param name the name of this model element (used for event and logs)
     * @param disposables the array when to add listeners' disposes (not used if thisArg is a already DisposableBag)
     * @param converter a function that convert value from this VALUE_TYPE to DEPENDENCY_TYPE
     * @param thisArg The `this`-argument which will be used when calling the converter (used as disposable if is a DisposableBag)
     * @returns this (let user chain calls)
     */
    public subModel<DEPENDENCY_TYPE>(
        name: string,
        disposables: DisposableBag,
        converter: (newValue: VALUE_TYPE) => DEPENDENCY_TYPE | Promise<DEPENDENCY_TYPE>,
        thisArg?: any
    ): ModelElement<DEPENDENCY_TYPE> {
        let dependency = new ModelElement<DEPENDENCY_TYPE>(name, disposables);
        let newListener: ModelListener<VALUE_TYPE> = (newValue: VALUE_TYPE) =>
            dependency.set(converter.apply(thisArg, [newValue]));
        this.addListener(newListener, undefined, disposables);
        return dependency;
    }
}

/**
 * Call callbacks when entering/exiting event
 * Immediately call enable/disable from current value
 * @param state the boolean model element to listen
 * @param activator.onWillEnable callback called when the event return true to wait for component creation
 * @param activator.onDidDisable callback called when the event return false after disposing components
 * @param thisArg The `this`-argument which will be used when calling the activator (used as disposable if is a DisposableBag)
 * @param disposables the array when to add listeners' disposes (not used if thisArg is a already DisposableBag)
 * @returns this (let user chain calls)
 */
export function onEvent(
    state: ModelElement<boolean>,
    activator: {
        onWillEnable: () => vscode.Disposable[],
        onDidDisable?: (components: vscode.Disposable[]) => any
    },
    thisArg?: any,
    disposables?: DisposableBag
): void {

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
    state.addListener(listener, undefined, disposables);

    // Return disposable which, upon dispose, will dispose all provided disposables and event listener
    let removeThisListenerFn = () => {
        disposeCurrentComponents(); // Dispose current component if any
        notifyDidDisable(); // Notify disabling
    };
    state.onDispose(removeThisListenerFn);
    if (disposables) {
        disposables.onDispose(removeThisListenerFn);
    } else if (thisArg instanceof DisposableBag) {
        thisArg.onDispose(removeThisListenerFn);
    }
}

/**
 * Create new string or undefined model element from a specific env var
 * @param envVars the envvars model element
 * @param name the key of the env var to listen
 * @param disposables the array when to add listeners' disposes (not used if thisArg is a already DisposableBag)
 */
export function fromEnvVarString(
    envVars: ModelElement<EnvVars>,
    name: string,
    disposables: DisposableBag
): ModelElement<string | undefined> {
    return fromEnvVar<string>(envVars, name, disposables, value => value);
}

/**
 * Create new model element of any type from a specific env var
 * @param envVars the envvars model element
 * @param name the key of the env var to listen
 * @param disposables the array when to add listeners' disposes (not used if thisArg is a already DisposableBag)
 * @param converter a function that convert value from string to VALUE_TYPE
 * @param thisArg The `this`-argument which will be used when calling the converter
 */
export function fromEnvVar<VALUE_TYPE>(
    envVars: ModelElement<EnvVars>,
    name: string,
    disposables: DisposableBag,
    converter: (value: string) => VALUE_TYPE,
    thisArg?: any,
): ModelElement<VALUE_TYPE | undefined> {
    return envVars.subModel<VALUE_TYPE | undefined>(name, disposables, env => {
        let out = env[name];
        if (out) {
            return converter.apply(thisArg, [out]);
        }
        return undefined;
    });
}

/**
 * @returns a string containing ${envVarName} for further evaluation
 */
export function getEvalExpression(elt: ModelElement<any>): string {
    return `\${${elt.name}}`;
}

/**
 * Resolve relative path to an absolute one base on workspace directory
 * @param value an absolute path
 */
export function resolvePath(value: string): string {
    return isAbsolute(value) ? value : getWorkspaceFolderPath(value);
}