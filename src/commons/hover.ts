'use strict';

import * as vscode from 'vscode';
import * as adefJson from './../snippets/adef.json';
import * as apiJson from './../snippets/api.json';
import * as cdefJson from './../snippets/cdef.json';
import * as mdefJson from './../snippets/mdef.json';
import * as sdefJson from './../snippets/sdef.json';
import * as cJson from './../snippets/c.json';

/**
 * Manage the Legato hover provider
 */
export class LegatoHoverProvider {
    public constructor(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.languages.registerHoverProvider({ language: "adef" }, new AdefHoverProvider()));
        context.subscriptions.push(
            vscode.languages.registerHoverProvider({ language: "api" }, new ApiHoverProvider()));
        context.subscriptions.push(
            vscode.languages.registerHoverProvider({ language: "cdef" }, new CdefHoverProvider()));
        context.subscriptions.push(
            vscode.languages.registerHoverProvider({ language: "mdef" }, new MdefHoverProvider()));
        context.subscriptions.push(
            vscode.languages.registerHoverProvider({ language: "sdef" }, new SdefHoverProvider()));

        if (cJson) {
            // The hover text is not supported for .c file in current. Just import c.json file to
            // the outDir folder as the other snippets .json files
        }
    }
}

/**
 * Proceed the hover provider and return the hover text
 */
function implementHover(document: vscode.TextDocument, position: vscode.Position,
                        jsonObject: Object) {
    let mappedWord: string | undefined;
    let reLineComment = /(\/\/)+?.*$/gm;
    let checkLineComment = document.getWordRangeAtPosition(position, reLineComment);

    if (!checkLineComment) {
        const hoveredWord = document.getText(document.getWordRangeAtPosition(position));

        Object.entries(jsonObject).forEach(([objectKey, objectValue]) => {
            Object.entries(objectValue).forEach(([elementKey, elementValue]) => {
                if (elementValue === hoveredWord) {
                    mappedWord = objectValue.description;
                }
            });
        });

        if (mappedWord) {
            return new vscode.Hover([`**${hoveredWord}**`, mappedWord]);
        } else {
            return null;
        }
    } else {
        return null;
    }
}

/**
 * Implement the hover provider for .adef file
 */
class AdefHoverProvider implements vscode.HoverProvider {
    public provideHover(document: vscode.TextDocument, position: vscode.Position,
                        token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        return implementHover(document, position, adefJson);
    }
}

/**
 * Implement the hover provider for .api file
 */
class ApiHoverProvider implements vscode.HoverProvider {
    public provideHover(document: vscode.TextDocument, position: vscode.Position,
                        token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        return implementHover(document, position, apiJson);
    }
}

/**
 * Implement the hover provider for .cdef file
 */
class CdefHoverProvider implements vscode.HoverProvider {
    public provideHover(document: vscode.TextDocument, position: vscode.Position,
                        token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        return implementHover(document, position, cdefJson);
    }
}

/**
 * Implement the hover provider for .mdef file
 */
class MdefHoverProvider implements vscode.HoverProvider {
    public provideHover(document: vscode.TextDocument, position: vscode.Position,
                        token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        return implementHover(document, position, mdefJson);
    }
}

/**
 * Implement the hover provider for .sdef file
 */
class SdefHoverProvider implements vscode.HoverProvider {
    public provideHover(document: vscode.TextDocument, position: vscode.Position,
                        token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        return implementHover(document, position, sdefJson);
    }
}