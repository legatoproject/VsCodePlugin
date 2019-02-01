'use strict';
import * as vscode from 'vscode';

const enum Scope {
    Global, Workspace
}

class ExtensionMemento<T> {
    public constructor(
        public readonly scope: Scope,
        public readonly key: string,
        public readonly defaultValue: T) { }

    private getMemento(context: vscode.ExtensionContext): vscode.Memento {
        switch (this.scope) {
            case Scope.Global:
                return context.globalState;
            case Scope.Workspace:
                return context.workspaceState;
        }
    }

    public get(context: vscode.ExtensionContext): T {
        let out = this.getMemento(context).get(this.key, this.defaultValue);
        console.log(`[Memento] Get value of '${this.key}': '${out}'`);
        return out;
    }

    public update(context: vscode.ExtensionContext, value: T): Thenable<void> {
        console.log(`[Memento] Set value of '${this.key}': '${value}'`);
        return this.getMemento(context).update(this.key, value);
    }
}

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