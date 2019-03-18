'use strict';

import * as vscode from 'vscode';
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
