---
description: Simplifies the dependency management of components in a Bit workspace.
labels: ['core aspect', 'dependencies']
---

The Dependency Resolver configures and installs dependencies for components in a Bit workspace. It auto-generates the dependency graph for components to spare us the tedious work of manually configuring it ourselves.
It does so by integrating the dependency policies set by various Bit extensions (primarily the workspace) with the components' parsed and analyzed `import`/`require` statements.
In addition to that, the Dependency Resolver offers an efficient API to manually modify the generated graph using policies that can be applied on groups of components.

#### Features

- **Auto-generated dependency graph**:
  The Dependency Resolver saves us time and effort by generating the dependency graph for each component handled by the workspace. It does so by parsing out all `import` \ `require` statements in the component's files.
  It then determines if these dependencies are packages, components or internal implementation files.
  If they are external components or packages, it goes on to determine their version and dependency-type (`dependencies`, `devDependencies`, `peerDependencies`).

- **An efficient dependency configuration API:**
  The Dependency Resolver strikes the right balance between automation and customization by offering a simple and efficient configuration API.
  Use it in the workspace configuration file to manually modify the version and dependency type of dependencies in the generated dependency graph.
  When used in combination with [`@teambit.workspace/variant`](https://bit.dev/teambit/workspace/variants) it allows to define, in a cascading (CSS-like) way,
  different dependency policies for different sets of components, and even to add or remove dependencies, altogether.

- **Optimized dependency installation:**
  The Dependency Resolver directs the package manager to install the right packages at the right place in the workspace file structure.
  When a dependency appears in the workspace dependency graph more than once, it searches for a common version that satisfies _most_ dependent
  components and installs it at the workspace root directory, where it can be shared by all relevant components.
  (dependency versions that are used by a minority of components will be installed in each component's directory).

- **A single 'install command for packages and components:**
  A single `bit install` command will not only install packages but will also import components listed in your `.bitmap` file.
  These components will then be linked to your `node_modules` directory, to keep the same import pattern for both module types, components and packages.

- **Programmatic API for extensions and environments**
  The Dependency Resolver provides other extensions and environments with an API that allows them to register their own dependency policies.
  For example, the [React environment](https://bit.dev/teambit/react/react) uses the Dependency Resolver to set 'react-dom' as a peerDependency for all components using it.

## Quickstart & configuration

### Auto-registered dependency version and type

Dependency policies define the version and dependency type of each package used by components in the workspace.
When installing a package, the Dependency Resolver registers its version in the dependency configuration (if a version is not specified upon installation, it will default to the latest one).

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

## The dependency policies hierarchy

The Dependency Resolver integrates dependency policies from various sources to determine the component's final dependency graph.
Cases of conflicting policies are resolved according to a hierarchy of source types, where the one at the top overrides the rest.

The hierarchy in a descending order:

1. Policies set by Variants (`@teambit/variants`) and the `component.json` files of "ejected" components (these two sources are merged by Variants).
2. Policies set by various extensions/aspects (using `registerDependencyPolicy`)
3. Policies set by the environment (using `getDependencies`)
4. Bit’s automated dependency detections, and policies set by the Dependency Resolver at the workspace configuration root-level.

> Learn more about how the Variants aspect selects and merges policies that were set using it, [here](https://bit.dev/teambit/workspace/variants)

> Use the `bit dependencies <component-id>` command to understand the calculations and interactions that resolved in the generated dependency graph of a specific component.

### Select a package manager

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

### Apply policies on all relevant components

A dependency policy configured at the root level of the workspace configuration (JSON) will affect _all_ components that have that package as their dependency (i.e., components that have this module listed in their generated dependency graph).
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

### Apply policies on a selected group of components

Dependency policies can be applied on a specific group of components. This is done using the [`@teambit.workspace/variants`](https://bit.dev/workspace/variants) configuration API.

For example, to set version `1.0.0` of `classnames` as a dependency of all components located inside the `./components/react` directory (or any of its sub-directories):

```json
{
  "teambit.workspace/variants": {
    "teambit.dependencies/dependency-resolver": {
      "policy": {
        "dependencies": {
          "components/react": {
            "classnames": "1.0.0"
          }
        }
      }
    }
  }
}
```

> To learn how to select components using `@teambit.workspace/variants`, [see here](https://bit.dev/teambit/workspace/variants).

### Remove a dependency

Dependency policies can also be used to remove a dependency. That's especially useful when a dependency is not defined with the correct dependency type.  
For example, a module can be "moved" from `dependencies` to `peerDependencies` by removing it from `dependencies` and listing it under `peerDependencies`.

```json
  "teambit.dependencies/dependency-resolver": {
    "policy": {
      "dependencies": {
        "enzyme": "-"
      },
      "peerDependencies": {
        "enzyme": "^3.11.0"
      }
    }
```

### Override cascading policies

Policies set on a specific group of components will override any conflicting policies that have cascaded from more general configurations.

For example, the following configuration will set `classnames` version `1.0.0` on all components using the `react-ui` namespace. This policy will override the workspace-level policy that uses version `2.0.0` of that same package.

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

### Set dependency types

#### dev dependencies

Dev dependencies are determined by the type of file that uses the dependency.
If it is a development file (e.g, `doSomething.test.ts`) then the files consumed by it are also considered
to be used for development and will therefore be registered as `devDependencies`. In cases where a module is consumed by both a runtime file and a development file, the module will be considered as a runtime (regular) dependency.

> `devDependencies` that are set by the Dependency Resolver will not be visible in its configuration. To validate a dependency is registered as a dev dependency, use the `bit show <component>` command.

The list of file patterns to be considered as development files is determined by the various Bit extensions. For example, the `@teambit.react/react` environment lists all `*.spec.tsx` files as dev files.
Any component using that environment will have its `.spec.tsx` files considered as dev files and all these files' dependencies considered as `devDependencies`.

##### Register file patterns to be considered as dev files

Set the `devFilePatterns` property to add your own list of file extensions to be considered as development files (and to have all their dependencies considered as `devDependencies`):

```json
// At the root-level of the workspace configuration JSON
{
  "teambit.dependencies/dependency-resolver": {
    "devFilePatterns": [".spec.ts"]
  }
}
```

To learn more about the Dev File aspect, [see here](https://bit.dev/teambit/component/dev-files).

##### Configure specific dependencies as devDependencies

> Dependencies can be _directly_ configured as `devDependencies` only by using the `variants` config API.

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

#### peer dependencies

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

> Peer dependencies are usually used in the context of a single "hosting code". That could be an application or a single component library.
> Bit may generate multiple "hosts", one for each environment being used, to run components of different types.
> That could translate into multiple versions of the same peer dependency, one for each environment.
> To manage multiple versions of a peer dependency [see here](/docs/faq/multiple-peer-dep-versions).

## Enforce the installation of a specific package version

The dependency resolver determines the package version that best fits the requirements of most components consuming the same package.
It then installs it at the root of the workspace to make it available to all components sharing the same package (those that cannot use it will have their dependency installed inside their own directory).

It may happen that a package installed by the Dependency Resolver is not with the same version that was specified in the Dependency Resolver policy.
To enforce the installation of the exact version specified in the policy, set the `preserve` property to `true`.

```json
{
  "teambit.dependencies/dependency-resolver": {
    "policy": {
      "dependencies": {
        "lodash": {
          "version": "3.0.0",
          "preserve": true
        }
      }
    }
  }
}
```

## Set a proxy for outgoing HTTP/HTTPS requests

The package manager can be configured to use a proxy for outgoing network requests.

`proxy` - A URL for a proxy to be used in both HTTP and HTTPS requests.

`httpsProxy` - A URL specific for HTTPS requests (this will override the value set in `proxy` for HTTPS requests).

```json
{
  "teambit.dependencies/dependency-resolver": {
    "proxy": "http://domain-one.proxy.com:8080",
    "httpsProxy": "http://domain-two.proxy.com:8080"
  }
}
```

##### A proxy can also be set in NPM's and Bit's global configurations

To get the value for 'proxy'/'https-proxy':

```shell
$ bit config get proxy

$ bit config get https-proxy
```

To set a new 'proxy'/'https-proxy' value:

```shell
$ bit config set proxy http://domain-one.proxy.com:8080

$ bit config set https-proxy http://domain-one.proxy.com:8080
```

Read about setting a proxy in NPM's global configuration [here](https://docs.npmjs.com/cli/v6/using-npm/config#https-proxy)

> Notice the Dependency Resolver config will override _all_ other proxy configurations. The NPM config will override Bit's global proxy configurations.

## CLI reference

### install

> By default, the Dependency Resolver installs packages from Bit.dev's registry. The authentication for that is done using your Bit.dev token, listed under `@bit`, in your `.npmrc` file.
> If that token cannot be found in the `.npmrc` file, it will look for it in your global Bit configurations (use the `bit config` command to output your `user.token` property).
> <br />
> If your npm is configured to use a registry different than npmjs's - the Dependency Resolver will use that configured registry, instead.

> The 'install' process includes importing components and linking them to the `node_modules` directory.

##### Install all dependencies listed in the Dependency Resolver configuration:

```shell
$ bit install
```

##### Install the latest version of a package:

```shell
$ bit install <package>

// For example
$ bit install lodash
```

##### Install a specific version of a package:

```shell
$ bit install <package>@<version>

// For example
$ bit install lodash@1.0.0
```

##### Install packages that are already listed in the Dependency Resolver policies

When trying to install a specific package that is already listed in the Dependency Resolver policies, an error will be thrown.

To override it:

```shell
$ bit install <package> --update-existing

$ bit install <package> -u
```

##### Install packages without importing components

The 'install' process includes importing components listed in the `.bitmap` file and linking them to the `node_modules` directory.
To disable importing and install all packages and components as standard packages use:

```shell
$ bit install --skip-import
```