/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
"use strict";

import { exec, spawn, execFile, execFileSync } from "child_process";
import {
  FSWatcher,
  watch,
  writeFileSync,
  readdirSync,
  createReadStream,
  unlinkSync
} from "fs";
import {
  CompletionItem,
  CompletionItemKind,
  Diagnostic,
  DiagnosticSeverity,
  DidChangeConfigurationNotification,
  InitializeParams,
  Position,
  ProposedFeatures,
  Range,
  TextDocument,
  TextDocumentChangeEvent,
  TextDocumentPositionParams,
  TextDocuments,
  createConnection
} from "vscode-languageserver";
import * as api_parse from "./api_parse";
import URI from "vscode-uri";
import { dirname, join } from "path";
import * as readline from "readline";
import { settings } from "cluster";
import { resolve } from "vscode-languageserver/lib/files";

// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;
let hasDiagnosticRelatedInformationCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
  let capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we will fall back using global settings
  hasConfigurationCapability =
    capabilities.workspace && !!capabilities.workspace.configuration;
  hasWorkspaceFolderCapability =
    capabilities.workspace && !!capabilities.workspace.workspaceFolders;
  hasDiagnosticRelatedInformationCapability =
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation;
  connection.console.log(
    `[Server(${process.pid}) Started and initialize received`
  );
  connection.sendNotification("Ready");
  return {
    capabilities: {
      textDocumentSync: documents.syncKind,
      // Tell the client that the server supports code completion
      completionProvider: {
        resolveProvider: false
      }
    }
  };
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders(_event => {
      connection.console.log("Workspace folder change event received.");
    });
  }
});

connection.onExit(() => {
  // clean up all ramfs files used
  for (let doc of Object.keys(tempPaths)) {
    let path = tempPaths[doc];
    try {
      // don't delete anything important
      if (path.startsWith("/dev/shm/tmp")) {
        unlinkSync(path);
      }
    } catch {
      // it's ok if the file doesn't exist or something
    }
  }
});
// The example settings
export interface LegatoServerSettings {
  root: string;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
let globalSettings: LegatoServerSettings;

// Cache the settings of all open documents
let documentSettings: Map<string, Thenable<LegatoServerSettings>> = new Map();

let tempPaths: { [key: string]: string } = {}; // mapping from source filename to ramfs temp file fed to parser

connection.onDidChangeConfiguration(change => {
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  } else {
    globalSettings = <LegatoServerSettings>change.settings.legato;
  }

  // Revalidate all open text documents
  documents.all().forEach(validateTextDocument);
});

function getDocumentSettings(resource: string): Thenable<LegatoServerSettings> {
  if (!hasConfigurationCapability) {
    return Promise.resolve(globalSettings);
  }
  let result = documentSettings.get(resource);
  if (!result) {
    result = connection.workspace.getConfiguration({
      scopeUri: resource,
      section: "legato"
    });
    documentSettings.set(resource, result);
  }
  return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
  documentSettings.delete(e.document.uri);
});

// text changed, so reparse it
documents.onDidChangeContent((e: TextDocumentChangeEvent) => {
  connection.console.log(`${e.document.uri} changed`);
  validateTextDocument(e.document);
});
function execParse(tempPath: string): Thenable<Diagnostic[]> {
  return new Promise((resolve, reject) =>
    getDocumentSettings(null).then(settings => {
      connection.console.log(JSON.stringify(tempPaths));
      connection.console.log(`-> ${tempPath}`);
      // TODO: call through leaf shell (TODO: needs leaf support from lang server)
      let proc = spawn(join(settings.root, `/bin/mkparse`), [tempPath],{env:{"LEGATO_ROOT":settings.root,
    "LEGATO_TARGET":"localhost"}});
      let diagnostics: Diagnostic[] = [];
      proc.stdout.on("data", data => {
        // TODO: RegExp based output parsing should be replaced with some sort of structured data.

        data
          .toString()
          .split(/\r?\n/g)
          .forEach(line => {
            connection.console.log(line);

            // this line indicates an error
            let result = /(\d+):(\d+): error: (.*)$/.exec(line);

            // this line is received when recovering to a sync token
            let bail = /Skipping from (\d+):(\d+) to (\d+):(\d)/.exec(line);

            // it's an error, so parse the position and push it
            // (just on the character it's at, with no length)
            if (result !== null && result.length === 4) {
              let lineStart = Number.parseInt(result[1]) - 1;
              let colStart = Number.parseInt(result[2]);
              let range: Range = Range.create(
                lineStart,
                colStart,
                lineStart,
                colStart + 1
              );
              diagnostics.push(
                Diagnostic.create(range, result[3], DiagnosticSeverity.Error)
              );
            }
            // it's a recovery, so update the end position of the last error pushed
            else if (bail !== null && bail.length === 5) {
              let lineEnd = Number.parseInt(bail[3]) - 1;
              let colEnd = Number.parseInt(bail[4]);
              diagnostics[diagnostics.length - 1].range.end = Position.create(
                lineEnd,
                colEnd
              );
            }
          });
      });

      proc.stderr.on("data", data => {
        connection.console.log(`stderr: ${data}`);
        reject(data);
      });

      proc.on("close", code => {
        connection.console.log(
          `mkparse child process exited with code ${code}`
        );
        resolve(diagnostics);
      });
    })
  );
}

