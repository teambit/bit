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
  */
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
* remove the loadash dependency.
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

### hooks

#### policy changes
The dependency resolver will provide a hook called @dependncies (name is open - see open question below) to enable 3rd party extension to add dependencies for a component.
here is an example:
```js
// my 3rd party extension
import { Extension } from '@teambit/bit';
import { DependencyResolver, Dependencies } from '@teambit/dependency-resolver';
@Extension()
export class MyExtension {
  constructor() {}

  @Dependencies
  addDependencies() {
    return {
      "dependencies": {
        "underscore": "1.1.1"
      },
      "devDependencies": {
        "types/underscore": "1.1.1"
      }
    }
  }
}
```

#### file dependencies definitions - TBD
The dependency resolver will provide a hook called @FileDependencies (name is open - see open question below) to enable 3rd party extension analyze a file and return a list of dependencies from it.
here is an example:
```js
// fileToAnalyze.ts
import type {SomeType} from 'my-package';
import default from 'my-component';

console.log('do something');

// my 3rd party extension
import { Extension } from '@teambit/bit';
import { DependencyResolver, FileDependencies } from '@teambit/dependency-resolver';

@Extension()
export class MyExtension {
  constructor() {}

  getDepsForFile(filePath: string, fs: FS): FileDependenciesDefinition {
    return [
      {
        dependencyPath: "my-package",
        isType: true;
      },
      {
        dependencyPath: "my-component"
      }
    ]
  }
}
```

## Documentation

### saved data
The dependency-resolver extension will store in its data (part of the component model), the final dependencies after all the calculations, and also the dependencies calculated by the workspace configuration (and require detection) - without putting the component config rules and dependencies added by extensions (via the hooks)
(see calculation flow below)

### calculation flow
The dependency calculation will be triggered by external player (probably the workspace / scope extensions)
This player will pass to the dependency resolver
* "raw component" (exact type tbd), this will have in general the component files, the component config, and the component extensions at least.
* workspace config for the resolver (optional) - should be discussed, see the open question below
#### dependencies by code analysis (import / require detection)
The dependency resolver will start by analyzing the imports / require statements of the source code and intersect them with the dependencies from the workspace configuration -
If it detects for example a `require('lodash');` it will search for lodash in the config. (if not found it will throw an error that the dependency is missing so it can't resolve its version)
(This part must be extendable by third part extensions, exact syntax TBD - see open question)
#### add the extensions themselves as dependencies
If a component has extension defined for it, this extension should be considered as a dev dependency.
#### dependencies added by extensions
An extension might provide more dependencies / remove dependencies (uses the hook - see API below).
The dependency resolver will take this dependencies configuration added by all the hook subscribers and merge them with themselves (2 extensions for the same component might add the same dependency in a different version) - exact strategy to be defined - see open question
Then it will merge the final result with the result of the previous steps (dependencies configured here are stronger than those from the code analysis)
#### dependencies added by component config
The dependency resolver will read special rules configured in the component config and will merge them into the previous results.
Since these rules added explicitly by the user, they are the strongest ones.

### open issues
* names of the workspace configuration fields
* exact policy structure
* hooks syntax
* type that the calculation gets as input (the "raw component")
* how we extend the import / require analysis to enable 3rd party extension to extend it?
* What is the strategy to merge dependencies added by hooks between themselves (random / load order / alphabetically?)
* More methods that should be exposed via the API
* FileDependencies hook name
