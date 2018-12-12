'use strict';

// This module centralize all ids used in package.json
export const LEAF_IDS = { // leaf
    COMMANDS: { // -cmd
        TERMINAL: { // -trm
            OPENLEAF: "leaf.cmd.trm.openleaf"
        },
        PROFILE: { // -prf
            SWITCH: "leaf.cmd.prf.switch"
        },
        PACKAGES: { // -pkg
            ADD_FILTER: "_leaf.cmd.pkg.filter.add", // internal
            REMOVE_FILTER: "_leaf.cmd.pkg.filter.remove", // internal
            TOGGLE_FILTER: "_leaf.cmd.pkg.filter.toggle", // internal
            FETCH: "leaf.cmd.pkg.fetch",
            ADD_TO_PROFILE: "leaf.cmd.pkg.addtoprofile"
        },
        REMOTES: { // -rmt
            ADD: "leaf.cmd.rmt.add",
            REMOVE: "leaf.cmd.rmt.remove",
            ENABLE: "leaf.cmd.rmt.enable",
            DISABLE: "leaf.cmd.rmt.disable"
        }

    },
    VIEWS_CONTAINERS: { // -vc
        LEAF: "leaf-vc"
    },
    VIEWS: { // -v
        PACKAGES: "leaf-v-pkg",
        REMOTES: "leaf-v-rmt"
    },
    VIEW_ITEMS: { // -vi
        PACKAGES: { // -pkg
            PACKAGE_CONTAINER: "leaf-vi-pkg-pkg-container",
            FILTER_CONTAINER: "leaf-vi-pkg-filters-container",
            PERMANENT_FILTER: "leaf-vi-pkg-filters-permanent",
            FILTER: "leaf-vi-pkg-filter-element",
            INSTALLED: "leaf-vi-pkg-installed",
            AVAILABLE: "leaf-vi-pkg-available"
        },
        REMOTES: { // -rmt
            ENABLED: "leaf-vi-rmt-enabled",
            DISABLE: "leaf-vi-rmt-disabled"
        }
    },
    TASK_DEFINITION: {
        LEAF: "Leaf"
    }
};

export const LEGATO_IDS = { // legato
    COMMANDS: { // -cmd
        BUILD: {
            PICK_DEF_FILE: "legato.cmd.build.pickDefFile"
        },
        TM: { // -tm
            SHOW_TERMINAL: "legato.cmd.tm.openShell",
            SET_DEVICE_IP: "legato.cmd.tm.newIP"
        }
    },
    TASK_DEFINITION: {
        LEGATO_BUILD: "Legato Build",
        LEGATO_INSTALL: "Legato Install"
    }
};
