import * as vscode from 'vscode';
import { DocumentSymbol, Range, SymbolKind } from "vscode-languageclient";
import { Command, Context, View } from "../../commons/identifiers";
import { ACTION_LABELS, TreeDataProvider2, TreeItem2 } from "../../commons/uiUtils";
import { LegatoManager } from "../api/core";
import { showHint } from '../../commons/hints';
import { LegatoLanguageManager, LegatoLanguageRequest } from "../api/language";
import { DefinitionObject } from '../../@types/legato-languages';
import { pathExists } from 'fs-extra';

export class LegatoSystemTreeview extends TreeDataProvider2 {
	private symbols: DefinitionObject | undefined;

	/**
	 * Register TreeDataProvider
	 * Create commands
	 * Listen to packages changes
	 */
	public constructor(
		private readonly legatoManager: LegatoManager,
		private readonly legatoLanguageManager: LegatoLanguageManager
	) {
		super(View.LegatoSystem);

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

		this.legatoManager.defFile.addListener(this.onLegatoDefFileChange, this);
		this.legatoLanguageManager.defFileModel.addListener(this.onLogicalViewRefresh, this);
	}

	/**
	 * Hint to create an application
	 * Shown when a system is created without application
	 */
	private async showCreateAppHint() {
		let result = await showHint(
			"Do you want to create a new app in the system?",
			"Create app...");
		if (result) {
			vscode.commands.executeCommand(Command.LegatoSystemCreateApplication);
		}
	}

	/**
	 * Hint to create an system
	 * Shown when a no system is selected as aactive def file
	 */
	private async showCreateSystemHint(hintMessage: string) {
		const selectExistingSystem = 'Select system...';
		const createAction = 'Create system...';
		let result = await showHint(
			hintMessage,
			selectExistingSystem, createAction);
		switch (result) {
			case selectExistingSystem:
				vscode.commands.executeCommand(Command.LegatoBuildPickDefFile);
				break;
			case createAction:
				await vscode.commands.executeCommand(Command.LegatoSystemCreate);
				this.showCreateAppHint();
				break;
		}
	}

	/**
	 * On active def file change, request the language server the corresponding system map
	 * @param newActiveDeFile
	 * @param oldActiveDeFile o
	 */
	private async onLegatoDefFileChange(newActiveDeFile: vscode.Uri | undefined, oldActiveDeFile: vscode.Uri | undefined) {
		//show or not the System view in activity bar
		if (await this.legatoManager.languageServer.get()) {
			vscode.commands.executeCommand(Command.VscodeSetContext, Context.LegatoSystemEnabled, newActiveDeFile !== undefined);
			if (newActiveDeFile) {
				if (!pathExists(newActiveDeFile.fsPath)) {
					this.showCreateSystemHint('The selected Legato definition file does not exist anymore; you can either select an existing one or create a new system.');
				} else {
					console.log(`LEGATO_DEF_FILE changed from ${oldActiveDeFile} to ${newActiveDeFile.toString()}`);
					if (this.legatoLanguageManager.languageClient) {
						this.legatoLanguageManager.languageClient.sendRequest(LegatoLanguageRequest.LegatoRegisterModelUpdates);
					}
				}
			} else {
				// No def file selected, let's suggest creating a new system
				this.showCreateSystemHint('No Legato definition file selected yet; you can either select an existing one or create a new system.');
			}
		}
	}

	/**
	 * On [[LegatoLanguageEvent.OnLegatoSystemViewUpdated]] event, the logical system view is updated
	 * @param data refreshed symbols expected to fit le_DefinitionObject
	 */
	private async onLogicalViewRefresh(data: any) {
		this.symbols = data;
		this.refresh();
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
		// 			this.legatoManager.mkEdit.addExistingApplication(existingAdef);
		// 			symbolsCombo.dispose();
		// 		};
		// 		symbolsCombo.onDidChangeSelection(addSelectedAdefCommand);
		// 		symbolsCombo.show();
		// 	}
		// }
	}

	private async createSystem(): Promise<void> {
		let newSystem = await vscode.window.showInputBox({
			prompt: "Please enter a name for your new system",
			placeHolder: "newSystemName"
		});
		if (newSystem) {
			return this.legatoManager.mkEdit.createSystem(newSystem);
		}
	}

