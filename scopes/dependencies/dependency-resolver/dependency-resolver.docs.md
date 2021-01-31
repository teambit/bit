---
description: Simplifies the dependency management of components in a Bit workspace
labels: ['core aspect', 'dependencies']
---

The Dependency Resolver salvages us from the tedious and time-consuming task of defining the dependency graph for every single component in a Bit workspace.
It does so by automatically generating their dependency graph and by offering an efficient API to manually modify the generated graph using policies that can be applied on groups of components.

#### Features

- **Auto-generated dependency graph**:
  The Dependency Resolver saves us time and effort by generating the dependency graph for each component in the workspace. It does so by parsing out all `import` \ `require` statements in the component's files.
  It then determines if they are external packages or internal implementation files.
  Once that's been resolved, it goes on to determine their version and the type of dependency (`dependencies`, `devDependencies`, `peerDependencies`).

- **An efficient dependency configuration API**
  The dependency-resolver strikes the right balance between automation and customization when used with its elegant configuration API. Use it in the workspace configuration file to manually determine the package version and dependency type, for dependencies in the generated dependency graph.
  When used in combination with [`@teambit.workspace/variant`](https://bit.dev/teambit/workspace/variants) it allows to define, in a cascading (CSS-like) way, different dependency policies for different sets of components and even add new dependencies (that were not already included in the generated dependency graph).

- **Dependency installation**
  The 'dependency-resolver' directs the [package manager](/docs/packages/overview) to install the right packages at the right place in the workspace file structure.
  That includes installing multiple versions of the same package when different groups of components are set to use different versions.

## Quickstart & configuration

### Selecting a package manager

The Dependency resolver does not replace package managers - it uses them and directs them.
To choose between '[Yarn](https://bit.dev/teambit/dependencies/yarn)' and '[pnpm](https://bit.dev/teambit/dependencies/pnpm)', set the `packageManager` property to either of the two:

- `teambit.dependencies/yarn`
- `teambit.dependencies/pnpm`

```json
// At the root-level of the workspace configuration JSON
{
  "teambit.dependencies/dependency-resolver": {
    "packageManager": "teambit.dependencies/yarn"
  }
}
```

### Auto-registered dependency version and type

Dependency policies define the version and dependency type of each package used by components in the workspace.
Whenever you use the `bit install <package>` command, Bit registers the package version in the dependency configuration.

```json
// At the root-level of the workspace configuration JSON
{
  "@teambit.dependencies/dependency-resolver": {
    "policy": {
      "dependencies": {
        "lodash": "4.17.0"
      }
    }
  }
}
```

### Applying policies on all relevant components

A dependency policy set at the root level of the workspace configuration JSON will affect _all_ components that have the configured package as their dependency (i.e., components that have this module listed in their generated dependency graph).
**Components that do not have this package as a dependency will not be affected.**

For example:

```json
// At the root-level of the workspace configuration JSON

// Every component that has 'lodash' as a dependency will use version '3.0.0' of it.
// This policy will not affect any component that does not have 'lodash' as its dependency.

{
  "teambit.dependencies/dependency-resolver": {
    "policy": {
      "dependencies": {
        "lodash": "3.0.0"
      }
    }
  }
}
```

### Applying policies on a selected group of components

Dependency policies can be applied on a specific group of components. This is done using the [`@teambit.workspace/variants`](https://bit.dev/workspace/variants) configuration API.

For example, to set the `1.0.0` version of `classnames` as a dependency of all components located inside the `./components/react` directory (or any of its sub-directories):

```json
{
  "teambit.workspace/variants": {
    "teambit.dependencies/dependency-resolver": {
      "policy": {
        "components/react": {
          "classnames": "1.0.0"
        }
      }
    }
  }
}
```

> To learn how to select components using `@teambit.workspace/variants`, [see here](https://bit.dev/teambit/workspace/variants).

### Overriding cascading policies

Policies set on a specific group of components will override any conflicting policies that have cascaded from more general configurations.

For example, the following configuration will set `classnames` version `1.0.0` on all component using the `react-ui` namespace. This policy will override the workspace-level policy that uses version `2.0.0` of that same package.

```json
// All components using the namespace 'react-ui' will use version 1.0.0 of "classnames"
// instead of version "2.0.0", set as the default for all components in the workspace
{
  "teambit.workspace/workspace": {
    "name": "my-workspace"
  },
  "teambit.dependencies/dependency-resolver": {
    "policy": {
      "dependencies": {
        "classnames": "2.0.0"
      }
    }
  },
  "teambit.workspace/variants": {
    "teambit.dependencies/dependency-resolver": {
      "policy": {
        "{react-ui/*}": {
          "classnames": "1.0.0"
        }
      }
    }
  }
}
```

### "Forcibly" add dependencies to a component

Dependency policies applied on a selected group of components will "forcibly" add the listed packages to any [selected] component that does not have them already listed as a dependency.
This can be useful when a component depends on another module but has no `import`/`require` statement to be parsed by the Dependency Resolver (for example, in a Webpack configuration file).

In the below example, `classnames@1.0.0` will be "forcibly" added as a dependency to any component using the `react-ui` namespace.

```json
  "teambit.workspace/variants": {
    "teambit.dependencies/dependency-resolver": {
      "policy": {
        "{react-ui/*}": {
          "classnames": "1.0.0"
        }
      }
    }
  }
```

### Setting dependency types

#### Setting dev dependencies

Dev dependencies are determined by the type of file that is dependent on them. If it is a development file (e.g, `doSomething.test.ts`) then the files consumed by it are also understood (by the Dependency Resolver) to be used for development and therefore, will be registered as `devDependencies`.

> `devDependencies` set by the Dependency Resolver will not be visible in its configuration. To validate it, use `bit show <component>` or look for the component's generated `package.json` file in the `node_modules` directory.

The list of file extensions to be considered as development is determined by the various Bit aspects and extensions that are in use. For example, the `@teambit/react/react` environment lists all `*.spex.tsx` files as dev files.
Any component using that environment will have its `.spec.tsx` files considered as dev files and all these files' dependencies considered as `devDependencies`.

##### Register file extensions to be considered as dev files

Set the `devFilePatterns` property to add your own list of file extensions to be considered as development files (and to have all their dependencies considered as `devDependencies`):

```json
// At the root-level of the workspace configuration JSON
{
  "teambit.dependencies/dependency-resolver": {
    "devFilePatterns": [".spec.ts"]
  }
}
```

##### Configure specific dependencies as devDependencies

> Policies set at the workspace configuration root-level cannot have `devDependencies`. Either set `devFilePatterns` (see example above) or use the `@teambit.workspace/variants` config API to set a policy to a selected group of components (see example below).

```json
{
  "teambit.workspace/variants": {
    "*": {
      "teambit.dependencies/dependency-resolver": {
        "policy": {
          "devDependencies": {
            "react-test-renderer": "17.0.1"
          }
        }
      }
    }
  }
}
```

#### Setting peer dependencies

Setting a package as a peer dependency ensures the package manager installs only a single version of that package. If that is not possible, if there is no single “agreed upon” version for all components in the workspace then an error will be thrown.

This can be crucial when different components communicate with each other using shared objects that are instantiated by an installed package (the dependency). If different versions of the same package create different object instances then the “means of communication” is broken. There is no single object to address, no single source of truth. This can turn out to be critical when working with modules that are used as “plugins” of another module (for example, Babel), or when working with components that are coordinated in runtime using a shared library (for example, React).

To set a package as a peer dependency, place it under the `peerDependencies` entry, like so:

```json
{
  "teambit.bit/dependency-resolver": {
    "policy": {
      "dependencies": {},
      "peerDependencies": {
        "react": "^16.13.1",
        "react-dom": "^16.13.1",
      }
    }
}
```

> Peer dependencies are usually used in the context of a single "hosting code". That could be an application or a single component library. Bit may generate multiple "hosts", one for each environment being used, to run components of different types. That could translate into multiple versions of the same peer dependency, one for each environment. To manage multiple versions of a peer dependency [see here](/docs/faq/multiple-peer-dep-versions).

## CLI reference

### install

To install all dependencies listed in the Dependency Resolver configuration:

```shell
$ bit install
```

To install the latest version of a package:

```shell
$ bit install <package>

// For example
$ bit install lodash
```

To install a specific version of a package:

```shell
$ bit install <package>@<version>

// For example
$ bit install lodash@1.0.0
```
