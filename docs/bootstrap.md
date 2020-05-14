## Flow
- bit starts
- app.ts starts
- load config extension
  - read workspace config (workspace.jsonc / package.json / bit.json) or scope.json
  - transforms legacy config to new one if needed
  - pass to harmony all configs
- load bit extension
  - load pre-configured core extensions (hard coded) (via harmony - all the core extension are its dependencies) (cli is not part of the deps)
  (this include cli)
//- load cli extension
- harmony.get(cli).run
- ask harmony for core extension
- call core.loadConfiguredExtensions (see below) // core
  - ask core for a list of 3rd party extension (how core knows to distinct between core and 3rd party? maybe we can get the entire list
  including the core, and filter it by not already loaded by harmony)
  - create capsules for the list (by calling workspace or scope)
  - require them
  - pass harmony the manifests (harmony already know about their config from the core extension loading)

## Legacy code hooks
- load workspace config
- ensure workspace config (init)
- load component (variant) config
- modify component config (what used the hook addConfigRegistry in the component config)

## main players
CLI
core
API
workspace
variants
bit - a proxy to workspace and scope

### Config extension API
```js
// Get all extensions configs from the workspace/scope.json
extensions: () => ExtensionsConfigList
// Get specific extension config from the workspace/scope.json
extension: (id: extensionId) => ExtensionsConfigEntry
// Add new extension config to the workspace/scope.json and send it to harmony
// This will not ask harmony to load it, just pass its configuration
configureExtension: (config: ExtensionsConfigEntry)
schemaVersion: string

// Legacy stuff (see - src/consumer/config/legacy-workspace-config-interface.ts) - the names / structure requires modifications
// The core knows to go directly into specific extension config like @teambit/workspace.defaultScope

// Register to the legacy hooks:
// - load workspace config
// - ensure workspace config (init)
// return itself on load workspace config
```

### Bit extension API
```js
// Get all core extension manifests
// extensions: () => ExtensionsManifest[]
// Get specific manifest
// extension: (id: extensionId) => ExtensionsManifest

// for each core extension expose its manifest
{
  WorkspaceExt: WorkspaceExtManifest
}
```

### Core API
```js
// Load (unloaded) extension configured in the config file
// 1. Call core.extensions
// 2. create capsules for the list (by calling workspace or scope)
// 3. require the capsules
// 4. Call harmony.load(extensionsManifests)
init: () => void
// Add extension to config file and load it
// 1. Call config.configureExtension
// 2. Call this.loadConfiguredExtensions
configureExtension: (config: ExtensionsConfigEntry)

// This will not add the extension into the config file
// It's relevant for example in case you want to load variants extensions (you don't want to configure them in the root)
// 1. create capsules for the list (by calling workspace or scope)
// 2. require the capsules
// 3. Call harmony.load(extensionsManifests)
loadExtensions: (extensions: ExtensionsConfigEntry[])
```

### variants API
```js
// Return all the patterns defined
// it's actually the entire config object
[{pattern: extensionId: extensionConfig}]
all(): ConsumerOverrides // see src/consumer/config/consumer-overrides.ts


// Go over all matching patterns for the component id merge them and return the result
// Alternate names of the function - component, variant,
// TODO: this should be probably result an instance of src/extensions/component/config.ts
// And this config should have only extensions and functions for getting legacy stuff
// for example _deps() - should go to depsResolver extensions.policy and to the correct stuff
calculate(id: componentId): ConsumerOverridesOfComponent // see src/consumer/config/consumer-overrides.ts
```

## questions:
- who is loading the extensions defined in the workspace.jsonc (core?)
- how does this player get the manifests of the core extensions
- core uses all extensions or all extensions uses core?
- how does the core load 3rd party extensions? he can't call workspace to resolve them to a capsule
  - maybe the core expose an API to get all extensions, and the workspace loaded the missing (not core?)
  (That means the workspace uses core)
  (this might create a circular, since the core imports the manifest of the workspace, and the workspace imports the core to define it as dependency)
- how do we return a config object that the legacy knows to work with?
  - if we return it from the core, for example this should have a function/getter for the default scope. but this is a workspace prop, so core can't use it (if we say that the workspace uses core to get all extensions)
- core and cli which is loaded first (cli uses paper which uses reporter - reporter might have configs in json?)
- relation between CLI, API, and core
- is API an extension or just a regular component?
- how do we get a component config during component loading ? (maybe hook for this, registered by the variants extension that return it)
