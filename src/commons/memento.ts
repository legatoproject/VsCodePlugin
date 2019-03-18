'use strict';
import * as vscode from 'vscode';

/**
 * Configuration scope
 * Can be Global or Workspace
 */
const enum Scope {
    Global, Workspace
}

/**
 * Represent a memento of the extension. Can be get or updated
 */
class ExtensionMemento<T> {

    /**
     * @param scope the scope of this memento
     * @param key the key of this memento
     * @param defaultValue the default value of this memento
     */
    public constructor(
        public readonly scope: Scope,
        public readonly key: string,
        public readonly defaultValue: T) { }

    /**
     * Get actual memento from the context and the scope given in constructor
     * @param context the context of this extension
     * @returns the actual Memento
     */
    private getMemento(context: vscode.ExtensionContext): vscode.Memento {
        switch (this.scope) {
            case Scope.Global:
                return context.globalState;
            case Scope.Workspace:
                return context.workspaceState;
        }
    }

    /**
     * Get the current value of this memento
     * @param context the context of this extension
     * @returns the current value of this memento
     */
    public get(context: vscode.ExtensionContext): T {
        let out = this.getMemento(context).get(this.key, this.defaultValue);
        console.log(`[Memento] Get value of '${this.key}': '${out}'`);
        return out;
    }

    /**
     * Get the current value of this memento
     * @param context the context of this extension
     * @param value the new value of this memento
     * @returns a thenable that can be use to track the serialization of the value
     */
    public update(context: vscode.ExtensionContext, value: T): Thenable<void> {
        console.log(`[Memento] Set value of '${this.key}': '${value}'`);
        return this.getMemento(context).update(this.key, value);
    }
}

/**
 * This namespace organize all the existing Memento of this extension
 */
export namespace Mementos {
    export namespace Common {
        export const PreviousVersion = new ExtensionMemento<string | undefined>(
            Scope.Global,
            'leaf.previousversion', undefined);
    }
    export namespace Leaf {
        export namespace Packages {
            export namespace Filters {
                export const User = new ExtensionMemento<{ [key: string]: boolean }>(
                    Scope.Workspace,
                    'leaf.packages.filters.user', {});
                export const Builtin = new ExtensionMemento<{ [key: string]: boolean }>(
                    Scope.Workspace,
                    'leaf.packages.filters.builtin', { "master": true });
            }
        }
    }
}