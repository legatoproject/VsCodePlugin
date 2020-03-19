import * as vscode from 'vscode';
import { DocumentSymbol, Range, SymbolKind, WorkspaceSymbolRequest, SymbolInformation } from "vscode-languageclient";
import { Command, View } from "../../commons/identifiers";
import { ACTION_LABELS, TreeDataProvider2, TreeItem2, NamespaceContext } from "../../commons/uiUtils";
import { LegatoManager } from "../api/core";
import { showHint } from '../../commons/hints';
import { LegatoLanguageManager, LegatoLanguageRequest } from "../api/language";
import { DefinitionObject } from '../../@types/legato-languages';
import { pathExists } from 'fs-extra';
import { getWorkspaceFolder, getWorkspaceFolderPath } from '../../commons/files';
import * as path from 'path';

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
		this.createCommand(Command.LegatoSystemRemoveApplication, this.removeApplicationInSystem, this);
		this.createCommand(Command.LegatoSystemDeleteApplication, this.deleteApplicationInSystem, this);
		this.createCommand(Command.LegatoSystemRename, this.renameSystem, this);
		this.createCommand(Command.LegatoAppRename, this.renameApplication, this);
		this.createCommand(Command.LegatoAppRemove, this.removeApplication, this);
		this.createCommand(Command.LegatoAppAddComponent, this.addExistingComponent, this);
		this.createCommand(Command.LegatoAppNewComponent, this.newComponent, this);
		this.createCommand(Command.LegatoAppRemoveComponent, this.removeComponentInApp, this);
		this.createCommand(Command.LegatoAppDeleteComponent, this.deleteComponentInApp, this);
		this.createCommand(Command.LegatoComponentRename, this.renameComponent, this);
		this.createCommand(Command.LegatoComponentRemove, this.removeComponent, this);
		this.createCommand(
			Command.LegatoComponentGenerateApiStubFile, this.generateApiStubFile, this);
		// Create Command Palette commands for Legato/System
		this.createCommand(Command.CmdPaletteLegatoSystemCreate, this.createSystem, this);
		this.createCommand(Command.CmdPaletteLegatoSystemRename, this.renameSystem, this);
		// Create Command Palette commands for Legato/App
		this.createCommand(Command.CmdPaletteLegatoAppCreate, this.newApplication, this);
		this.createCommand(Command.CmdPaletteLegatoAppAdd, this.addExistingApplication, this);
		this.createCommand(
			Command.CmdPaletteLegatoAppRemove, this.removeApplicationInSystem, this);
		this.createCommand(
			Command.CmdPaletteLegatoAppDelete, this.deleteApplicationInSystem, this);
		this.createCommand(Command.CmdPaletteLegatoAppRename, this.renameApplication, this);
		// Create Command Palette commands for Legato/Component
		this.createCommand(Command.CmdPaletteLegatoComponentAdd, this.addExistingComponent, this);
		this.createCommand(Command.CmdPaletteLegatoComponentCreate, this.newComponent, this);
		this.createCommand(
			Command.CmdPaletteLegatoComponentRemove, this.removeComponentInApp, this);
		this.createCommand(
			Command.CmdPaletteLegatoComponentDelete, this.deleteComponentInApp, this);
		this.createCommand(Command.CmdPaletteLegatoComponentRename, this.renameComponent, this);

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
			vscode.commands.executeCommand(Command.VscodeSetContext, LegatoContext.LanguageServerReady.getValue(), newActiveDeFile !== undefined);
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

	/**
	 * Get Apps symbol from the current system
	 */
	private async getAppsFromSystem(): Promise<DocumentSymbolTreeItem | undefined> {
		let systemSymbol: DocumentSymbolTreeItem | undefined;

		if (this.symbols) {
			if (DocumentSymbol.is(this.symbols)) {
				systemSymbol = new DocumentSymbolTreeItem(this.symbols, undefined);
			}
		}

		if (systemSymbol) {
			let appsSymbols = await systemSymbol.getChildren();

			for (let appsSymbol of appsSymbols) {
				if (appsSymbol.symbol.name !== "included apps") {
					return appsSymbol;
				}
			}
		}
	}

	/**
	 * Get App symbol from the current system
	 */
	private async getAppFromSystem(): Promise<DocumentSymbolTreeItem | undefined> {
		let appsSymbol = await this.getAppsFromSystem();

		if (appsSymbol) {
			let appsChildrens = await appsSymbol.getChildren();
			let items: SymbolQuickPickItemFromTreeView[] = new Array;
			for (let i = 0; i < appsChildrens.length; i++) {
				items.push(new SymbolQuickPickItemFromTreeView(
					appsChildrens[i].symbol.name,
					appsChildrens[i].symbol.defPath,
					appsChildrens[i]));
			}
			let item = await vscode.window.showQuickPick(items, {
				placeHolder: 'Select the application to make action'
			});
			if (item && item.symbol) {
				return item.symbol;
			}
		}
	}

	/**
	 * Get Component symbol from the current system
	 */
	private async getComponentFromSystem(): Promise<DocumentSymbolTreeItem | undefined> {
		let appSymbol = await this.getAppFromSystem();

		if (appSymbol) {
			let appChildrens = await appSymbol.getChildren();
			let items: SymbolQuickPickItemFromTreeView[] = new Array;
			for (let i = 0; i < appChildrens.length; i++) {
				items.push(new SymbolQuickPickItemFromTreeView(
					appChildrens[i].symbol.name,
					appChildrens[i].symbol.defPath,
					appChildrens[i]));
			}
			let item = await vscode.window.showQuickPick(items, {
				placeHolder: 'Select the component to make action'
			});
			if (item && item.symbol) {
				return item.symbol;
			}
		}
	}

	/**
	 * Add App to the current system
	 */
	private async addExistingApplication(appsNode: DocumentSymbolTreeItem | undefined) {
		// When executing this command on Command Palette, create symbol as input paramenter
		if (!appsNode) {
			appsNode = await this.getAppsFromSystem();
		}

		if (appsNode) {
			// ADEF that are already referenced by the SDEF have to be ignored
			const adefsToIgnore = childrenNames(appsNode.symbol);
			await this.selectSymbolForAddAction('adef', adefsToIgnore);
		}
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

	/**
	 * Rename the current system
	 */
	private async renameSystem(sdef: DocumentSymbolTreeItem): Promise<void> {
		// When executing this command on Command Palette, create symbol as input paramenter
		if (!sdef) {
			if (this.symbols) {
				if (DocumentSymbol.is(this.symbols)) {
					sdef = new DocumentSymbolTreeItem(this.symbols, undefined);
				}
			}
		}

		if (sdef) {
			let newSystemName = await vscode.window.showInputBox({
				prompt: "Please enter a new name for your system",
				placeHolder: "newSystemName"
			});
			if (newSystemName) {
				return this.legatoManager.mkEdit.renameSystem(sdef.label, newSystemName);
			}
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
	private async renameApplication(app: DocumentSymbolTreeItem | undefined): Promise<void> {
		// When executing this command on Command Palette, create symbol as input paramenter
		if (!app) {
			app = await this.getAppFromSystem();
		}

		if (app) {
			let newApp = await vscode.window.showInputBox({
				prompt: "Please enter a new name for your application",
				placeHolder: "newApp"
			});
			if (newApp) {
				let appOldPath = vscode.Uri.parse(app.symbol.defPath).fsPath;
				let appOldDirPath = path.dirname(vscode.Uri.parse(app.symbol.defPath).fsPath);
				let appNewPath = path.join(appOldDirPath, newApp + ".adef");
				return this.legatoManager.mkEdit.renameApplication(appOldPath, appNewPath);
			}
		}
	}

	/**
	 * Remove App from the current system
	 */
	private async removeApplicationInSystem(apps: DocumentSymbolTreeItem | undefined) {
		// When executing this command on Command Palette, create symbol as input paramenter
		if (!apps) {
			apps = await this.getAppsFromSystem();
		}

		if (apps) {
			let appsChildrens = await apps.getChildren();
			let items: SymbolQuickPickItemFromTreeView[] = new Array;
			for (let i = 0; i < appsChildrens.length; i++) {
				items.push(new SymbolQuickPickItemFromTreeView(
					appsChildrens[i].symbol.name, appsChildrens[i].symbol.defPath));
			}
			await this.selectSymbolForRemoveAction('app', items);
		}
	}

	/**
	 * Delete App from the current system
	 */
	private async deleteApplicationInSystem(apps: DocumentSymbolTreeItem | undefined) {
		// When executing this command on Command Palette, create symbol as input paramenter
		if (!apps) {
			apps = await this.getAppsFromSystem();
		}

		if (apps) {
			let appsChildrens = await apps.getChildren();
			let items: SymbolQuickPickItemFromTreeView[] = new Array;
			for (let i = 0; i < appsChildrens.length; i++) {
				items.push(new SymbolQuickPickItemFromTreeView(
					appsChildrens[i].symbol.name, appsChildrens[i].symbol.defPath));
			}
			let item = await vscode.window.showQuickPick(items, {
				placeHolder: `Select the application you want to delete`
			});
			if (item) {
				let confirmed = ACTION_LABELS.OK === await vscode.window.showWarningMessage(
					`Do you really want to delete the "${item.label}" application?`,
					ACTION_LABELS.CANCEL,
					ACTION_LABELS.OK);
				if (confirmed) {
					let filePath = vscode.Uri.parse(item.detail).fsPath;
					return this.legatoManager.mkEdit.deleteApplication(filePath);
				}
			}
		}
	}

	/**
	 * Remove Component from the current system
	 */
	private async removeComponentInApp(applicationNode: DocumentSymbolTreeItem | undefined) {
		// When executing this command on Command Palette, create symbol as input paramenter
		if (!applicationNode) {
			applicationNode = await this.getAppFromSystem();
		}

		if (applicationNode) {
			let appsChildrens = await applicationNode.getChildren();
			let items: SymbolQuickPickItemFromTreeView[] = new Array;
			for (let i = 0; i < appsChildrens.length; i++) {
				// Add the component to the list of items
				if (appsChildrens[i].symbol.kind === SymbolKind.Class) {
					items.push(new SymbolQuickPickItemFromTreeView(
						appsChildrens[i].symbol.name, appsChildrens[i].symbol.defPath));
				}
			}
			await this.selectSymbolForRemoveAction('component', items);
		}
	}

	/**
	 * Delete Component from the current system
	 */
	private async deleteComponentInApp(applicationNode: DocumentSymbolTreeItem | undefined) {
		// When executing this command on Command Palette, create symbol as input paramenter
		if (!applicationNode) {
			applicationNode = await this.getAppFromSystem();
		}

		if (applicationNode) {
			let appsChildrens = await applicationNode.getChildren();
			let items: SymbolQuickPickItemFromTreeView[] = new Array;
			for (let i = 0; i < appsChildrens.length; i++) {
				items.push(new SymbolQuickPickItemFromTreeView(
					appsChildrens[i].symbol.name, appsChildrens[i].symbol.defPath));
			}
			let item = await vscode.window.showQuickPick(items, {
				placeHolder: `Select the component you want to delete`
			});
			if (item) {
				let confirmed = ACTION_LABELS.OK === await vscode.window.showWarningMessage(
					`Do you really want to delete the "${item.label}" component?`,
					ACTION_LABELS.CANCEL,
					ACTION_LABELS.OK);
				if (confirmed) {
					return this.legatoManager.mkEdit.deleteComponent(item.label);
				}
			}
		}
	}

	private async removeApplication(app: DocumentSymbolTreeItem) {
		if (app) {
			let confirmed = ACTION_LABELS.OK === await vscode.window.showWarningMessage(
				`Do you really want to remove the "${app.label}" application?`,
				ACTION_LABELS.CANCEL,
				ACTION_LABELS.OK);
			if (confirmed) {
				let filePath = vscode.Uri.parse(app.symbol.defPath).fsPath;
				return this.legatoManager.mkEdit.removeApplication(filePath);
			}
		}
	}

	/**
	 * Add Component to the current system
	 */
	private async addExistingComponent(
		applicationNode: DocumentSymbolTreeItem | undefined): Promise<void> {
		// When executing this command on Command Palette, create symbol as input paramenter
		if (!applicationNode) {
			applicationNode = await this.getAppFromSystem();
		}

		if (applicationNode) {
			let filePath = vscode.Uri.parse(applicationNode.symbol.defPath).fsPath;
			const cdefsToIgnore = childrenNames(applicationNode.symbol);
			await this.selectSymbolForAddAction('cdef', cdefsToIgnore, filePath);
		}
	}

	private async querySymbol(
		query: 'adef' | 'cdef' | 'api'): Promise<SymbolInformation[] | null> {

		let client = this.legatoLanguageManager.languageClient;
		if (client) {
			// Request all available ADEF or CDEF in order to add it to the current SDEF
			return client.sendRequest(WorkspaceSymbolRequest.type, { query: query });
		} else {
			throw new Error(`Cannot query ${query} symbols in workspace. Language server is not available.`);
		}
	}

	private async selectSymbolForAddAction(
		query: 'adef' | 'cdef',
		symbolsToIgnore: string[] = [],
		filePath?: string) {

		try {
			let symbols: SymbolInformation[] | null = await this.querySymbol(query);
			if (symbols) {
				let items = symbols.filter((symb: SymbolInformation) =>
					!symbolsToIgnore.includes(symb.name)).map((symbol: SymbolInformation) =>
						new SymbolQuickPickItem(symbol));

				// Create quick pick
				let box = vscode.window.createQuickPick<SymbolQuickPickItem>();

				// Verify if the item list is empty or not
				if (items.length > 0) {
					// One or more item in selection list
					box.placeholder =
						`Select the ${query === 'adef' ? 'application' :
						'component'} from the list below`;

				} else {
					// No items in selection list
					box.placeholder =
						`No available ${query === 'adef' ? 'application' :
						'component'}s found in included ${query === 'adef' ? 'app' :
						'component'}Search paths`;
				}

				box.items = items;
				box.title = query === 'adef' ? `Add App: ${items.length} app${items.length === 1 ?
					'' : 's'} available` : `Add Component: ${items.length}
						component${items.length === 1 ? '' : 's'} available`;

				box.onDidAccept(() => {
					let result = box.selectedItems.length > 0 ? box.selectedItems[0] : undefined;
					if (result) {
						if (result.symbol) {
							switch (query) {
								case "adef": {
									let filePath =
										vscode.Uri.parse(result.symbol.location.uri).fsPath;
									this.legatoManager.mkEdit.addExistingApplication(filePath);
									break;
								}
								case "cdef": {
									if (filePath) {
										let compPath = path.dirname(
											vscode.Uri.parse(result.symbol.location.uri).fsPath);
										this.legatoManager.mkEdit.addExistingComponent(filePath,
											compPath);
									}
									break;
								}
								default: {
									break;
								}
							}
						}
					}
					box.hide();
				});

				box.show();
			}
		} catch (error) {
			console.log(error);
			vscode.window.showErrorMessage(
				`Failed to query existing ${query} symbols ` +
				`in workspace from language server. ${error}`);
		}
	}

	private async selectSymbolForRemoveAction(
		query: 'app' | 'component',
		items: SymbolQuickPickItemFromTreeView[]) {

		try {
			// Create quick pick
			let box = vscode.window.createQuickPick<SymbolQuickPickItemFromTreeView>();

			// Verify if the item list is empty or not
			if (items.length > 0) {
				// One or more items in selection list
				box.placeholder =
					`Select the ${query === 'app' ? 'application' :
					'component'} from the list below`;

			} else {
				// No items in selection list
				box.placeholder =
					`No available ${query === 'app' ? 'application' :
					'component'}s to remove from ${query === 'app' ? 'system' : 'application'}`;
			}

			box.items = items;
			box.title = query === 'app' ? `Remove App: ${items.length} app${items.length === 1 ?
				'' : 's'} available` : `Remove Component: ${items.length}
					component${items.length === 1 ? '' : 's'} available`;

			box.onDidAccept(async () => {
				let item = box.selectedItems.length > 0 ? box.selectedItems[0] : undefined;
				if (item) {
					switch (query) {
						case "app": {
							let confirmed =
								ACTION_LABELS.OK === await vscode.window.showWarningMessage(
									`Do you really want to remove ` +
									`the "${item.label}" application?`,
									ACTION_LABELS.CANCEL,
									ACTION_LABELS.OK);

							// Verify if confirmed is true
							if (confirmed) {
								let filePath = vscode.Uri.parse(item.detail).fsPath;
								return this.legatoManager.mkEdit.removeApplication(filePath);
							}
							break;
						}
						case "component": {
							let confirmed =
								ACTION_LABELS.OK === await vscode.window.showWarningMessage(
									`Do you really want to remove ` +
									`the "${item.label}" component?`,
									ACTION_LABELS.CANCEL,
									ACTION_LABELS.OK);

							// Verify if confirmed is true
							if (confirmed) {
								// The path of the component
								let compPath = path.dirname(vscode.Uri.parse(item.detail).fsPath);
								return this.legatoManager.mkEdit.removeComponent(compPath);
							}
							break;
						}
						default: {
							break;
						}
					}
				}
				box.hide();
			});

			box.show();
		} catch (error) {
			console.log(error);
			vscode.window.showErrorMessage(
				`Failed to query existing ${query} symbols ` +
				`in workspace from language server. ${error}`);
		}
	}

	/**
	 * Create a new component in the current system
	 */
	private async newComponent(
		applicationNode: DocumentSymbolTreeItem | undefined): Promise<void> {
		// When executing this command on Command Palette, create symbol as input paramenter
		if (!applicationNode) {
			applicationNode = await this.getAppFromSystem();
		}

		if (applicationNode) {
			let compName = await vscode.window.showInputBox({
				prompt: "Please enter a name for your new component",
				placeHolder: "newComponent"
			});
			let filePath = vscode.Uri.parse(applicationNode.symbol.defPath).fsPath;
			if (compName) {
				return this.legatoManager.mkEdit.newComponent(filePath, compName);
			}
		}
	}

	/**
	 * Rename Component in the current system
	 */
	private async renameComponent(cdef: DocumentSymbolTreeItem | undefined): Promise<void> {
		if (!cdef) {
			cdef = await this.getComponentFromSystem();
		}

		if (cdef) {
			let compName = await vscode.window.showInputBox({
				prompt: "Please enter a new name for your component",
				placeHolder: "newComponent"
			});
			if (compName) {
				let compOldPath = path.dirname(vscode.Uri.parse(cdef.symbol.defPath).fsPath);
				let compNewPath = path.join(path.dirname(compOldPath), compName);
				return this.legatoManager.mkEdit.renameComponent(compOldPath, compNewPath);
			}
		}
	}

	private async removeComponent(cdef: DocumentSymbolTreeItem) {
		if (cdef) {
			let confirmed = ACTION_LABELS.OK === await vscode.window.showWarningMessage(
				`Do you really want to remove the "${cdef.label}" component?`,
				ACTION_LABELS.CANCEL,
				ACTION_LABELS.OK);
			if (confirmed) {
				return this.legatoManager.mkEdit.removeComponent(cdef.label);
			}
		}
	}

	private async generateApiStubFile() {
		try {
			let apiSymbols: SymbolInformation[] | null = await this.querySymbol('api');
			if (apiSymbols) {
				let apiItems = apiSymbols.map(symb => new SymbolQuickPickItem(symb));
				let apiItem = await vscode.window.showQuickPick(apiItems, {
					placeHolder: 'Select the api file to generate code'
				});
				if (apiItem && apiItem.detail) {
					let dialogPath: string | undefined;
					dialogPath = getWorkspaceFolderPath("components");
					if (!await pathExists(dialogPath)) {
						dialogPath = getWorkspaceFolder().uri.fsPath;
					}
					let componentItem = await vscode.window.showOpenDialog({
						defaultUri: dialogPath ? vscode.Uri.parse(dialogPath) : undefined,
						canSelectFiles: false,
						canSelectFolders: true,
						canSelectMany: false,
						openLabel: "Select folder"
					});

					if (componentItem) {
						let apiPath = vscode.Uri.parse(apiItem.detail).fsPath;
						let filePath = componentItem[0].fsPath;
						return this.legatoManager.mkEdit.genApiStubFile(apiPath, filePath);
					}
				}
			}
		} catch (error) {
			console.log(error);
			vscode.window.showErrorMessage('Failed to query existing api symbols in workspace' +
				`from language server. ${error}`);
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
	LanguageServerReady = "lsp-ready",
	Sdef = "sdef",
	Mdef = "mdef",
	AppsSection = "apps",
	Adef = "adef",
	ComponentsSection = "components",
	Cdef = "cdef",
	Api = "api",
	Function = "function"
}


export class LegatoContext<T extends LegatoType> extends NamespaceContext {
	public static LanguageServerReady: NamespaceContext = new LegatoContext(LegatoType.LanguageServerReady);

	public constructor(readonly prefixContext: T) {
		//context-legato-*
		super('legato', [prefixContext]);
	}

	public setAppToAddAvailable(addExisting: boolean) {
		if (addExisting) {
			this.values.push('add-existing');
		}
	}

	public setNewApp(newApp: boolean) {
		if (newApp) {
			this.values.push('new');
		}
	}
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

function toContext(symbolKind: SymbolKind): NamespaceContext {
	let legatoType = symbolsKindToLegato.get(symbolKind);
	let matchingContext = legatoType !== undefined ? new LegatoContext<LegatoType>(legatoType) : undefined;
	return matchingContext ? matchingContext : LegatoContext.LanguageServerReady;
}

function childrenNames(symbol: DocumentSymbol): string[] {
	let apps = [];
	if (symbol) {
		let { children } = symbol;
		apps = children ? children.map((obj: any) => {
			let { name } = obj; return name;
		}) : [];
	}
	return apps;
}

function toIcon(symbolKind: SymbolKind): string | undefined {
	const legatoType = symbolsKindToLegato.get(symbolKind);
	return legatoType ? legatoTypesToIcon.get(legatoType) : undefined;
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
		super(processId(parent, symbol.name), parent, undefined, symbol.name, "", "",
			(<any>symbol).defaultCollapsed ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.Expanded,
			toContext(symbol.kind),
			toIcon(symbol.kind));
		this.symbol = symbol;

		this.setInitialState(symbol);
	}

	private async setInitialState(symbol: DefinitionObject) {
		this.command = await showInFileCommand((this.symbol.defPath), symbol.range);
	}

	public async getChildren(): Promise<DocumentSymbolTreeItem[]> {
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

class SymbolQuickPickItem implements vscode.QuickPickItem {
	label: string;
	description?: string | undefined;
	detail?: string | undefined;

	constructor(public readonly symbol: SymbolInformation) {
		this.label = symbol.name;
		this.detail = symbol.location.uri.toString();
		this.description = symbol.containerName;
	}
}

class SymbolQuickPickItemFromTreeView implements vscode.QuickPickItem {
	label: string;
	description?: string | undefined;
	detail: string;
	symbol?: DocumentSymbolTreeItem;

	constructor(name: string, defPath: string, symbol?: DocumentSymbolTreeItem) {
		this.label = name;
		this.detail = defPath;
		this.description = "";
		if (symbol) {
			this.symbol = symbol;
		}
	}
}