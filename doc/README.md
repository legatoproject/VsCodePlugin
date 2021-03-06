# Legato for VS Code

This extension enables integration for Legato application framework development in VS Code.

## Features

### Leaf integration

This extension integrates the `leaf` command-line package/workspace management tool,
 and provides the following features:

#### Packages and Remotes

- **Leaf/Packages** view, listing available and installed packages
  - `Fetch remotes` command to refresh packages list
  - `Add to profile...` command to configure selected package in existing/new profile
  - **Filters** node, allowing to handle packages list filtering:
    - Built-in filters:
      - **\[master\]**: only "master" (top-level) packages are displayed
    - Custom filters:
      - Using a regular expression, matching the package identifier or description
      - Based on one of the package tags
- **Leaf/Remotes** view, listing configured leaf remotes
  - `Add`/`Remove` commands to manage list of known remotes
  - `Enable`/`Disable` commands to configure remote status

#### Profiles

- open leaf shell terminal (`Leaf: Open shell` command)
- leaf profile status bar with sync information
- leaf workspace/profile/environment change detection
- `Leaf: Switch to Another Profile` command (or click on the status bar) to select another profile
- **Leaf/Profiles** view, listing profiles in the workspace
  - `Remove` command to remove selected profile
  - `Remove` command to remove selected package from profile

### Legato integration

This extension provides the following features to ease Legato development in VS Code:

#### Code

- editors for Legato files (**\*.api/\*.adef/\*.cdef/\*.mdef/\*.sdef**)
- snippets for Legato files
- hint messages to create system and app on empty workspace

#### Hierarchical view

- dedicated view to display a map of the active system/app, allowing to navigate through definition files
- commands to handle definition files:
  - `Legato/System`:
    - create system
  - `Legato/App`:
    - create new app
    - rename app
    - remove app

#### Build

- active definition file status bar + `Legato: Select active definition file` command (or click on the status bar) to pick one
- build tasks (available on `Ctrl+Shift+B`):
  - `Legato: build`: invokes `mksys`|`mkapp` on the active definition file
  - `Legato: build and install`: as above + triggers install on device
  - `Legato: generate image`: invokes `systoimg` to generate e Legato image from current system build output
- clean tasks:
  - `Legato: clean`: removes build directory and generated artifact
- errors parsing from both `mksys`|`mkapp` and C/C++ compilation

#### Debug

- launch configuration support to debug Legato applications in attach mode:
  - in `Add Configuration...` drop-down menu of **Debug** view
  - snippet when editing `launch.json` configuration file
- parameters to be configured in `launch.json`:
  - the application name in the system
  - the process name inside this application

#### Target Management

- Legato device status bar + menu on click to expose device related commands
  - `Legato/Device: Set IP address` command for IP address configuration
  - `Legato/Device: Open Shell` command to open an SSH terminal on the remote Legato device
  - `Legato/Device: Open Logs` command to open an SSH terminal showing remote Legato device logs
  - `Legato/Device: Install on device` command for app/device install (also available in **\*.update** files right-click menu)
  - `Legato/Device: Flash image to device` command for device image flashing (also available in **\*.cwe/\*.spk** files right-click menu)
  - `Legato/Device: Reset user partition` command to restore device file system in its original state

## Settings

### Updated settings

This extension updates the following default settings for a better integration of leaf and Legato into VS Code workflows:

- `files.watcherExclude`: the extension makes sure that `**/leaf-data/**` folders are excluded from file watching

### Miscellaneous

- `leaf.common.showHints`: enable hint messages
- `leaf.common.showWhatsNewAfterUpgrades`: enable "What's New" messages and welcome page display after extension upgrade

### Target Management

- `legato.tm.log.kind`: launch Device Logs either in integrated or external terminal
- `legato.tm.terminal.kind`: launch Device Shell either in integrated or external terminal

## Requirements

This extension requires the `leaf` tool to be installed (1.9 or higher)

> To get `leaf` tool installed, just execute the following commands:
> - `wget https://downloads.sierrawireless.com/tools/leaf/leaf_latest.deb -O /tmp/leaf_latest.deb`
> - `sudo apt install /tmp/leaf_latest.deb`

## Limitations

This extension only works on Linux hosts.
