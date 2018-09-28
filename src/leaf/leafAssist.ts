'use strict';

import { Terminal, window, commands, ExtensionContext, Disposable } from "vscode";
import { LeafManager, LEAF_COMMANDS } from './leafCore';

const LEAF_SHELL_LABEL = `Leaf shell`;
export class LeafUiManager {

  private static instance: LeafUiManager;

  private leafManager: LeafManager = LeafManager.getInstance();
  private leafTerminal: Terminal | undefined;
  private openLeafShellCommand: Disposable;

  private constructor() {
    this.openLeafShellCommand = commands.registerCommand('leaf.openShell', () => {
      this.leafManager.getLeafWorkspaceDirectory().then(leafWorkspaceDirectory => {
        if (leafWorkspaceDirectory) {
          this.getLeafTerminal().show(true);
        } else {
          window.showErrorMessage('No leaf workspace found!');
        }
      }).catch((reason: any) => {
        window.showErrorMessage(`Failed to create Leaf shell - reason: ${reason}`);
      });
    }, this);
  }

  static getInstance(): LeafUiManager {
    LeafUiManager.instance = LeafUiManager.instance || new LeafUiManager();
    return LeafUiManager.instance;
  }

  public init(context: ExtensionContext) {
    context.subscriptions.push(this.openLeafShellCommand);

    if (this.leafManager.isLeafInstalled()) {
      console.log(`Found: ${this.leafManager.getLeafVersion()}`);
      commands.executeCommand('leaf.openShell');
    } else {
      window.showErrorMessage(`Leaf not found! Please install leaf and ensure a profile is set`);
    }
  }

  public getLeafTerminal(): Terminal {
    if (!this.leafTerminal) {
      console.log(`Create Leaf shell`);
      this.leafTerminal = window.createTerminal(LEAF_SHELL_LABEL, this.leafManager.getLeafBinPath(), [LEAF_COMMANDS.shell]);
      window.onDidCloseTerminal((closedTerminal: Terminal) => {
        if (closedTerminal.name === LEAF_SHELL_LABEL) {
          closedTerminal.dispose();
          this.leafTerminal = undefined;
        }
      }, this);
    }
    return this.leafTerminal;
  }

  dispose(): void {
    if (this.leafTerminal) {
      this.leafTerminal.dispose();
    }
    this.openLeafShellCommand.dispose();
  }

}