	private async renameSystem(sdef: DocumentSymbolTreeItem): Promise<void> {
		let newSystemName = await vscode.window.showInputBox({
			prompt: "Please enter a new name for your system",
			placeHolder: "newSystemName"
		});
		if (newSystemName) {
			return this.legatoManager.mkEdit.renameSystem(sdef.label, newSystemName);
		}
	}

	/***
	 * Invoke mkedit to create a new application
	 */
	private async newApplication(): Promise<void> {
		let newApp = await vscode.window.showInputBox({
			prompt: "Please enter a name for your new application",
			placeHolder: "newApp"
		});
		if (newApp) {
			return this.legatoManager.mkEdit.newApplication(newApp);
		}
	}

	/***
	 * Invoke mkedit to rename the current application
	 */
	private async renameApplication(app: DocumentSymbolTreeItem): Promise<void> {
		let newApp = await vscode.window.showInputBox({
			prompt: "Please enter a new name for your application",
			placeHolder: "newApp"
		});
		if (newApp) {
			return this.legatoManager.mkEdit.renameApplication(app.label, newApp);
		}
	}
	private async removeApplication(app: DocumentSymbolTreeItem) {
		if (app) {
			let confirmed = ACTION_LABELS.OK === await vscode.window.showWarningMessage(
				`Do you really want to remove the "${app.label}" application?`,
				ACTION_LABELS.CANCEL,
				ACTION_LABELS.OK);
			if (confirmed) {
				return this.legatoManager.mkEdit.removeApplication(app.label);
			}
		}
	}

	private async addExistingComponent(): Promise<void> {
		//TODO quick pick to existing CDEF
		vscode.window.showErrorMessage('Waiting for workspaceSymbol(CDEF) request implementation to pick an existing cdef to add');
		// let newComponent = await vscode.window.showInputBox({
		// 	prompt: "Please enter a name for your new component",
		// 	placeHolder: "newComponent"
		// });
		// if (newComponent) {
		//  return this.legatoManager.addExistingComponent(newComponent);
		// }
	}

	private async newComponent(applicationNode: DocumentSymbolTreeItem): Promise<void> {
		let compName = await vscode.window.showInputBox({
			prompt: "Please enter a name for your new component",
			placeHolder: "newComp"
		});
		if (compName) {
			return this.legatoManager.mkEdit.newComponent(applicationNode.label, compName);
		}
	}

	private async renameComponent(cdef: DocumentSymbolTreeItem): Promise<void> {
		let compName = await vscode.window.showInputBox({
			prompt: "Please enter a new name for your component",
			placeHolder: "newComponent"
		});
		if (compName) {
			return this.legatoManager.mkEdit.renameComponent(cdef.label, compName);
		}
	}
	private async removeComponent(cdef: DocumentSymbolTreeItem) {
		if (cdef) {
			return this.legatoManager.mkEdit.removeComponent(cdef.label);
		}
	}

	public async getRootElements(): Promise<TreeItem2[]> {
		if (this.symbols) {
			if (DocumentSymbol.is(this.symbols)) {
				return [new DocumentSymbolTreeItem(this.symbols, undefined)];
			}
		}
		return [];
	}
}

export enum LegatoType {
	Sdef,
	Mdef,
	AppsSection,
	Adef,
	ComponentsSection,
	Cdef,
	Api,
	Function
}
export const symbolsKindToLegato: Map<SymbolKind, LegatoType> = new Map([
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
	symbol: DefinitionObject;
	constructor(symbol: DefinitionObject, parent: DocumentSymbolTreeItem | undefined) {
		super(processId(parent, symbol.name), undefined, symbol.name, "", "",
			(<any>symbol).defaultCollapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded,
			context(symbol.kind, symbol.name),
			legatoTypesToIcon.get(symbol.kind));
		this.symbol = symbol;
		this.parent = parent;

		this.setInitialState(symbol);
	}

	private async setInitialState(symbol: DefinitionObject) {
		this.command = await showInFileCommand((this.symbol.defPath), symbol.range);
	}

	public async getChildren(): Promise<TreeItem2[]> {
		if (this.symbol.children) {
			return Promise.resolve(this.symbol.children.map((value: DocumentSymbol) => {
				return new DocumentSymbolTreeItem((<DefinitionObject>value), this);
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
