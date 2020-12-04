# Dependencies Cache Mechanism
To improve component-loading performance, the dependencies data is cached in the filesystem.

### The component's cache gets invalidated in the following scenario:
1. The component-dir or sub-dirs have been changed. (modified-date of the dirs paths)
2. One of the component files have been changed.
3. A component config file (component.json/package.json) has modified.

### The entire cache of all component dependencies is invalidated if one of the following happened:
1. workspace-config file (bit.json/workspace.jsonc) has changed.
2. package.json file has changed.
3. node_modules-dir (only root dir, not sub-dirs) has changed. - not sure if needed.
4. On completion of "bit link".
5. On completion of "bit install".
6. During 'bit tag --persist', before loading the components.

### A component is not entered to the cache in the first place in the following cases:
1. No root-dir/track-dir (legacy).
2. Component has one of the following issues: missingPackagesDependenciesOnFs, untrackedDependencies.

### Limitations:
1. If a user deleted the dists directories of a component in node-modules, we don't know about it and bit-status won't show any error.
2. If a user deleted a package from node-modules dir manually, we don't know about it.

### Disabling the cache
set the "no-fs-cache" feature.
For one command, prefix your command with `BIT_FEATURES=no-fs-cache`.
Or you can configure it on the machine level for all commands/workspaces: `bit config set features='no-fs-cache'`

