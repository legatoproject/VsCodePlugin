import * as path from "path";
import {
  workspace,
  window,
  ExtensionContext,
  TextDocument,
  OutputChannel,
  WorkspaceFolder,
  Uri,
  commands,
  Range,
  Position,
  Terminal,
  StatusBarAlignment,
  StatusBarItem
} from "vscode";
import * as fs from "fs";
import {
  LanguageClient,
  LanguageClientOptions,
  TransportKind,
  State,
  ServerOptions
} from "vscode-languageclient";

import { SystemViewProvider } from "./systemView";
import {
  getLeafVersion,
  getLeafBinPath,
  ensureLeafInstalled,
  searchLeafPkgs,
  listProfiles,
  selectProfile,
  setupProfile,
  getLeafWorkspace
} from "./leaf";
import { updateLaunchJson, updateTasks } from "./configGen";

const Config = workspace.getConfiguration("legato", null);

function getRelevantFolder(): Uri {
  if (activeSdef) {
    return workspace.getWorkspaceFolder(Uri.parse("file://" + activeSdef)).uri;
  }
  if (window.activeTextEditor.document) {
    return window.activeTextEditor.document.uri;
  }
  return workspace.workspaceFolders[0].uri;
}

function checkSettings() {
  const actions = ["Reload window & check again!", "Never mind..."];
  let legatoRoot = Config.get("root");
  if (!legatoRoot) {
    window
      .showErrorMessage(
        `'legato.root' not set in config :'( 
			In the future we'll detect this with leaf, but please set it, or else a lot of stuff won't work!`,
        ...actions
      )
      .then(cmd => {
        if (cmd === actions[0]) {
          commands.executeCommand("workbench.action.reloadWindow");
        }
      });
  }
}

checkSettings();

let _terminal: Terminal;
window.onDidCloseTerminal(t => {
  if (t === _terminal) {
    _terminal = null;
  }
});

export function getTerminal() {
  if (!_terminal) {
    _terminal = window.createTerminal(`Legato Host`);
    _terminal.sendText(`cd ${Config.get("root")}\n bin/legs \n cd - \n`);
  }
  return _terminal;
}

commands.registerCommand("legato.leaf.profile.create", () =>
  getLeafWorkspace(true).then(dir => {
    const available = searchLeafPkgs();
    let pkg: string;
    window
      .showQuickPick(available, { canPickMany: false, placeHolder: "Choose a package for the new profile:" })
      .then(p => {
        pkg = p;
        if (pkg) {
          return window.showInputBox({ prompt: "Profile name (optional)" });
        }
        return null;
      })
      .then(name => {
        if (pkg) {
          updateLeafStatusBar("<Creating...>");
          setupProfile(pkg, name);
        }
      });
  })
);



commands.registerCommand("legato.leaf.profile.choose", () =>
  getLeafWorkspace(true).then(dir => {
    getLeafWorkspace();
    let profiles = listProfiles();
    const create_new = "<Create New>";
    profiles.push(create_new);
    window.showQuickPick(profiles, { canPickMany: false, placeHolder: "Profile to switch to" }).then(profile => {
      if (profile === create_new) {
        commands.executeCommand("legato.leaf.profile.create");
      } else if (profile) {
        updateLeafStatusBar("<Switching...>");
        selectProfile(profile);
      }
    });
  })
);

export function updateLeafStatusBar(currentProfile?: string) {
  leaf_statusbar.text = `Leaf profile: ${currentProfile || "<none>"}`;
}

commands.registerCommand("legato.instapp", () => {
  getTerminal().show(true);
  getTerminal().sendText(
    `mkapp -t wp85 ${getAppDir()}/*.adef && instapp *.update`
  );
});

const rootPath = workspace.rootPath;

function getAppDir() {
  let uri = window.activeTextEditor.document.uri;
  if (uri.scheme === "untitled") {
    return ".";
  }
  let folder = workspace.getWorkspaceFolder(uri);
  return folder.uri.fsPath;
}

function getClient() {
  return client;
}

commands.registerCommand("legato.genStubs", () => {
  let client = getClient();
  if (!client) {
    window.showErrorMessage(
      "No language server running. Open up a cdef or something!"
    );
    return;
  }
  client
    .sendRequest("listApis")
    .then((val: any) => window.showQuickPick(val.data))
    .then(api => {
      return client.sendRequest("genStubs", api);
    })
    .then((val: any) => {
      let lastLine = window.activeTextEditor.document.lineAt(
        window.activeTextEditor.document.lineCount - 1
      );
      const end: Position = lastLine.range.end;
      console.log(end);
      window.activeTextEditor.edit(edit => {
        edit.insert(end, (end.character === 0 ? "" : "\n") + val.data);
      });
    });
});

commands.registerCommand("legato.pickSdef", () => chooseActiveSdef(true));

commands.registerCommand("legato.createApp", newAppWizard);

function newSdefWizard() {
  const currentFolder = workspace.getWorkspaceFolder(
    window.activeTextEditor.document.uri
  );
  if (!currentFolder) {
    window.showErrorMessage("No active workspace!");
    return;
  }
}

