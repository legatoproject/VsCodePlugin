import * as path from 'path';
import * as vscode from 'vscode';
import { DocumentSymbol, Range, SymbolKind } from "vscode-languageclient";
import { Command, Context, TaskDefinitionType, View } from "../commons/identifiers";
import { ProcessLauncherOptions, TaskProcessLauncher } from '../commons/process';
import { TreeDataProvider2, TreeItem2 } from "../commons/uiUtils";
import { LeafManager } from '../leaf/core';
import { LegatoEvent, LegatoManager, LEGATO_ENV } from "./core";
import { LegatoLanguageEvent, LegatoLanguageManager } from "./language";

export class LegatoSystemTreeview extends TreeDataProvider2 {
	private symbols: DocumentSymbol | undefined;
	private readonly legatoTaskProcessLauncher: TaskProcessLauncher;

	/**
	 * Register TreeDataProvider
	 * Create commands
	 * Listen to packages changes
	 */
	public constructor(
		private readonly leafManager: LeafManager,
		private readonly legatoManager: LegatoManager,
		private readonly legatoLanguageManager: LegatoLanguageManager
	) {
		super(View.LegatoSystem);

		// Create the task process launcher (this class can launch a process as a vscode task)
		let options: ProcessLauncherOptions = {
			defaultCwd: this.leafManager.getVsCodeLeafWorkspaceFolder().uri.toString(),
			envProvider: this.leafManager.getEnvVars,
			thisArg: this.leafManager
		};
		this.legatoTaskProcessLauncher = new TaskProcessLauncher(TaskDefinitionType.LegatoBuild, options);

		this.createCommand(Command.LegatoSystemCreate, this.createSystem, this);
		this.createCommand(Command.LegatoSystemOpenFile, (unresolvedPath, range) => this.gotoSymbol(unresolvedPath, range));
		this.createCommand(Command.LegatoSystemCreateApplication, this.newApplication, this);
		this.createCommand(Command.LegatoSystemAddApplication, this.addExistingApplication, this);
		this.createCommand(Command.LegatoSystemRename, this.renameSystem, this);
		this.createCommand(Command.LegatoAppRename, this.renameApplication, this);
		this.createCommand(Command.LegatoAppRemove, this.removeApplication, this);
		this.createCommand(Command.LegatoAppAddComponent, this.addExistingComponent, this);
		this.createCommand(Command.LegatoAppNewComponent, this.newComponent, this);
		this.createCommand(Command.LegatoComponentRename, this.renameComponent, this);
		this.createCommand(Command.LegatoComponentRemove, this.removeComponent, this);

		this.legatoManager.addListener(LegatoEvent.OnLegatoDefFileChange, this.onLegatoDefFileChange, this, this);
		this.legatoLanguageManager.addListener(LegatoLanguageEvent.OnLegatoSystemViewUpdated, this.onLogicalViewRefresh, this, this);
		this.setInitialState();
	}

	private async setInitialState() {
		this.onLegatoDefFileChange(undefined, await this.legatoManager.getActiveDefFile());
	}

	/**
	 * On active def file change, request the language server the corresponding system map
	 * @param _oldActiveDeFile o
	 * @param newActiveDeFile 
	 */
	private async onLegatoDefFileChange(_oldActiveDeFile: vscode.Uri | undefined, newActiveDeFile: vscode.Uri | undefined) {
		//show or not the System view in activity bar
		if (await this.leafManager.getEnvValue(LEGATO_ENV.LEGATO_LANGUAGE_SERVER)) {
			vscode.commands.executeCommand(Command.VscodeSetContext, Context.LegatoSystemEnabled, newActiveDeFile !== undefined);
			if (newActiveDeFile) {
				console.log(`LEGATO_DEF_FILE changed from ${_oldActiveDeFile} to ${newActiveDeFile.toString()}`);
				this.symbols = await this.legatoLanguageManager.requestLegatoActiveDefFileOutline(newActiveDeFile);
				if (this.symbols) {
					console.log(JSON.stringify(this.symbols));
					this.refresh();
				}
			} else {
				// No def file selected, let's suggest creating a new system
				let selectExistingSysyem = 'Select system...';
				let createAction = 'Create system...';
				let result = await vscode.window.showInformationMessage('No Legato definition file selected yet; you can either select an existing one or create a new system.', selectExistingSysyem, createAction);
				if (result === selectExistingSysyem) {
					vscode.commands.executeCommand(Command.LegatoBuildPickDefFile);
				}
				else if (result === createAction) {
					vscode.commands.executeCommand(Command.LegatoSystemCreate);
				}
			}
		}
	}

	private async onLogicalViewRefresh(data: any) {
		// as the data received from the language server does not with DocumentSymbol, a 'le_GetLogicalView' request is sent to reresh the treeview
		this.onLegatoDefFileChange(undefined, await this.legatoManager.getActiveDefFile());
	}

	private async getCwd(): Promise<string> {
		let uri = await this.legatoManager.getActiveDefFile();
		if (!uri) {
			throw new Error('No active def file selected');
		}
		return path.dirname(uri.fsPath);
	}

