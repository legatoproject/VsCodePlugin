'use strict';

import { Terminal, window, commands, ExtensionContext, Disposable, StatusBarItem, StatusBarAlignment } from "vscode";
import { LeafManager, LEAF_COMMANDS, LeafProfile } from './leafCore';

const LEAF_SHELL_LABEL = `Leaf shell`;
export class LeafUiManager {

  private static instance: LeafUiManager;

  private leafManager: LeafManager = LeafManager.getInstance();
  private leafTerminal: Terminal | undefined;
  private openLeafShellCommand: Disposable;
  private leafStatusbar: StatusBarItem;

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
    this.leafStatusbar = window.createStatusBarItem(StatusBarAlignment.Left, 11);
    this.leafStatusbar.text = "(current profile goes here)";
    this.leafStatusbar.show();
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
      window.showInformationMessage(`Found: ${this.leafManager.getLeafVersion()}`);
      this.leafManager.addListener('profileChanged', (selectedProfile: string) => this.onProfileChanged(selectedProfile));
      this.leafManager.addListener('leafEnvReady', (leafProfile: LeafProfile) => this.onLeafEnvReady(leafProfile));
      this.leafManager.watchCurrentProfile();
      this.leafManager.prepareLeafEnv();
    } else {
      window.showErrorMessage(`Leaf not found! Please install leaf and ensure a profile is set`);
    }
  }

  private onProfileChanged(selectedProfile: string) {
    if (selectedProfile === undefined) {
      this.leafStatusbar.text = 'No profile';
      window.showErrorMessage(`No current profile is set. Please start by this step.`);
    } else {
      window.showInformationMessage(`Profile ${selectedProfile} selected`);
      this.leafStatusbar.text = `switching to ${selectedProfile}`;
      if (this.leafTerminal) {
        this.leafTerminal.dispose();
      }
      this.leafTerminal = undefined;
      this.leafManager.prepareLeafEnv();
    }
  }

  private onLeafEnvReady(leafProfile: LeafProfile) {
    window.showInformationMessage(`Preparing Leaf shell based on ${leafProfile.name}`);
    if (this.leafStatusbar !== undefined) {
      this.leafStatusbar.text = leafProfile.name;
    }
    this.getLeafTerminal().show();
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
    this.leafManager.stopWatchCurrentProfile();
    if (this.leafTerminal) {
      this.leafTerminal.dispose();
    }
    this.openLeafShellCommand.dispose();
    this.leafStatusbar.dispose();
  }

}