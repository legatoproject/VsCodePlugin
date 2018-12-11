# Legato for VS Code

This extension enables integration for Legato application framework development in VS Code.

## Features

### Leaf integration

This extension integrates the `leaf` command-line package/workspace management tool,
 and provides the following features:

#### Packages and Remotes

- **Leaf/Packages** view, listing available and installed packages
  - `Refresh view` command to refresh packages list
  - `Add to profile...` command to configure selected package in existing/new profile
- **Leaf/Remotes** view, listing configured leaf remotes
  - `Refresh view` command to refresh remotes list
  - `Add`/`Remove` commands to manage list of known remotes
  - `Enable`/`Disable` commands to configure remote status

#### Profiles

- open leaf shell terminal (`Leaf: Open shell` command)
- leaf profile status bar
- leaf workspace/profile/environment change detection
- `Leaf: Switch to Another Profile` command (or click on the status bar) to select another profile

### Legato integration

This extension provides the following features to ease Legato development in VS Code:

#### Code

- editors for Legato files (**\*.api/\*.adef/\*.cdef/\*.mdef/\*.sdef**)
- snippets for Legato files

#### Build

- active definition file status bar + `Legato: Select active definition file` command (or click on the status bar) to pick one
- build task to invoke `mksys`|`mkapp` on the active definition file on `Ctrl+Shift+B`
- errors parsing from both `mksys`|`mkapp` and C/C++ compilation

#### Target Management

- Legato device status bar + menu on click to expose device related commands
- `Legato/Device: Set IP address` command for IP address configuration
- `Legato/Device: Open Shell` command to open an SSH terminal on the remote Legato device
- `Legato/Device: Open Logs` command to open an SSH terminal showing remote Legato device logs

## Settings

### Updated settings

This extension updates the following default settings for a better integration of leaf and Legato into VS Code workflows:

- `files.watcherExclude`: the extension makes sure that `**/leaf-data/**` folders are excluded from file watching

## Requirements

This extension requires the `leaf` tool to be installed.

> To get `leaf` tool installed, just execute the following commands:
> - `wget https://downloads.sierrawireless.com/tools/leaf/leaf_latest.deb -O /tmp/leaf_latest.deb`
> - `sudo apt install /tmp/leaf_latest.deb`

## Limitations

This extension only works on Linux hosts.