	/**
	 * Called when the user clicks on a node in the Legato System treeview
	 */
	private async gotoSymbol(path: string, range: vscode.Range) {
		let fileUri = vscode.Uri.parse(path);
		try {
			await vscode.window.showTextDocument(fileUri, { selection: range });
		} catch (reason) {
			console.log(`Failed to open path ${path}`);
			console.log(`Reason : ${reason}`);
			vscode.window.showWarningMessage(`Failed to open file ${path}. ${reason}`);
		}
	}

	private async addExistingApplication() {
		vscode.window.showErrorMessage('Waiting for workspaceSymbol(ADEF) request implementation to pick an existing adef to add');
		// let client = this.legatoLanguageManager.lspClient;
		// if (client) {
		// 	//request all available ADEF in order to add it to the current SDEF
		// 	let symbols = await client.sendRequest(WorkspaceSymbolRequest.type, { query: "adef" });
		// 	if (symbols) {
		// 		let symbolsCombo = vscode.window.createQuickPick();
		// 		symbolsCombo.placeholder = 'Select the application you want to include';
		// 		symbolsCombo.items = symbols.map((symb: SymbolInformation) => new SymbolQuickPickItem(symb));
		// 		const addSelectedAdefCommand = (e: vscode.QuickPickItem[]) => {
		// 			let existingAdef = (<SymbolQuickPickItem>e[0]).label;
		// 			let createAppCmd = `mkedit add app ${existingAdef}`;
		// 			this.legatoTaskProcessLauncher.executeInShell("mkedit", createAppCmd);
		// 			symbolsCombo.dispose();
		// 		};
		// 		symbolsCombo.onDidChangeSelection(addSelectedAdefCommand);
		// 		symbolsCombo.show();
		// 	}
		// }
	}
	private async createSystem() {
		let newSystem = await vscode.window.showInputBox({
			prompt: "Please enter a name for your new system",
			placeHolder: "newSystemName"
		});
		if (newSystem) {
			let createSystemCmd = `mkedit create system ${newSystem}`;
			this.legatoTaskProcessLauncher.executeInShell("mkedit", createSystemCmd, this.leafManager.getVsCodeLeafWorkspaceFolder().uri.fsPath);
		}
	}
	private async renameSystem(node: DocumentSymbolTreeItem) {
		let newSystem = await vscode.window.showInputBox({
			prompt: "Please enter a new name for your system",
			placeHolder: "newSystemName"
		});
		if (newSystem) {
			let sdefUri = vscode.Uri.parse(node.symbol.location.uri);
			// rename the sdef file into the same directory
			let renameSystemCmd = `mkedit rename system ${sdefUri.fsPath} ${path.join(path.dirname(sdefUri.fsPath), newSystem)}`;
			this.legatoTaskProcessLauncher.executeInShell("mkedit", renameSystemCmd, await this.getCwd());
		}
	}

	/***
	 * Invoke mkedit to create a new application
	 */
	private async newApplication() {
		let newApp = await vscode.window.showInputBox({
			prompt: "Please enter a name for your new application",
			placeHolder: "newApp"
		});
		if (newApp) {
			let createAppCmd = `mkedit create app ${newApp}`;
			this.legatoTaskProcessLauncher.executeInShell("mkedit", createAppCmd, await this.getCwd());
		}
	}

	/***
	 * Invoke mkedit to rename the current application
	 */
	private async renameApplication(node: DocumentSymbolTreeItem) {
		let newApp = await vscode.window.showInputBox({
			prompt: "Please enter a new name for your application",
			placeHolder: "newApp"
		});
		if (newApp) {
			let renameAppCmd = `mkedit rename app ${node.label} ${newApp}`;
			this.legatoTaskProcessLauncher.executeInShell("mkedit", renameAppCmd, await this.getCwd());
		}
	}
	private async removeApplication(node: DocumentSymbolTreeItem) {
		if (node) {
			let removeAppCmd = `mkedit remove app ${node.label}`;
			this.legatoTaskProcessLauncher.executeInShell("mkedit", removeAppCmd, await this.getCwd());
		}
	}

	private async addExistingComponent() {
		//TODO quick pick to existing CDEF
		vscode.window.showErrorMessage('Waiting for workspaceSymbol(CDEF) request implementation to pick an existing cdef to add');
		// let newComponent = await vscode.window.showInputBox({
		// 	prompt: "Please enter a name for your new component",
		// 	placeHolder: "newComponent"
		// });
		// if (newComponent) {
		// 	let createComponentCmd = `mkedit add component ${newComponent}`;
		// 	this.legatoTaskProcessLauncher.executeInShell("mkedit", createComponentCmd, await this.getCwd());
		// }
	}
	private async newComponent(applicationNode: DocumentSymbolTreeItem) {
		let newcomp = await vscode.window.showInputBox({
			prompt: "Please enter a name for your new component",
			placeHolder: "newComp"
		});
		if (newcomp) {
			const currentAdef = applicationNode.label;
			let createAppCmd = `mkedit create component ${newcomp} app ${currentAdef}`;
			this.legatoTaskProcessLauncher.executeInShell("mkedit", createAppCmd, await this.getCwd());
		}
	}
	private async renameComponent(node: DocumentSymbolTreeItem) {
		let newApp = await vscode.window.showInputBox({
			prompt: "Please enter a new name for your component",
			placeHolder: "newComponent"
		});
		if (newApp) {
			let renameComponentCmd = `mkedit rename component ${node.label} ${newApp}`;
			this.legatoTaskProcessLauncher.executeInShell("mkedit", renameComponentCmd, await this.getCwd());
		}
	}
	private async removeComponent(node: DocumentSymbolTreeItem) {
		if (node) {
			let removeComponentCmd = `mkedit remove component ${node.label}`;
			this.legatoTaskProcessLauncher.executeInShell("mkedit", removeComponentCmd, await this.getCwd());
		}
	}

