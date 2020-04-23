# `@teambit/dependency-resolver`

This extension is responsible for:
1. detecting dependencies of components by static code analysis
2. apply dependencies polices
3. resolve dependencies versions
4. calculate the final dependencies of a given component

## Usage

### workspace config
The extension's workspace configuration will have the following fields:
* policy
* packageManager
* strictPeerDependencies
* packageManagerArgs
Here is a full example of workspace config:
(For complete reference see DependencyResolverWorkspaceConfig type)
```js
/**
   * main configuration for component dependency resolution.
  **/
  "@teambit/dependency-resolver": {
    "policy" : {
      "dependencies": {
        "lodash": "1.2.3",
        // This is a component, not a package
        "@teambit/my-awesome-component": "1.1.1"
      },
      "devDependencies": {
        "chai": "1.2.3"
      },
      "peerDependencies": {
        "react": ">15.0.1"
      },
    }

    /**
     * choose the package manager for Bit to use. you can choose between 'npm', 'yarn', 'pnpm'
     * and 'librarian'. our recommendation is use 'librarian' which reduces package duplicates
     * and totally removes the need of a 'node_modules' directory in your project.
    */
    "packageManager": "pnpm",

    /**
    * If true, then Bit will add the "--strict-peer-dependencies" option when invoking package managers.
    * This causes "bit install" to fail if there are unsatisfied peer dependencies, which is
    * an invalid state that can cause build failures or incompatible dependency versions.
    * (For historical reasons, JavaScript package managers generally do not treat this invalid
    * state as an error.)
    *
    * The default value is false to avoid legacy compatibility issues.
    * It is strongly recommended to set strictPeerDependencies=true.
    */
    "strictPeerDependencies": true,

    /**
     * map of extra arguments to pass to the configured package manager upon the installation
     * of dependencies.
    */
    "packageManagerArgs": []
  }
```
### variant config

The component configuration of the dependency resolver will store dependencies policy for the component.
This is similar to what used to be under the `overrides.dependencies` in the old workspace config.
The component configuration will support `"-"` sign as a value for dependency which means to remove it from the final dependency list.

The component configuration will support syntax to remove all dependencies (by type) in case the user wants full control. (syntax is open for discussion)
for example:
```js
"dependencies": {
   // Remove all dependencies calculated from the workspace
   "*": "-",
   // Add custom dependency
   "@teambit/my-awesome-component": "5.5.5"
   },
}
```

for example, consider the following config (co-exist in the same workspace with the workspace configuration described above):
```js
"@teambit/variants": {
    /**
     * wildcards can be used to configure components under a specific namespace.
     * this configuration applies the react extensions on all components the `ui` namespace.
    **/
    "new-ui/*": {
      "@teambit/dependency-resolver": {
        "dependencies": {
          "lodash": "-",
          // will change "@teambit/my-awesome-component" version to 5.5.5 for any component that require it
          "@teambit/my-awesome-component": {
            "version": "5.5.5",
            "force": false,
          },
          // will add "@teambit/some-other-package" to all component matching this variant
          "@teambit/some-other-package": {
            "version": "5.5.5",
            "force": true,
          }
        },
        "peerDependencies": {
          "react": ">16.0.1"
        }
      }
    }
}
```
This tells the dependency-resolver that for all components under `new-ui/*`
* remove the loadash depdendcy.
* use version 5.5.5 of @teambit/my-awesome-component instead of 1.1.1 (for any component that require it)
* add "@teambit/some-other-package" to all component matching `new-ui/*` variant
* use version 16.0.1 as peer instead of 15.0.1

### commands
#### install
This extension will expose a `bit install` command.
when running `bit install` it will:
1. Install the dependency on the workspace or the relevant component's capsules. (write them to the fs)
2. Add a rule to the workspace / matching variant policy

##### examples:
When running `bit install lodash 1.2.3` this will add the `lodash: 1.2.3` into the workspace dependency policy configuration (proper flags for dev / peer will exist as well)
When running `bit install lodash 4.5.6 [component id glob pattern]` (exact syntax will be determined as part of the install extension). it will add the `lodash: 4.5.6` into the matching glob pattern (created if not exist), in the variants, under the dependency-resolver policy config.
(or in the matching components.json if exists)

## Rational

Extended description, preferably with a specific use case where this extension is required to solve a real-world problem.

## API Usage
Here we should explain (and demonstrate) how to use this extension programmatically.
It mainly need to serve other people who want to build extension that consume this extension.

Sections to consider here:
1. Types - stuff that are not described by the type itself, like special fields, rational and meta-docs
2. Methods - mainly example of how to use the methods, or general info about them. the signature and stuff like this should be covered by the code itself. do not write it here again to prevent the need to maintain both places.
3. Hooks - same as methods, mainly about how to use them and examples, rather than stuff described by the code itself.

## Documentation
Here we should explain things in more details. Think about documentation for future maintainers of the extension.
Here should be stuff like:
1. Internal structure if it's complex
2. Special algorithms
3. General flow between the files / classes / functions
4. Open issues
