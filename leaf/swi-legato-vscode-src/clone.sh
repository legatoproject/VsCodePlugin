#!/bin/sh
set -e

# Generic clone utils path
cloneToolPath="$1"
version="$2"

# Check source mode to determine manifest path
if test "$LEGATO_VSCODE_SRC" = "tag"; then
    manifestPath="tools/vscode-plugin/tags/${version}.xml"
elif test "$LEGATO_VSCODE_SRC" = "master"; then
    manifestPath="tools/vscode-plugin/branches/master.xml"
else
    # Not in source mode, simply exit
    exit 0
fi

# Delegate to generic clone tool
exec "$cloneToolPath" -s legato-vscode -h gerrit-legato -m "$manifestPath"
