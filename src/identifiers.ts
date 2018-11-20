'use strict';

export const IDS = { // leaf
    COMMANDS: { // -cmd
        TERMINAL: { // -trm
            OPENLEAF: "leaf-cmd-trm-openleaf"
        },
        PROFILE: { // -prf
            SWITCH: "leaf-cmd-prf-switch"
        },
        PACKAGES: { // -pkg
            REFRESH: "leaf-cmd-pkg-refresh",
            ADD_TO_PROFILE: "leaf-cmd-pkg-addtoprofile"
        },
        REMOTES: { // -rmt
            REFRESH: "leaf-cmd-rmt-refresh",
            ADD: "leaf-cmd-rmt-add",
            REMOVE: "leaf-cmd-rmt-remove",
            ENABLE: "leaf-cmd-rmt-enable",
            DISABLE: "leaf-cmd-rmt-disable"
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
            INSTALLED: "leaf-vi-pkg-installed",
            AVAILABLE: "leaf-vi-pkg-available"
        },
        REMOTES: { // -rmt
            ENABLED: "leaf-vi-rmt-enabled",
            DISABLE: "leaf-vi-rmt-disabled"
        }
    },
    TASK_DEFINITION: {
        LEAF: "Leaf",
        LEGATO: "Legato"
    }
};

