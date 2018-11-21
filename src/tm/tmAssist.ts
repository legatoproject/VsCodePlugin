'use strict';

import { commands, ExtensionContext, InputBoxOptions, StatusBarAlignment, StatusBarItem, Terminal, window } from "vscode";
import { LeafManager, LEAF_EVENT } from "../leaf/leafCore";
import { LEGATO_ENV } from "../legato/legatoCore";

const TARGET_SHELL_LABEL = `Remote shell`;
const EXTENSION_COMMANDS = {
  showTerminal: "legato.tm.openShell",
  enterNewIP: "legato.tm.newIP"
};

export class TargetUiManager {
  private remoteTerminal: Terminal | undefined;
  private targetStatusbar: StatusBarItem;

  public constructor() {
    this.targetStatusbar = window.createStatusBarItem(StatusBarAlignment.Left, 5);
  }

  public async start(context: ExtensionContext) {
    context.subscriptions.push(commands.registerCommand(EXTENSION_COMMANDS.showTerminal, () => this.showRemoteTerminal(), this));
    // So lets add status bar
    context.subscriptions.push(this.targetStatusbar); // Dispose status bar on deactivate
    this.targetStatusbar.text = "<Unknown>";
    this.targetStatusbar.tooltip = "Legato device IP address";
    this.targetStatusbar.command = EXTENSION_COMMANDS.enterNewIP;
    this.targetStatusbar.show();

    let options: InputBoxOptions = {
      prompt: "Please set the Legato device IP address",
      placeHolder: "Default: 192.168.2.2"
    };
    commands.registerCommand(EXTENSION_COMMANDS.enterNewIP, () => {
      LeafManager.INSTANCE.getEnvValue(LEGATO_ENV.DEST_IP).then((ip: string|undefined) => {
        //set placeholder with current DEST_IP
        options.placeHolder = ip;
        window.showInputBox(options).then((newIP: string | undefined) => {
          if (newIP) {
            this.targetStatusbar.text = newIP;
            LeafManager.INSTANCE.setEnvValue(LEGATO_ENV.DEST_IP, newIP);
          }
        });
      });
    }, this);

    LeafManager.INSTANCE.addListener(LEAF_EVENT.profileChanged, (selectedProfile: string) => this.updateIPStatusBar(selectedProfile));
    //read DEST_IP on start
    this.updateIPStatusBar(LeafManager.INSTANCE.getCurrentProfileName());
  }

  private async showRemoteTerminal() {
    if (!this.remoteTerminal) {
      this.remoteTerminal = window.createTerminal({
        name: TARGET_SHELL_LABEL,
        shellPath: process.env.SHELL,
        shellArgs: ["-c", "ssh root@$DEST_IP"],
        cwd: LeafManager.INSTANCE.getLeafWorkspaceDirectory(),
        env: await LeafManager.INSTANCE.getEnvVars()
      });
      window.onDidCloseTerminal((closedTerminal: Terminal) => {
        if (closedTerminal.name === TARGET_SHELL_LABEL) {
          closedTerminal.dispose();
          this.remoteTerminal = undefined;
        }
      }, this);
    }
    this.remoteTerminal.show();
  }

  private async updateIPStatusBar(this: any, profileName: string) {
    LeafManager.INSTANCE.getEnvValue(LEGATO_ENV.DEST_IP).then((ip: string|undefined) => this.targetStatusbar.text = ip);
  }
}