'use strict';

import * as vscode from 'vscode';
import { EventEmitter } from "events";
import { Command } from './identifiers';

/**
 * Facilitate dispose management
 */
export class DisposableBag extends Array<vscode.Disposable> implements vscode.Disposable {
	/**
	 * Implements disposable
	 */
    public dispose(): void {
        this.forEach(value => value.dispose());
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
     * @param thisArg The `this`-argument which will be used when calling the env vars provider.
     */
    public addListener(
        event: T,
        listener: (...args: any[]) => void,
        thisArg?: any,
        disposables?: DisposableBag
    ): this {
        listener = listener.bind(thisArg);
        super.addListener(event, listener);
        let removeThisListenerFn = this.removeListener.bind(this, event, listener);
        if (disposables) {
            disposables.onDispose(removeThisListenerFn);
        } else if (thisArg instanceof DisposableBag) {
            thisArg.onDispose(removeThisListenerFn);
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
     * Call callbacks when entering/exiting event
     * Immediatly call enable/disable from current value
     * @param event the event to listen (value type must be a boolean)
     * @param currentEventValue give the current value of the event
     * @param onWillEnable callback called when the event return true to wait for component creation
     * @param onDidDisable callback called when the event return false after disposing components
     * @param thisArg The `this`-argument which will be used when calling the env vars provider.
     * @returns a disposable which, upon dispose, will dispose all provided disposables.
     */
    protected onEvent(event: T,
        currentEventValue: boolean,
        activator: {
            onWillEnable: () => Promise<vscode.Disposable[]>,
            onDidDisable?: (components: vscode.Disposable[]) => any
        },
        thisArg?: any
    ): vscode.Disposable {

        // Let's store disposables among events
        let currentUndisposedComponents: vscode.Disposable[] = [];

        let disposeCurrentComponents = () => currentUndisposedComponents.forEach(comp => comp.dispose());
        let notifyDidDisable = () => activator.onDidDisable ? activator.onDidDisable(currentUndisposedComponents) : undefined;

        // Listen to event and instanciate or dispose components
        let listener = async (_oldValue: boolean, newValue: boolean) => {
            disposeCurrentComponents();
            if (newValue) {
                currentUndisposedComponents = await activator.onWillEnable.apply(thisArg);
            } else {
                notifyDidDisable();
                currentUndisposedComponents = [];
            }
        };
        this.addListener(event, listener, this.disposables);

        // Trig first model refreshing if necessary
        listener(!currentEventValue, currentEventValue);

        // Return disposable which, upon dispose, will dispose all provided disposables and event listener
        return new vscode.Disposable(() => {
            disposeCurrentComponents(); // Dispose current component if any
            this.removeListener(event, listener); // Disable event listener
            notifyDidDisable(); // Notify disabling
        });
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
    protected createCommand(id: Command, cb: (...args: any[]) => any, thisArg: any = this) {
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
    public createCommand(id: Command, cb: (...args: any[]) => any, thisArg: any = this) {
        this.toDispose(vscode.commands.registerCommand(id, cb, thisArg));
    }
}
