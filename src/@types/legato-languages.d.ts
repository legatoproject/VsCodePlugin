import { DocumentSymbol, SymbolKind } from 'vscode-languageclient';

/**
 * This interface should correspond to the class implemented into the Legato language server in order to leverage typing in the plugin.
 */
export interface DefinitionObject extends DocumentSymbol {
    kind: SymbolKind;
    defPath: string;
    defaultCollapsed?: boolean;
}