# Change Log

## 1.0.1
- Remove preview tag from marketplace page

## 1.0.0

- Bugs fixes
- Legato System view enhancements, ability to add existing apps/components, create new apps/components, and remove apps/components
- Leaf packages are now shown newest to oldest
- User Interface enhancements

## 0.9.1

- Bug fixes

## 0.9.0

- Bugs fixed
- Toggle devMode build flag if not detected when launching debug session
- Add commands on system view to add existing apps to the system
- New commands on system view to create and remove components
- New command in package view to display documentation for Legato SDK (from 19.07)
- New command in profile view to upgrade a profile to the latest available SDK

## 0.8.0

- Added verification steps before debug (debug symbols built, devMode app present, application started)
- Support **launch** mode for debug sessions

## 0.7.0

- Update minimum leaf version to 1.9.2
- Build using **LEGATO_OUTPUT_DIR**, **LEGATO_OBJECT_DIR** and **LEGATO_DEBUG_DIR** on the command line
- Add clean task
- Add task to generate Legato image from system build
- Support Legato configuration for Debug attach (allows to attach to a running Legato app process)

## 0.6.0

- First publish on the market place
- Add hint message to create an app in an empty system
- Add setting to disable hint messages

## 0.5.0
- New settings to launch device shell/logs either in integrated or external terminal
- Check minimum leaf version (1.7)
- Automatically import Legato snippets from leaf packages
- Add welcome page
- Add profile sync information in status bar + fix action
- Add new Legato hierarchical view
- Add actions to create/rename/remove apps and systems
- Invite user to select or create a system when active definition file is not set in a Legato workspace

## 0.4.0
- New build task to trigger build+install in one step
- Device status bar now pops up a menu with device related commands
- New command to open Device logs
- New command to install app/system on device
- New commands to flash images on device
- New build task to build and install in one action
- Add filters to the package view
- Add Leaf Profiles view + commands to remove packages from profiles, and to remove profiles
- Add description text in views for packages (tags), remotes (URL), profiles (current)

## 0.3.0
- All commands reworked to be functional from the command palette
- Commands to add and remove remotes
- Capability to queue leaf tasks when triggering new ones while leaf is already busy
- Persist active def file in leaf environment
- Clean useless notifications and keep silent (no status bar displayed) until a leaf workspace is created
- Improve performances and latency time to detect profile/environment change
- Stopping and starting Language Server when switching between Legato versions
- Push environment changes to Language Server when detected

## 0.2.0
- Active definition file selection
- Basic editing support (colors) for Legato files (\*.api/\*.adef/\*.cdef/\*.mdef/\*.sdef)
- Basic snippets Legato files
- Leaf views for packages and remotes
- Command to configure packages in profile (from leaf package view)
- Commands to enable/disable remotes (from leaf remote view)
- Legato device IP address configuration
- Command to open a remote Legato device shell
- Start Language Server if bundled in used Legato version

## 0.1.0
- Initial release
- Leaf tool integration
- Legato build integration
