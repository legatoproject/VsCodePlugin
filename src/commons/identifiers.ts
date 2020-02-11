'use strict';

export const extensionQualifiedId = 'legato.legato-plugin';

// This module centralize all ids used in package.json
export const enum Command { // (cmd)
    // native vscode commands related to the 'when' keyword used in package.json
    VscodeSetContext = "setContext",
    // #### LEAF (.leaf) ####
    // TERMINAL (.trm)
    LeafTerminalOpenLeaf = "cmd.leaf.trm.openleaf",
    // PROFILES (.prf)
    LeafProfileAdd = "cmd.leaf.prf.add",
    LeafProfileSwitch = "cmd.leaf.prf.switch",
    LeafProfileRemove = "cmd.leaf.prf.remove",
    LeafProfilePackageRemove = "cmd.leaf.prf.pkgremove",
    LeafProfilePackageUpgrade = "cmd.leaf.prf.pkgupgrade",

    // PACKAGES (.pkg)
    LeafPackagesAddFilter = "cmd.leaf.pkg.filter.add",
    LeafPackagesRemoveFilter = "cmd.leaf.pkg.filter.remove",
    LeafPackagesToggleFilter = "_cmd.leaf.pkg.filter.toggle", // internal
    LeafPackagesFetch = "cmd.leaf.pkg.fetch",
    LeafPackagesAddToProfile = "cmd.leaf.pkg.addtoprofile",
    LeafPackagesGoToDocumentation = "cmd.leaf.pkg.gotodoc",
    // REMOTES (.rmt)
    LeafRemotesAdd = "cmd.leaf.rmt.add",
    LeafRemotesRemove = "cmd.leaf.rmt.remove",
    LeafRemotesEnable = "cmd.leaf.rmt.enable",
    LeafRemotesDisable = "cmd.leaf.rmt.disable",
    //SYSTEM
    LegatoSystemCreate = "cmd.legato.system.create",
    LegatoSystemOpenFile = "cmd.legato.system.openFile",
    LegatoSystemCreateApplication = "cmd.legato.system.createApp",
    LegatoSystemAddApplication = "cmd.legato.system.addApp",
    LegatoSystemDeleteApplication = "cmd.legato.system.deleteApp",
    LegatoSystemRemoveApplication = "cmd.legato.system.removeApp",
    LegatoSystemRename = "cmd.legato.system.rename",
    LegatoAppRename = "cmd.legato.app.rename",
    LegatoAppRemove = "cmd.legato.app.remove",
    LegatoAppAddComponent = "cmd.legato.app.addComponent",
    LegatoAppNewComponent = "cmd.legato.app.newComponent",
    LegatoAppRemoveComponent = "cmd.legato.app.removeComponent",
    LegatoAppDeleteComponent = "cmd.legato.app.deleteComponent",
    LegatoComponentRename = "cmd.legato.component.rename",
    LegatoComponentRemove = "cmd.legato.component.remove",
    // #### LEGATO (.legato) ####
    // COMMON (.common)
    LegatoCommonShowWelcomePage = "cmd.legato.common.showwelcomepage",
    // BUILD (.build)
    LegatoBuildPickDefFile = "cmd.legato.build.pickDefFile",
    LegatoBuildCommand = "legato.build",
    // TM (.tm)
    LegatoTmCommandPalette = "_cmd.legato.tm.availablecommands", // internal
    LegatoTmShell = "cmd.legato.tm.shell",
    LegatoTmSetIp = "cmd.legato.tm.set.ip",
    LegatoTmLogs = "cmd.legato.tm.logs",
    LegatoTmInstallOn = "cmd.legato.tm.install.on",
    LegatoTmDeviceFlashImage = "cmd.legato.tm.flash",
    LegatoTmFlashImageRecovery = "cmd.legato.tm.flash.recovery",
    LegatoTmResetUserPartition = "cmd.legato.tm.reset.partition.user"
}

/**
 * @deprecated
 * Legato context to be migrated to NamespacedContext
 */
export const enum Context { // (context)
    // #### LEGATO (-legato) ####
    LegatoSystemEnabled = "context-legato-system-enabled",
    LegatoSystemSelected = "context-legato-system-selected",
    LegatoMdefSelected = "context-legato-mdef-selected",
    LegatoAppsSelected = "context-legato-apps-selected",
    LegatoAppCurrent = "context-legato-app-current",
    LegatoComponentsSelected = "context-legato-components-selected",
    LegatoComponentCurrent = "context-legato-component-current"
}

export const enum View { // (view)
    // #### LEAF (-leaf) ####
    LeafPackages = "view-leaf-pkg",
    LeafRemotes = "view-leaf-rmt",
    LeafProfiles = "view-leaf-prf",
    LegatoSystem = "view-legato-system"
}

export const enum ViewsContainer { // (viewcontainer)
    // #### LEAF #### (-leaf)
    Leaf = "viewcontainer-leaf"
}

export const enum TaskDefinitionType { //
    // #### LEAF ####
    Leaf = "Leaf",

    // #### LEGATO ####
    LegatoBuild = "Legato Build",
    LegatoSysToImage = "Legato Generate image",
    LegatoClean = "Legato Clean",
    LegatoInstall = "Legato Install",
    LegatoTm = "Legato TM",

    // #### LEAF ####
    Tests = "Unit tests task"
}