function extractSectionFromSdef(sdefContent: string, section: string) {
  let correctSection = new RegExp(`\\b${section}\\s*:\\s*{[^}]*}`, "gm").exec(
    sdefContent
  );
  return correctSection[0];
}

// TODO: TEMPORARY METHODS; should be handled with actual parsers
// doesn't handle nested methods!!!
function addToSdefSection(sdef: Uri, section: string, content: string) {
  let sdefContent = fs.readFileSync(sdef.fsPath).toString();
  let originalSection = extractSectionFromSdef(sdefContent, section);

  let updatedSection = originalSection.replace("}", `    ${content}\n}`);
  let updatedSdefContent = sdefContent.replace(originalSection, updatedSection);

  fs.writeFileSync(sdef.fsPath, updatedSdefContent);
}

function removeFromSdefSection(sdef: Uri, section: string, content: string) { }

function newAppWizard() {
  // const currentFolder: string = workspace.workspaceFolders[0].uri.fsPath;
  let appname: string;
  let compname: string;
  const currentFolder = workspace.getWorkspaceFolder(
    Uri.parse("file://" + svp.getChildren()[0].file)
  );
  if (!currentFolder) {
    window.showErrorMessage("No active workspace!");
    return;
  }

  window
    .showInputBox({
      ignoreFocusOut: true,
      placeHolder: "myApp",
      prompt: "Name of the app",
      validateInput: val => {
        if (val === "") {
          return "App name can't be empty!";
        }
        return undefined;
      }
    })
    .then((_appname: string) => {
      appname = _appname;
      return window.showInputBox({
        ignoreFocusOut: true,
        value: `${appname}Comp`,
        prompt: "Name of the component",
        validateInput: val => {
          if (val === "") {
            return "Component name can't be empty!";
          }
          return undefined;
        }
      });
    })
    .then((_compname: string) => {
      compname = _compname;
      window.showInformationMessage(
        `Creating app ${appname} with component ${compname}`
      );
      return createApp(appname.trim(), currentFolder, compname.trim());
    });
}

function createApp(
  appName: string,
  folder: WorkspaceFolder,
  componentName?: string
) {
  componentName = componentName || `${appName}Comp`;
  const exeName = `${appName}Exe`;
  const adefContent = `executables:
{
	${exeName} = ( ${componentName} )
}

processes:
{
	run:
	{
		( ${exeName} )
	}
}`;
  const adefPath = `${folder.uri.fsPath}/${appName}.adef`;
  if (fs.existsSync(adefPath)) {
    window.showErrorMessage(`${adefPath} already exists! Aborting.`);
    return;
  }
  fs.writeFileSync(adefPath, adefContent);
  let sdefPath = svp.getChildren()[0].file;
  if (!sdefPath) {
    window.showErrorMessage("Couldn't get active sdef to write new app to.");
  } else {
    addToSdefSection(Uri.parse("file://" + sdefPath), "apps", appName);
  }
  createComponent(componentName);
}
function createComponent(componentName: string) {
  const currentFolder: string = workspace.workspaceFolders[0].uri.fsPath;
  const componentDir = `${currentFolder}/${componentName}`;
  const cdefPath = `${componentDir}/Component.cdef`;
  const sourcePath = `${componentDir}/${componentName}.c`;

  if (fs.existsSync(componentDir)) {
    window.showErrorMessage(`${componentDir} already exists! Aborting.`);
    return;
  }
  fs.mkdirSync(componentDir);

  const cdefContent = `sources:
{
	${componentName}.c
}`;
  fs.writeFileSync(cdefPath, cdefContent);

  const sourceContent = `#include "legato.h"
#include "interfaces.h"

COMPONENT_INIT
{
    LE_DEBUG("Component ${componentName} started.");
    
}`;

  fs.writeFileSync(sourcePath, sourceContent);

  window.showTextDocument(Uri.file(sourcePath), {
    selection: new Range(6, 4, 6, 4) // set cursor to line 6, char 4 - the empty line in the body
  });
}
// Lists sdefs in project, and if there's only one, set it as the active one.
function listSdefs(): Thenable<Uri[]> {
  return workspace.findFiles("**/*.sdef");
}

commands.registerCommand("legato.genLaunchConfig", generateLaunchConfig);


// return apps from the current sdef (not #included ones)
function getOwnApps(sdefData: any): Array<any> {
  const apps = sdefData['apps'];
  return apps.filter((x: any) => !x['sdef'] || x.sdef === activeSdef);
}
// current app being debugged.
// temporary, as in the future starting a debug session should allow you to attach to any app
let debuggableAppName: string;

function generateLaunchConfig(sdefData: any) {
  const currentFolder = getRelevantFolder();


  updateLaunchJson(currentFolder, sdefData, debuggableAppName, "wp85", "/opt/swi/SWI9X15Y_07.13.02.00/sysroots/x86_64-pokysdk-linux/usr/bin/arm-poky-linux-gnueabi/arm-poky-linux-gnueabi-gdb"); // TODO get toolchain from leaf
  updateTasks(currentFolder, activeSdef, debuggableAppName, "wp85", Config.get("root")); // TODO legato root from leaf



}

