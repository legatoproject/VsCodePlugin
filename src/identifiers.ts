'use strict';

// This module centralize all ids used in package.json
export const enum Commands { // (cmd)
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
    // BUILD (.build)
    LegatoBuildPickDefFile = "cmd.legato.build.pickDefFile",
    // TM (.tm)
    LegatoTmCommandPalette = "_cmd.legato.tm.availablecommands", // internal
    LegatoTmShell = "cmd.legato.tm.shell",
    LegatoTmSetIp = "cmd.legato.tm.set.ip",
    LegatoTmLogs = "cmd.legato.tm.logs",
    LegatoTmInstallOn = "cmd.legato.tm.install.on"
}

export const enum Contexts { // (context)
    // #### LEAF (-leaf) ####
    // PACKAGES (-pkg)
    LeafPackagesContainer = "context-leaf-pkg-container",
    LeafPackagesFilterContainer = "context-leaf-pkg-filters-container",
    LeafPackagesPermanentFilter = "context-leaf-pkg-filters-permanent",
    LeafPackagesFilter = "context-leaf-pkg-filter-element",
    LeafPackageInstalled = "context-leaf-pkg-installed",
    LeafPackageAvailable = "context-leaf-pkg-available",
    // REMOTES (-rmt)
    LeafRemoteEnabled = "context-leaf-rmt-enabled",
    LeafRemoteDisabled = "context-leaf-rmt-disabled",
    // PROFILES (-prf)
    LeafProfileCurrent = "context-leaf-prf-current",
    LeafProfileOther = "context-leaf-prf-other"
}

export const enum Views { // (view)
    // #### LEAF (-leaf) ####
    LeafPackages = "view-leaf-pkg",
    LeafRemotes = "view-leaf-rmt",
    LeafProfiles = "view-leaf-prf"
}

export const enum ViewsContainers { // (viewcontainer)
    // #### LEAF #### (-leaf)
    Leaf = "viewcontainer-leaf"
}

export const enum TaskDefinitions { //
    // #### LEAF ####
    Leaf = "Leaf",

    // #### LEGATO ####
    LegatoBuild = "Legato Build",
    LegatoInstall = "Legato Install"
}
