'use strict';

export const extensionQualifiedId = 'SWIR.legato-plugin';

// This module centralize all ids used in package.json
export const enum Command { // (cmd)
    // #### LEAF (.leaf) ####
    // TERMINAL (.trm)
    LeafTerminalOpenLeaf = "cmd.leaf.trm.openleaf",
    // PROFILES (.prf)
    LeafProfileSwitch = "cmd.leaf.prf.switch",
    LeafProfileRemove = "cmd.leaf.prf.remove",
    LeafProfilePackageRemove = "cmd.leaf.prf.pkgremove",
    // PACKAGES (.pkg)
    LeafPackagesAddFilter = "cmd.leaf.pkg.filter.add",
    LeafPackagesRemoveFilter = "cmd.leaf.pkg.filter.remove",
    LeafPackagesToggleFilter = "_cmd.leaf.pkg.filter.toggle", // internal
    LeafPackagesFetch = "cmd.leaf.pkg.fetch",
    LeafPackagesAddToProfile = "cmd.leaf.pkg.addtoprofile",
    // REMOTES (.rmt)
    LeafRemotesAdd = "cmd.leaf.rmt.add",
    LeafRemotesRemove = "cmd.leaf.rmt.remove",
    LeafRemotesEnable = "cmd.leaf.rmt.enable",
    LeafRemotesDisable = "cmd.leaf.rmt.disable",

    // #### LEGATO (.legato) ####
    // COMMON (.common)
    LegatoCommonShowWelcomePage = "cmd.legato.common.showwelcomepage",
    // BUILD (.build)
    LegatoBuildPickDefFile = "cmd.legato.build.pickDefFile",
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

export const enum Context { // (context)
    // #### LEAF (-leaf) ####
    // PACKAGES (-pkg)
    LeafPackagesContainer = "context-leaf-pkg-container",
    LeafPackagesFilterContainer = "context-leaf-pkg-filters-container",
    LeafPackagesBuiltinFilter = "context-leaf-pkg-filters-builtin",
    LeafPackagesUserFilter = "context-leaf-pkg-filter-user",
    LeafPackageInstalled = "context-leaf-pkg-installed",
    LeafPackageAvailable = "context-leaf-pkg-available",
    // REMOTES (-rmt)
    LeafRemoteEnabled = "context-leaf-rmt-enabled",
    LeafRemoteDisabled = "context-leaf-rmt-disabled",
    // PROFILES (-prf)
    LeafProfileCurrent = "context-leaf-prf-current",
    LeafProfileOther = "context-leaf-prf-other"
}

export const enum View { // (view)
    // #### LEAF (-leaf) ####
    LeafPackages = "view-leaf-pkg",
    LeafRemotes = "view-leaf-rmt",
    LeafProfiles = "view-leaf-prf"
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
    LegatoInstall = "Legato Install",
    LegatoTm = "Legato TM",

    // #### LEAF ####
    Tests = "Unit tests task"
}
