'use strict';

import * as vscode from 'vscode';
import { LEAF_FILES } from '../../commons/files';

/**
 * Folder to exclude when looking for def or update files
 */
const EXCLUDED_FOLDER = `**/${LEAF_FILES.DATA_FOLDER}/*`;

/**
 * Xdef files extensions
 */
export const enum LegatoFileExtension {
  cdef = ".cdef",
  adef = ".adef",
  sdef = ".sdef"
}

/**
 * Patterns for Legato files
 */
export const LEGATO_FILES_PATTERNS = {
  DEFINITIONS_FILES: "**/*.[as]def",
  UPDATE_FILES: "**/*.update",
  IMAGE_FILES: "**/*.{cwe,spk}",
  CURRENT_IMAGES_FILES: `${LEAF_FILES.DATA_FOLDER}/current/**/*.{cwe,spk}`
};

/**
 * Lists .adef and .sdef files in project
 */
export function listDefinitionFiles(): Thenable<vscode.Uri[]> {
  return vscode.workspace.findFiles(LEGATO_FILES_PATTERNS.DEFINITIONS_FILES, EXCLUDED_FOLDER);
}

/**
* Lists .update files in project
*/
export function listUpdateFiles(): Thenable<vscode.Uri[]> {
  return vscode.workspace.findFiles(LEGATO_FILES_PATTERNS.UPDATE_FILES, EXCLUDED_FOLDER);
}

/**
* Lists image (.cwe and .spk) files  in project
*/
export async function listImageFiles(): Promise<vscode.Uri[]> {
  const uris = await vscode.workspace.findFiles(LEGATO_FILES_PATTERNS.IMAGE_FILES, LEAF_FILES.DATA_FOLDER);
  const leafdataUris = await vscode.workspace.findFiles(LEGATO_FILES_PATTERNS.CURRENT_IMAGES_FILES);
  return uris.concat(leafdataUris);
}
