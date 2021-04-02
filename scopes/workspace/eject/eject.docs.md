---
id: eject
title: Eject
slug: /aspects/eject
---
## Eject Feature Description
one of the common scenarios of using `bit eject` is to make a quick change to an external (component) dependency. The component needs to be imported first and once it's changed and exported, there is no need to keep it in the current workspace. Without `eject`, the next steps would be: 1) remove the component from the workspace by `bit remove` and 2) installing the component by `bit install`.

`bit eject` combines the commands above to one command.

## Eject process
The following steps are done during the `eject` process.
1) remove the component's data from node-modules so then it won't interfere with the package installation.
2) remove the component from the .bitmap file.
3) install the component as a package by the package manager and add the package to the `workspace.json` file.
4) depends on the `--keep-files` flag, deletes the component files from the workspace.