	public async getRootElements(): Promise<TreeItem2[]> {
		if (!this.symbols) {
			let activeDefFile = await this.legatoManager.getActiveDefFile();
			this.onLegatoDefFileChange(undefined, activeDefFile);
		}

		if (this.symbols) {
			if (DocumentSymbol.is(this.symbols)) {
				return [new DocumentSymbolTreeItem(this.symbols, undefined)];
			}
		}
		return [];
	}
}

enum LegatoType {
	Sdef,
	Mdef,
	AppsSection,
	Adef,
	ComponentsSection,
	Cdef,
	Api,
	Function
}
const symbolsKindToLegato: Map<SymbolKind, LegatoType> = new Map([
	[SymbolKind.File, LegatoType.Sdef],
	[SymbolKind.Module, LegatoType.Mdef],
	[SymbolKind.Namespace, LegatoType.AppsSection],
	[SymbolKind.Interface, LegatoType.Adef],
	[SymbolKind.Package, LegatoType.ComponentsSection],
	[SymbolKind.Class, LegatoType.Cdef],
	[SymbolKind.Function, LegatoType.Api],
]);

const legatoTypesToContext: Map<LegatoType, Context> = new Map(
	[
		[LegatoType.Sdef, Context.LegatoSystemSelected],
		[LegatoType.AppsSection, Context.LegatoAppsSelected],
		[LegatoType.Adef, Context.LegatoAppCurrent],
		[LegatoType.Mdef, Context.LegatoMdefSelected]
	]
);

/**
 * Icons association to display in treeview
 */
const legatoTypesToIcon: Map<LegatoType, string> = new Map(
	[
		[LegatoType.Sdef, 'SystemViewSdef.gif']
		// [LegatoType.AppsSection, 'SystemViewApps.gif'],
		// [LegatoType.Adef, 'SystemViewAdef.gif'],
		// [LegatoType.Cdef, 'SystemViewCdef.gif']
	]
);

function context(symbolKind: SymbolKind, symbolName: string): Context {
	let legatoType = symbolsKindToLegato.get(symbolKind);
	let context: Context;
	let matchingContext = legatoType !== undefined ? legatoTypesToContext.get(legatoType) : undefined;
	context = matchingContext ? matchingContext : Context.LegatoSystemEnabled;
	return context;
}

/**
* Define a namespaced ID by using the parent hierarchy. 
**/
function processId(symbolParent: TreeItem2 | undefined, symbolName: string): string {
	const cleanName = (symbolName: string) => {
		//symbol name is trimmed below
		return symbolName.replace(':', '').replace('.sdef', '');
	};
	const getPathToRoot = (symbol: TreeItem2, ancestors: string[]): string[] => {
		let trimmedSymbolName = cleanName(symbol.label);
		if (symbol.parent) {
			return getPathToRoot(symbol.parent, ancestors.concat(trimmedSymbolName));
		} else {
			return ancestors.concat(trimmedSymbolName);
		}
	};
	let processedId = symbolParent ? getPathToRoot(symbolParent, [cleanName(symbolName)]).reverse().join('.') : cleanName(symbolName);
	return processedId;
}


class DocumentSymbolTreeItem extends TreeItem2 {
	symbol: any;
	constructor(symbol: DocumentSymbol, parent: DocumentSymbolTreeItem | undefined) {
		super(processId(parent, symbol.name), undefined, symbol.name, "", "",
			vscode.TreeItemCollapsibleState.Expanded,
			context(symbol.kind, symbol.name),
			legatoTypesToIcon.get(symbol.kind));
		this.symbol = symbol;
		this.parent = parent;

		this.setInitialState(symbol);
	}

	private async setInitialState(symbol: DocumentSymbol) {
		this.command = await showInFileCommand((<string>this.symbol["defPath"]), symbol.range);
	}

	public async getChildren(): Promise<TreeItem2[]> {
		if (this.symbol.children) {
			return Promise.resolve(this.symbol.children.map((value: DocumentSymbol) => {
				return new DocumentSymbolTreeItem(value, this);
			}
			));
		} else {
			return Promise.resolve([]);
		}
	}
}

async function showInFileCommand(rawPath: string, range: Range): Promise<vscode.Command> {
	return {
		title: "Show in file",
		command: Command.LegatoSystemOpenFile,
		arguments: [rawPath, range]
	};
}
