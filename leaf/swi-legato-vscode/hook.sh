#!/bin/sh
set -e

# Just ignore if we're in source mode (may be the case if we're in a sync hook in a workspace)
if test -n "$LEGATO_VSCODE_SRC"; then
    echo "Skipping extension install in source mode"
    exit 0
fi

# Get parameters
action="$1"
vsixPath="$2"

# Check vscode
codePath="$(which code || true)"
if test -z "$codePath"; then
    codePath="$(which vscodium || true)"
    if test -z "$codePath"; then
        echo "Looks like Visual Studio Code is not installed on the system."
        echo "    See https://code.visualstudio.com/ to install it from Microsoft"
        echo "    or https://github.com/VSCodium/vscodium to install it from VSCodium project"
        exit 1
    fi
fi

# Check .vsix file path
if test ! -f "$vsixPath"; then
    echo "Expected path not found: $vsixPath"
    exit 2
fi

# Check action
if test "$action" = "install"; then
    # Just trigger install
    exec "$codePath" --install-extension "$vsixPath" --force
elif test "$action" = "uninstall"; then
    # Just trigger uninstall

    # Look for installed version
    installedExt="$("$codePath" --list-extensions --show-versions | grep legato.legato-plugin || true)"
    if test -n "$installedExt" -a "${installedExt#*@}" = "$(basename -s .vsix "$vsixPath" | sed -e "s/legato-plugin-//")"; then
        # Trigger uninstall only if there is an exact match with current package
        "$codePath" --uninstall-extension "$vsixPath"
    fi
else
    echo "Unknown action: $action"
    exit 3
fi
