import * as vscode from "vscode";
import * as path from "path";
import { isNumber } from "util";
import { TreeItemCollapsibleState, ThemeIcon } from "vscode";

enum NodeKind {
  API,
  App,
  Component,
  System,
  Category,
  SourceFile
}

class TreeNode {
  kind: NodeKind;
  label: string;
  children: TreeNode[];
  file?: string;
}

export class SystemViewProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | null> = new vscode.EventEmitter<TreeNode | null>();
  readonly onDidChangeTreeData: vscode.Event<TreeNode | null> = this
    ._onDidChangeTreeData.event;

  private tree: TreeNode;
  private sdefPath: string;

  private parseAPI(data: any): TreeNode {
    let tree: TreeNode = {
      label: data.name,
      kind: NodeKind.API,
      children: [],
      file: data.file
    };
    return tree;
  }

  // Represents a single source file
  // {file: "/path/file.c"}
  private parseSourceFile(data: any): TreeNode {
    let tree: TreeNode = {
      label: data.file.split("/").pop(),
      kind: NodeKind.SourceFile,
      children: [],
      file: data.file
    };
    return tree;
  }
  // Represents a bunch of source files grouped by language
  // sources: { "c": [{file:"/path/file.c"}, ... ], "python": [{file: "/path/file.py"}, ... ] }
  private parseSources(data: any) {
    let results: TreeNode[] = [];
    let sourcesRoot: object = data["sources"];
    for (const sourcesLang of Object.keys(sourcesRoot)) {
      const sourceFiles: object[] = (sourcesRoot as any)[sourcesLang];
      sourceFiles.forEach(sourceFile => {
        results.push(this.parseSourceFile(sourceFile));
      });
    }
    return results;
  }
  // Parses a child of the data, which is an array that may or may not exist.
  // Every element of the array is run through the parseFunc that should return a TreeNode.
  // Then all the TreeNodes are combined under a single Category node and returned.
  // It also places items in their own subcategory if they have an "sdef" property and it's not 
  // equal to the current sdef. This is for grouping #included apps into their own subcategories.
  private parseCategory(data: any, key: string, parseFunc: (data:any) => TreeNode): TreeNode {
    if (data[key] === undefined) {
      return undefined;
    }
    let children = data[key] || [];
    let childNodes: TreeNode[] = [];

    let externalSdefCategories: { [index: string]: TreeNode } = {};

    children.forEach((element: any) => {
      // if sdef is defined and it's not the current sdef file
      // we should put it in a separate category
      if ("sdef" in element && element.sdef !== this.sdefPath) {
        let sdefName = element.sdef.split("/").pop();
        let catNode: TreeNode = externalSdefCategories[sdefName] || {
          kind: NodeKind.Category,
          children: [],
          label: sdefName,
          file: element.sdef
        };
        catNode.children.push(parseFunc(element));
        externalSdefCategories[sdefName] = catNode;
      } else {
        // otherwise it's local so just push it
        childNodes.push(parseFunc(element));
      }
    });
    // now push all the external categories at the end
    if (externalSdefCategories) {
      childNodes.push(
        ...Object.keys(externalSdefCategories).map(
          x => externalSdefCategories[x]
        )
      );
    }

    return {
      label: key,
      kind: NodeKind.Category,
      children: childNodes
    };
  }

  //  Parses a component entry
  // {sources: {...}, provides: [...], requires: [...], name: "...", file: "..."}
  private parseComponent(data: any): TreeNode {
    let children: TreeNode[] = [];
    children.push({
      label: "sources",
      kind: NodeKind.Category,
      children: this.parseSources(data)
    });
    children.push(
      this.parseCategory(data, "provides", this.parseAPI.bind(this))
    );
    children.push(
      this.parseCategory(data, "requires", this.parseAPI.bind(this))
    );
    children = children.filter(x => !!x);
    let tree: TreeNode = {
      label: data.name,
      kind: NodeKind.Component,
      file: data.file,
      children
    };
    return tree;
  }
  private parseApp(data: any): TreeNode {
    let children: TreeNode[] = [];
    children.push(
      this.parseCategory(data, "components", this.parseComponent.bind(this))
    );
    children = children.filter(x => !!x);
    let tree: TreeNode = {
      label: data.name,
      file: data.file,
      kind: NodeKind.App,
      children
    };
    return tree;
  }
  private parseSystem(data: any): TreeNode {
    let children: TreeNode[] = [];
    children.push(this.parseCategory(data, "apps", this.parseApp.bind(this)));
    children = children.filter(x => !!x);
    let tree: TreeNode = {
      label: data.name,
      kind: NodeKind.System,
      file: data.file,
      children
    };
    return tree;
  }

  public update(data: object) {
    this.sdefPath = (<any>data)["file"];
    this.tree = this.parseSystem(data);
    this.refresh();
  }

  public refresh(): any {
    this._onDidChangeTreeData.fire();
  }

  constructor(private context: vscode.ExtensionContext) {
    vscode.commands.registerCommand("legato.systemView.openFile", resource =>
      vscode.window.showTextDocument(vscode.Uri.parse("file://" + resource))
    );
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return {
      label: element.label,
      collapsibleState: element.children.length
        ? TreeItemCollapsibleState.Collapsed
        : TreeItemCollapsibleState.None,
      iconPath: this.getIcon(element),
      tooltip: element.file, //`${NodeKind[element.kind]} ${element.label}`,
      resourceUri: this.getResourceUri(element),
      contextValue: NodeKind[element.kind].toLowerCase(),
      command: element.file
        ? {
            title: "Open",
            command: "legato.systemView.openFile",
            arguments: [element.file]
          }
        : undefined
    };
  }
  getCommand(element: TreeNode): vscode.Command {
    if (element.kind === NodeKind.API) {
    }
    if (element.kind === NodeKind.Component) {
    }
    if (element.kind === NodeKind.App) {
    }
    if (element.kind === NodeKind.System) {
      return {
        command: "legato.treeView.createApp",
        title: "New app",
        arguments: [element.file]
      };
    }
    return undefined;
  }
  getResourceUri(element: TreeNode): vscode.Uri {
    if (element.kind === NodeKind.API) {
      return vscode.Uri.parse("file://api.less");
    }
    if (element.kind === NodeKind.Component) {
      return vscode.Uri.parse("file://app.cfg");
    }
    if (element.kind === NodeKind.App) {
      return vscode.Uri.parse("file://component.sh");
    }
    if (element.kind === NodeKind.System) {
      return vscode.Uri.parse("file://sys.txt");
    }
    if (element.kind === NodeKind.SourceFile) {
      return vscode.Uri.parse("file://" + element.file);
    }
    return undefined;
  }
  getIcon(element: TreeNode): vscode.ThemeIcon {
    if (element.kind === NodeKind.Category) {
      return ThemeIcon.Folder;
    } else {
      return ThemeIcon.File;
    }
  }
  getChildren(element?: TreeNode): TreeNode[] {
    if (element) {
      return element.children;
    }
    return [this.tree];
  }
}