let _dontShowDevmodeWarning = false;
function onSdefParsed(data: any) {
  commands.executeCommand("setContext", "legato.systemViewEnabled", true);
  console.log("==== GOT SDEF DATA === ");
  console.log(data);
  console.log("Pushing it to tree!");
  svp.update(data);
  sdef_statusbar.text = `Active sdef: ${data.name}`;

  let myapps = getOwnApps(data);

  if (!myapps.find(x => x.name === debuggableAppName)) {
    if (myapps.length === 0) {
      return; // needs at least one app to debug. TODO: let #included apps be debugged too
    }
    if (myapps.length === 1) {
      debuggableAppName = myapps[0].name;
    }
    else {
      window.showQuickPick(myapps.map(x => x.name), { canPickMany: false, placeHolder: "Which app should be debugged with F5?" }).then((dbgApp) => {
        debuggableAppName = dbgApp;
        generateLaunchConfig(data);
      });
    }
  }
  else {
    generateLaunchConfig(data);
  }

  if (!_dontShowDevmodeWarning) {
    const apps = data['apps'];
    const devMode = apps.find((x: any) => x.name === 'devMode');
    if (!devMode) {
      window
        .showInformationMessage(
          "Hey listen! Your sdef does not contain devMode, which is necessary for debugging.",
          "Add it",
          "Don't remind me again"
        )
        .then(r => {
          if (!r) {
            return;
          }
          if (r.startsWith("Add it")) {
            addToSdefSection(
              Uri.parse("file://" + activeSdef),
              "apps",
              "$LEGATO_ROOT/apps/tools/devMode"
            );
          } else {
            _dontShowDevmodeWarning = true;
          }
        });
    }
  }

}

function chooseActiveSdef(userInitiated?: boolean) {
  listSdefs()
    .then(sdefs => {
      if (sdefs.length === 0) {
        if (userInitiated) {
          window.showErrorMessage("No .sdef files found in workspace.");
        }
        return null;
      }
      if (sdefs.length === 1) {
        window.showInformationMessage(
          `Active .sdef set to the only one - ${sdefs[0].fsPath}`
        );
        return sdefs[0];
      } else {
        if (userInitiated) {
          return window
            .showQuickPick(sdefs.map(s => s.toString()))
            .then(Uri.parse);
        }
        return null;
      }
    })
    .then(path => {
      if (path) {
        setActiveSdef(path);
      }
    });

}

let activeSdef: string;

function refreshSdef() {
  if (activeSdef) {
    setActiveSdef(Uri.parse("file://" + activeSdef));
  }
}
workspace.onDidSaveTextDocument((e: TextDocument) => {
  // to prevent changes to launch config instantly getting overriden
  if (e.uri.fsPath.indexOf(".vscode") > -1) {
    refreshSdef();
  }
});

function setActiveSdef(path: Uri) {
  console.log(`Setting active sdef to ${path.toString()}`);
  activeSdef = path.fsPath;
  client.sendRequest("setActiveSdef", path);
}

function onServerReady() {
  window.showInformationMessage("Server ready.");
  client.onNotification("updateSdefTree", (data: any) => onSdefParsed(data));
  chooseActiveSdef();
}
let svp: SystemViewProvider;
let sdef_statusbar: StatusBarItem;
let leaf_statusbar: StatusBarItem;
let client: LanguageClient;

export function activate(context: ExtensionContext) {
  if (ensureLeafInstalled()) {
    window.showInformationMessage(`Found leaf: ${getLeafVersion()}`);
    leaf_statusbar = window.createStatusBarItem(StatusBarAlignment.Left, 11);
    leaf_statusbar.command = "legato.leaf.profile.choose";
    leaf_statusbar.text = "(current profile goes here)";
    leaf_statusbar.show();

    getLeafWorkspace();
  }

  svp = new SystemViewProvider(context);
  window.registerTreeDataProvider("legato.systemView", svp);

  sdef_statusbar = window.createStatusBarItem(StatusBarAlignment.Left, 10);
  sdef_statusbar.command = "legato.pickSdef";
  sdef_statusbar.text = "<No sdef selected>";
  sdef_statusbar.show();

  commands.registerCommand("legato.systemView.createApp", () => {
    newAppWizard();
  });

  // The server is implemented in node
  let serverModule = context.asAbsolutePath(
    path.join("server", "out", "server.js")
  );
  // The debug options for the server
  let debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  let serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions
    }
  };

  // Options to control the language client
  let clientOptions: LanguageClientOptions = {
    // Register the server for xdefs
    documentSelector: [
      { language: "cdef" },
      { language: "adef" },
      { language: "sdef" },
      { language: "mdef" }
    ],
    synchronize: {
      configurationSection: "legato",
      // Notify the server about file changes to '.clientrc files contain in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc")
    },
    initializationOptions: {
      legatoRoot: Config.get("legato.root")
    }
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    "legatoLangServer",
    "Legato Language Server",
    serverOptions,
    clientOptions
  );

  // Start the client. This will also launch the server
  client.onReady().then(onServerReady);
  client.start();
}

export function deactivate(): Thenable<void> {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