function writeToTemp(doc: TextDocument): Promise<string> {
  const data = doc.getText();
  let uriparts = doc.uri.split(".");
  const fileExt: string = uriparts[uriparts.length - 1] // pull out extension
    .replace(/\W/gi, ""); // sanitize (delete non-alphanumeric/"_") just in case, since it's being passed to a shell
  return new Promise((resolve, reject) => {
    try {
      // either we already have a temp file for this file or use "" to throw an exception
      let path = tempPaths[doc.uri] || "";
      writeFileSync(path, data);
      resolve(path);
    } catch (err) {
      if (err.code === "ENOENT") {
        // temp file doesn't exist
        // so make it
        tempPaths[doc.uri] = execFileSync("mktemp",['--suffix', `.${fileExt}`, '-p', '/dev/shm'])
          .toString()
          .trim();
        try {
          // try again with the hew file
          let path = tempPaths[doc.uri];
          writeFileSync(path, data);
          resolve(path);
        } catch (err2) {
          // all is lost, abandon hope
          reject(err2);
        }
      } else {
        reject(err);
      }
    }
  });
}
async function validateTextDocument(textDocument: TextDocument): Promise<void> {
  writeToTemp(textDocument) // write the contents to a ramfs file
    .then(execParse) // then call mkparse
    .then((diagnostics: Diagnostic[]) => {
      // then send the errors back to the client
      connection.sendDiagnostics({
        uri: textDocument.uri,
        diagnostics
      });
    });
}

connection.onDidChangeWatchedFiles(_change => {
  // Monitored files have change in VSCode
  connection.console.log("We received an file change event");
});



let activeSdef: URI;
let sdefWatcher: FSWatcher;
function setActiveSdef(sdef: URI) {
  if (sdefWatcher) {
    sdefWatcher.close();
  }

  activeSdef = sdef;

  console.log(`Watching ${activeSdef}`);
  sdefWatcher = watch(activeSdef.fsPath, () =>
    parseSdef().then(x => connection.sendNotification("updateSdefTree", x))
  );
  parseSdef().then(x => connection.sendNotification("updateSdefTree", x));
}
function parseSdef() {
  return getDocumentSettings(activeSdef.toString()).then(
    x =>
      new Promise((resolve, reject) => {
        console.log(join(x.root, "bin/mksys"));
          console.log(["-J", activeSdef.fsPath]);
        execFile(
          join(x.root, "bin/mksys"),
          ["-J", activeSdef.fsPath],
          { timeout: 5000,
          env:{LEGATO_ROOT: x.root} },
          (error, stdout, stderr) =>
            error ? reject(stderr) : resolve(JSON.parse(stdout.toString()))
        );
      })
  );
}
connection.onRequest("setActiveSdef", setActiveSdef);

connection.onRequest("genStubs", (api: string) => {
  api = api.replace(/[^\w\.\/]/gi, "");
  return getDocumentSettings(null).then(settings => {
    return {
      data: execFileSync(join(settings.root, `/framework/tools/ifgen/ifgen`), [
        "--gen-stubs",
        "--output-dir",
        "-",
        join(settings.root, `/interfaces/${api}`)
      ])
        .toString()
        .trim()
    };
  });
});

function listApis(): Thenable<string[]> {
  return getDocumentSettings(null).then(settings => {
    const root = settings.root;
    const searchPaths = [join(root, "interfaces/")];
    return api_parse.listApis(searchPaths);
  });
}

connection.onRequest("listApis", () => {
  return listApis().then(apis => ({ data: apis }));
});

// provide completions
connection.onCompletion(
  (
    textDocumentPosition: TextDocumentPositionParams
  ): Promise<CompletionItem[]> =>
    getCurrentSection(textDocumentPosition).then(currentSection => {
      switch (currentSection) {
        case "api":
          // TODO: memoize apis?
          return listApis().then(apis =>
            apis.map(x => {
              return CompletionItem.create(x);
            })
          );
        case "sources":
          // get all .c files in the same dir
          let filePath = URI.parse(textDocumentPosition.textDocument.uri)
            .fsPath;
          return readdirSync(dirname(filePath))
            .filter(x => x.endsWith(".c")) // TODO: suggest other langs?
            .map(CompletionItem.create);
        default:
          return [];
      }
    })
);

// TODO: get this info from mkparse
function getCurrentSection(
  textDocumentPosition: TextDocumentPositionParams
): Promise<string> {
  interface Sec {
    name: string;
    pos: Position;
  }
  return new Promise((resolve, reject) => {
    const curTempFile = tempPaths[textDocumentPosition.textDocument.uri];
    if (curTempFile === undefined) {
      reject();
    }
    const rl = readline.createInterface({
      input: createReadStream(curTempFile),
      crlfDelay: Infinity
    });
    let curLine = 0;
    let lastSecSeen = "<root>";
    rl.on("line", (data: string) => {
      if (curLine === textDocumentPosition.position.line) {
        data = data.substring(0, textDocumentPosition.position.character);
        rl.close(); // read no further
      }
      let match = data.match(/\b(\w+)\b\s*:/);
      if (match !== null) {
        console.log(match);
        lastSecSeen = match.pop();
      }

      curLine++;
    });
    rl.on("close", () => {
      connection.console.log(`getCurrentSection() -> ${lastSecSeen}`);
      resolve(lastSecSeen);
    });
  });
}
/*
connection.onDidOpenTextDocument((params) => {
	// A text document got opened in VSCode.
	// params.uri uniquely identifies the document. For documents store on disk this is a file URI.
	// params.text the initial full content of the document.
	connection.console.log(`${params.textDocument.uri} opened.`);
});
connection.onDidChangeTextDocument((params) => {
	// The content of a text document did change in VSCode.
	// params.uri uniquely identifies the document.
	// params.contentChanges describe the content changes to the document.
	connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
});
connection.onDidCloseTextDocument((params) => {
	// A text document got closed in VSCode.
	// params.uri uniquely identifies the document.
	connection.console.log(`${params.textDocument.uri} closed.`);
});
*/

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
