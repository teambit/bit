---
id: node
title: Node
slug: /aspects/node
---

The Node environment is an implementation of the Environments aspect. It is a one-stop-shop for Node components in a Bit workspace. It uses various services, provided by other aspects, to handle the life events of Node components, managed in a Bit workspace.

The Node environment spares you the overhead of setting up your own Node environment and creates a standardized and shareable development environment for you and your team.

## Default configurations

### Tester

- Uses Jest as a test runner
- Test files: `*.spec.*` and `*.test.*`

### Compiler

TypeScript

### Bundler (for 'Preview' and 'DevServer')

Uses Webpack.

Includes the following file types:

`*.web.mjs`, `*.mjs`, `*.js`, `*.ts`, `*.tsx`, `*.jsx`, `*.mdx`, `*.md`, `*.(module.)css`, `*.(module.)scss`, `*.(module.)sass`, `*.(module.)less`

### Default dependencies (for components handled by the environment)

```js
{
  devDependencies: {
    '@types/jest': '~26.0.9',
    }
}
```

### Development files

The Node environment treats the following files as development files: `*.doc.*`, `*.spec.*`, `*.test.*`

Dependencies of development files will be recognized and registered as development dependencies (`devDependencies`).

## Using Node

To use the Node environment, set it in the `workspace.jsonc` configuration file. Node can only be configured using the 'variants' config API.

## Apply Node on a group of components

The example below shows Node being applied on all components in the workspace, using the wildcard character `*`.

```json
{
  "teambit.workspace/workspace": {
    "name": "my-toolbox",
    "icon": "https://image.flaticon.com/icons/svg/185/185034.svg"
  },
  "teambit.workspace/variants": {
    "*": {
      "teambit.harmony/node": {}
    }
  }
}
```

## Extending Node

Use the Node environment extension API to create your own customized environment extension. The extension component can then be exported to a remote scope to make it available for reuse by other workspaces. Doing so is not only a way to save time (otherwise lost on setting up a dev environment) but also a way to maintain a consistent development environment for independent Node components authored in various decoupled workspaces.

This page lists Node's Environment Transformers. These are the 'override' methods that allow to add or override Node's default configurations.

## Environment transformers

Node's environment transformers enable merging new configurations for different Bit aspects used by the Node environment

The process of 'merging' or 'overriding' adds new properties to the existing configurations. In case of a conflict between two properties, the extension's configurations will override the extended environment's defaults.

### overrideTsConfig

```ts
overrideTsConfig(tsconfig: TsConfigSourceFile): EnvTransformer
```

Overrides the environment's default TypeScript configurations with a new ([tsconfig.json](https://www.typescriptlang.org/handbook/tsconfig-json.html)) configuration file.

For example:

```ts
// ...

const tsconfig = require('./typescript/tsconfig.json');

export class NodeExtension {

// ...

  static async provider([envs, node]: [EnvsMain, NodeMain]) {
    const newNodeEnv = node.compose([
      node.overrideTsConfig(tsconfig)
    ]);


}

// ...
```

### overridePreviewConfig

```ts
overridePreviewConfig(config: Configuration): EnvTransformer
```

Overrides the Webpack configurations for the 'Preview' environment service, with a new ([webpack.config.js](https://webpack.js.org/configuration/)) configuration file.

For example:

```ts
// ...

const webpackConfig = require('./webpack/webpack.config');

export class NodeExtension {

// ...

  static async provider([envs, node]: [EnvsMain, NodeMain]) {
    const newNodeEnv = node.compose([
      node.overridePreviewConfig(webpackConfig)
    ]);


}

// ...
```

### overrideDevServerConfig

```ts
overrideDevServerConfig(config: Configuration): EnvTransformer
```

Overrides the Webpack configurations for the 'DevServer' environment service, with a new ([webpack.config.js](https://webpack.js.org/configuration/)) configuration file.

For example:

```ts
// ...

const webpackConfig = require('./webpack/webpack.config');

export class NodeExtension {

// ...

  static async provider([envs, node]: [EnvsMain, NodeMain]) {
    const newNodeEnv = node.compose([
      node.overrideDevServerConfig(webpackConfig)
    ]);


}

// ...
```

### overrideJestConfig

```ts
overrideJestConfig(jestConfigPath: string): EnvTransformer
```

This method receives a path (as a string) to a configuration file . Overrides the default configurations for the Jest test runner with a new ([jest.config](https://jestjs.io/en/configuration)) configuration file. This is done by passing the _path_ to the file as an argument.

For example:

```ts
// ...

export class NodeExtension {

// ...

  static async provider([envs, node]: [EnvsMain, NodeMain]) {
    const newNodeEnv = node.compose([
      node.overrideJestConfig(require.resolve('./jest/jest.config'))
    ]);


}

// ...
```

### overrideBuildPipe

```ts
overrideBuildPipe(tasks: BuildTask[]): EnvTransformer
```

This method receives an array of Bit tasks. It overrides the build pipeline of a component (initiated either on a `bit tag` or `bit build` command).

For example:

```ts
// ...

// Import the task
import { CustomTask } from './custom.task'

export class CustomNode {
  // ...

  static async provider([envs, node]: [EnvsMain, NodeMain]) {
    // Get the environment's default build pipeline using the 'getBuildPipe' service handler
    const nodePipe = node.env.getBuildPipe()

    // Add the custom task to the end of the build tasks sequence.
    const tasks = [...nodePipe, new CustomTask()]

    const newNodeEnv = node.compose([node.overrideBuildPipe(tasks)])

    // ...
  }
}
```

### overrideDependencies

```ts
overrideDependencies(dependencyPolicy: DependenciesPolicy): EnvTransformer
```

This method receives a Bit dependency-policy object. It overrides the default dependency policy for components using this environment.

Each key-value pair in a dependency-policy object signifies the package and the version to be used. It also uses the `-` notation to signify a module should not be defined as a dependency of a certain type (dev, peer or standard).

For example:

```js
// ...

const newDependencies = {
  devDependencies: {
    '@types/jest': '~26.0.9'
  }
}

export class CustomNode {
  // ...

  static async provider([envs, node]: [EnvsMain, NodeMain]) {
    const newNodeEnv = node.compose([
      node.overrideDependencies(newDependencies)
    ])

    // ...
  }
}
```

> The above example shows the 'Node' library being removed as a (runtime) dependency and added as a peer dependency.

### overridePackageJsonProps

```ts
overridePackageJsonProps(props: PackageJsonProps): EnvTransformer
```

Overrides the default properties added to the `package.json` file of every package generated from components using this environment.

For example:

```ts
// ...

const newPackageProps = {
  main: 'dist/{main}.js',
  types: '{main}.ts'
}

export class CustomNode {
  // ...

  static async provider([envs, node]: [EnvsMain, NodeMain]) {
    const newNodeEnv = node.compose([
      node.overridePackageJsonProps(newPackageProps)
    ])

    // ...
  }
}
```
