import { Uri, window, workspace, Terminal, commands } from "vscode";
import { execFileSync, execSync, exec, ChildProcess, spawn } from "child_process";
import { resolve, join, dirname, basename } from "path";
import { watch, FSWatcher, realpathSync, unwatchFile, watchFile, symlinkSync, existsSync } from "fs";
import { PassThrough } from "stream";
import { updateLeafStatusBar } from "./extension";

const LEAF_COMMANDS = {
  init: "init",
  version: "--version",
  search: "search",
  list_profiles: "status",
  select_profile: "select",
  setup_profile: "setup",
  shell: "shell"
};

let _terminal: Terminal;
window.onDidCloseTerminal(t => {
  if (t === _terminal) {
    _terminal = null;
  }
});
export function getTerminal() {
  if (!_terminal) {
    _terminal = window.createTerminal(`🍃 LeAF 🍃`);
  }
  return _terminal;
}

let symlinkWatched: string;

function callLeaf(command: string[]): string {
  const leaf = getLeafBinPath();
  console.log(`Calling leaf with ${command.toString()}`);
  const output = execFileSync(leaf, command, {
    cwd: workspace.workspaceFolders[0].uri.fsPath
  })
    .toString()
    .trim();
  syncStatusBar();
  return output;
}

let leafShellProcess: ChildProcess;

function ensureLeafShellRunning(){
  if(!leafShellProcess || !leafShellProcess.connected){
    leafShellProcess = spawn("leaf", ['shell', '-n', 'bash'],{cwd:workspace.workspaceFolders[0].uri.fragment});
  }
}

function execInLeafShellSync(command: string): string {
  return callLeaf([LEAF_COMMANDS.shell, '-n', 'bash', '-c', command]);
}

// FIXME: Not concurrency-safe: multiple commands being run together is unpredictable.
// Should be some find of command queue.
function execInLeafShell(command: string): Thenable<string> {
  const sentinel = "@_@_@eof@_@_@";
  ensureLeafShellRunning();
  leafShellProcess.stdout.removeAllListeners();
  return new Promise((resolve, reject) =>{
    let buf: string = "";
    leafShellProcess.stdout.on("data", (data:string) => {
        if(data === sentinel){
          resolve(buf);
        }
        else {
          buf += data;
        }
    });

    leafShellProcess.stdout.on("close", () => reject());

    leafShellProcess.stdout.on("error", (data:string) => {
      reject(data);
    });

    leafShellProcess.stdin.write(`${command}\necho ${sentinel}\n`);

  });
}

// gets leaf path either from param, or config (with default value "leaf")
export function getLeafBinPath(verify_path?: string): string | null {
  let leaf_path: string =
    verify_path ||
    workspace.getConfiguration("legato", null).get("leaf-path", null);
  if (!leaf_path) {
    try {
      leaf_path = execSync("which leaf")
        .toString()
        .trim();
    } catch {
      return null;
    }
  }

  return leaf_path;
}

export function selectProfile(profile: string) {
  callLeaf([LEAF_COMMANDS.select_profile, profile]);
}

export function listProfiles() {
  return callLeaf([LEAF_COMMANDS.list_profiles])
    .split("\n")
    .filter(x => x.trim().startsWith("-"))
    .map(x => x.replace(/^\s*-\s*/, "").trim());
}

export function searchLeafPkgs() {
  return callLeaf([LEAF_COMMANDS.search, "-q"]).split("\n");
}

export function setupProfile(package_: string, name?: string) {
  let cmd = [LEAF_COMMANDS.setup_profile, "-p", package_];
  if (name) {
    cmd.push(name);
  }
  callLeaf(cmd);
}

// true if leaf was (eventually) installed
export function ensureLeafInstalled(): boolean {
  try {
    getLeafVersion();
    return true;
  } catch (err) {
    if (err.code === "ENOENT") {
      window
        .showErrorMessage("Leaf not found!!", "Install it", "Never mind...")
        .then(x => {
          if (x.toLowerCase().startsWith("install")) {
            installLeaf();
            window
              .showInformationMessage(
                "Installing Leaf in terminal... you'll need to authorize sudo dpkg -i.",
                "Reload window (once done)"
              )
              .then(x => {
                if (x) {
                  commands.executeCommand("workbench.action.reloadWindow");
                }
              });
          }
        });
    }
  }
  return false;
}

function syncStatusBar(){
  let text = "<no current profile>";
  if(existsSync(symlinkWatched)){
    text = basename(realpathSync(symlinkWatched));
  }
  updateLeafStatusBar(text);
}

function setupSymlinkWatcher(path: string){

    if(symlinkWatched) {
      unwatchFile(symlinkWatched);
    }
    symlinkWatched = path;
    watchFile(path, (cur, prev) => syncStatusBar());
    syncStatusBar();

}
export function getLeafWorkspace(popupPrompt?: boolean): Thenable<Uri> {
  return workspace
    .findFiles("**/leaf-workspace.json", null, 2)
    .then(uris => {
      let uri = uris[0];
      if (uris.length > 1) {
        window.showErrorMessage(
          `More than one leaf-workspace.json across workspaces... Well, we'll go with ${
            uri.fsPath
          }. Switching might be supported later.`
        );
      }
      return uri;
    })
    .then(uri => {
      if (uri) {
        setupSymlinkWatcher(join(dirname(uri.fsPath), "leaf-data", "current"));
        return uri;
      } else {
        return window
          .showErrorMessage(
            `"leaf-workspace.json" not found. Would you like to init leaf?`,
            { modal: popupPrompt },
            "Yes"
          )
          .then(response => {
            if (response === "Yes") {
              callLeaf([LEAF_COMMANDS.init]);
              return getLeafWorkspace();
            } else {
              return null;
            }
          });
      }
    });
}

export function installLeaf() {
  const deb_url =
    "http://get.legato/tools/leaf/releases/latest/leaf_latest.deb";
  getTerminal().sendText(`TEMP_DEB="$(mktemp --suffix=.deb)" &&
  wget -O "$TEMP_DEB" '${deb_url}' &&
  sudo dpkg -i "$TEMP_DEB" &&
  sudo apt install -f &&
  rm -f "$TEMP_DEB"`);
  getTerminal().show();
}
export function getLeafVersion(leaf_path?: string): string {
  return execFileSync(leaf_path || getLeafBinPath(), [
    LEAF_COMMANDS.version
  ]).toString();
}
