'use strict';

import { commands, ExtensionContext, Terminal, window } from "vscode";
import { LeafManager } from "../leaf/leafCore";
import { LeafUiManager } from "../leaf/leafAssist";

const TARGET_SHELL_LABEL = `Remote shell`;
const EXTENSION_COMMANDS = {
    showTerminal: "tm.openShell"
  };

export class TargetUiManager {
  private remoteTerminal: Terminal | undefined;

  public async start(context: ExtensionContext) {
    LeafManager.INSTANCE.getCurrentProfileName();

    context.subscriptions.push(commands.registerCommand(EXTENSION_COMMANDS.showTerminal, () => this.showRemoteTerminal(), this));
  }

  private async showRemoteTerminal() {
    if (!this.remoteTerminal) {
      console.log(`Create remote shell to device`);
      this.remoteTerminal = await LeafUiManager.newLeafShellTerminal(TARGET_SHELL_LABEL, [ "-c", "ssh", "root@$DEST_IP"]);
      window.onDidCloseTerminal((closedTerminal: Terminal) => {
        if (closedTerminal.name === TARGET_SHELL_LABEL) {
          closedTerminal.dispose();
          this.remoteTerminal = undefined;
        }
      }, this);
    }
    this.remoteTerminal.show();
  }
}