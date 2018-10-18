# Legato for VS Code

This extension enables integration for Legato application framework development in VS Code.

## Features

### Leaf integration

This extension integrates the `leaf` command-line package/workspace management tool,
 and provides the following features:

- leaf tool and workspace detection
- open leaf shell terminal (`Leaf: Open shell` command)
- leaf profile status bar
- leaf profile change detection
- `Leaf: Switch to Another Profile` command (or click on the status bar) to select another profile

## Requirements

This extension requires the `leaf` tool to be installed.

> To get `leaf` tool installed, just execute the following commands:
> - `wget https://downloads.sierrawireless.com/tools/leaf/leaf_latest.deb -O /tmp/leaf_latest.deb`
> - `sudo apt install /tmp/leaf_latest.deb`

## Limitations

This extension only works on Linux hosts.
