---
id: react
title: React
slug: /aspects/react
description: A Bit development environment for React Components
labels: ['react', 'env', 'typescript', 'extension']
---

The React environment spares you the overhead of setting up your own development environment for React components in a Bit workspace.
Instead, this pre-configured environment can be added to your workspace to let you instantly start working on your components.

As with any other Bit environment, the React environment is easily extendable so that you can customize it to your own needs and share it with your team to speed up development and standardize it across various decoupled workspaces.
The React environment uses various services, provided by other Bit extensions, to handle the life events of React components, managed in a Bit workspace.

#### Features

- **Blazing fast environment setup**: Setting up the React environment requires nothing more than configuring a workspace to use this Bit extension.
  Get started in seconds and focus on the thing that matters most - delivering great features.

- **Less to learn**: Using the React environment means you don't have to get into all the details of your build tooling.
  That's a especially important when onboarding a new developer to your team.

- **Customizable and extensible**: React can be extended to add or override configurations.
  Quickly add your own modifications to get a React environment "flavour" that best suits your needs.
  Export your React environment extension to a remote scope to have it available to all your team.

- **Standardized development**: Use the React environment to maintain consistency in development across multiple decoupled Bit workspaces.

- **Easy to maintain**: Get React's latest updates with just a simple `bit import` command. Roll-back as easily, if needed.

## Quickstart & configuration

> To use the React environment, set it in the `workspace.jsonc` configuration file. React can only be configured using the 'variants' config API.

### Use React as the default environment

Apply the React environment on all components in the workspace, using the wildcard character `*`.

```json
{
  "teambit.workspace/variants": {
    "*": {
      "teambit.react/react": {}
    }
  }
}
```

### Use React on a specific group of components

Apply the React environment on a limited set of components. For example, all components inside the `components/react-ui` directory.

```json
{
  "teambit.workspace/variants": {
    "components/react-ui": {
      "teambit.react/react": {}
    }
  }
}
```

### Set the React environment to compile MDX components

> The MDX configuration does not affect the compilation of MDX documentation files (`*.doc.mdx`), which will happen regardless.

## Extending React

Use the React environment extension API to create your own customized environment extension. The extension component can then be exported to a remote scope to make it available for reuse by other workspaces. Doing so is not only a way to save time (otherwise lost on setting up a dev environment) but also a way to maintain a consistent development environment for independent React components authored in various decoupled workspaces.

This page lists React's Environment Transformers. These are the 'override' methods that allow to add or override React's default configurations.

### Environment transformers

React's environment transformers enable merging new configurations for different Bit extensions used by the React environment.

The process of 'merging' or 'overriding' adds new properties to the existing configurations. In case of a conflict between two properties, the extension's configurations will override the extended environment's defaults.

#### overrideTsConfig

```ts
overrideTsConfig(tsconfig: TsConfigSourceFile): EnvTransformer
```

Overrides the environment's default TypeScript configurations with a new ([tsconfig.json](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html)) configuration file.

For example:

```ts
// ...

const tsconfig = require('./typescript/tsconfig.json');

export class ReactExtension {

// ...

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const newReactEnv = react.compose([
      react.overrideTsConfig(tsconfig)
    ]);
}

// ...
```

#### overridePreviewConfig

```ts
overridePreviewConfig(config: Configuration): EnvTransformer
```

Overrides the Webpack configurations for the 'Preview' environment service, with a new ([webpack.config.js](https://webpack.js.org/configuration/)) configuration file.

For example:

```ts
// ...

const webpackConfig = require('./webpack/webpack.config');

export class ReactExtension {

// ...

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const newReactEnv = react.compose([
      react.overridePreviewConfig(webpackConfig)
    ]);
}

// ...
```

#### overrideDevServerConfig

```ts
overrideDevServerConfig(config: Configuration): EnvTransformer
```

Overrides the Webpack configurations for the 'DevServer' environment service, with a new ([webpack.config.js](https://webpack.js.org/configuration/)) configuration file.

For example:

```ts
// ...

const webpackConfig = require('./webpack/webpack.config');

export class ReactExtension {

// ...

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const newReactEnv = react.compose([
      react.overrideDevServerConfig(webpackConfig)
    ]);
}

// ...
```

#### overrideJestConfig

```ts
overrideJestConfig(jestConfigPath: string): EnvTransformer
```

This method receives a path (as a string) to a configuration file . Overrides the default configurations for the Jest test runner with a new ([jest.config](https://jestjs.io/docs/en/configuration)) configuration file. This is done by passing the _path_ to the file as an argument.

For example:

```ts
// ...

export class ReactExtension {

// ...

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const newReactEnv = react.compose([
      react.overrideJestConfig(require.resolve('./jest/jest.config'))
    ]);
}

// ...
```

#### overrideDependencies

```ts
overrideDependencies(dependencyPolicy: DependenciesPolicy): EnvTransformer
```

This method receives a Bit dependency-policy object. It overrides the default dependency policy for components using this environment.
As with any other 'override' method, it will only replace conflicting configurations (from React's default configuration) and accept those that do not conflict.

Each key-value pair in a dependency-policy object signifies the package and the version to be used. It also uses the `-` notation to signify a module should not be defined as a dependency of a certain type (dev, peer or standard).

For example:

```js
// ...

const newDependencies = {
      dependencies: {
        react: '-',
      },
      devDependencies: {
        '@types/react': '16.9.43',
        '@types/jest': '~26.0.9',
        '@types/mocha': '-',
        '@types/react-router-dom': '^5.1.5',
      },
      peerDependencies: {
        react: '^16.13.1',
        'react-dom': '^16.13.1',
      },
    };
}

export class CustomReact {

  // ...

  static async provider([envs, react]: [EnvsMain, ReactMain]) {

    const newReactEnv = react.compose([
      react.overrideDependencies(newDependencies)
    ]);

    // ...

  }
}
```

> The above example shows the 'react' library being removed as a (runtime) dependency and added as a peer dependency.

##### Handling multiple peer dependencies in a workspace with multiple environments

Peer dependencies assume a single “hosting code”, a single application. A Bit workspace is not a single “host”.
It may create multiple “hosts” as each "application" is generated by a different Bit environment (that's what gives us the freedom to author and explore components of all sorts of types in one single workspace).
That means different "hosts", different environments, may have the same package defined as a peer dependency only with different versions.
To prevent such conflicts, set the `resolveFromEnv` property of that dependency as `true`.
This will make sure to install the needed peer dependency in a directory set by the environment.
It will then resolve the path to the env's installed package, and create a symlink to it in the `node_modules` directory of each component requiring it (this ensures a single and common instance for all components using that env).
Each component will only use the package relevant to its environment.

For example:

```js
const newDependencies = {
      peerDependencies: {
        'enzyme': {
          version: '^3.11.0',
          resolveFromEnv: true
        }
      },
    };
}
```

#### overridePackageJsonProps

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

export class CustomReact {
  // ...

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const newReactEnv = react.compose([
      react.overridePackageJsonProps(newPackageProps)
    ])

    // ...
  }
}
```

## Add composition providers

The React environment "wraps" every composition with an array of providers.
These providers can be used to render compositions in a common context (e.g, a specific canvas size), a common theme, or to provide access to mock data.

A Provider is any React component that accepts compositions as children. This component is registered using the `registerProvider`.

> Providers are part of the component compositions and documentation bundle that is served by the environment's server and rendered by the browser.
> As such, they run in the environment's **Preview** runtime and not the **Main** runtime.

For example:

A provider that centers compositions in their rendering page, will look like so:

```tsx
import React, { ReactNode, ReactElement } from 'react'

const style = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh'
}

export const Center = ({ children }: { children: ReactNode }): ReactElement => {
  return <div style={style}>{children}</div>
}
```

This provider will be registered using the `registerProvider` method in the React extension `*.preview.runtime.tsx` file:

```ts
// react-with-providers.preview.runtime.tsx

import { PreviewRuntime } from '@teambit/preview'
import { ReactAspect, ReactPreview } from '@teambit/react'
import { ReactWithProvidersAspect } from './react-with-providers.aspect'
import { Center } from './composition-providers/center'

export class ReactWithProvidersPreview {
  static runtime = PreviewRuntime
  static dependencies = [ReactAspect]

  static async provider([react]: [ReactPreview]) {
    react.registerProvider([Center])

    return ReactWithProvidersPreview
  }
}

ReactWithProvidersAspect.addRuntime(ReactWithProvidersPreview)
```

**See the full demo project [here](https://github.com/teambit/react-env-with-providers)\***

The React environment is an implementation of the Environments aspect. It is a one-stop-shop for React components in a Bit workspace. It uses various services, provided by other aspects, to handle the life events of React components, managed in a Bit workspace. Think of it as a 'create-react-app' for independent React components.

The React environment spares you the overhead of setting up your own React environment and creates a standardized and shareable development environment for you and your team.

## Default configurations

### Tester

- Uses Jest as a test runner
- Test files: `*.spec.*` and `*.test.*`
- `@testing-library/react` pre-configured

### Compiler

- Uses two compilers:
  - TypeScript for `*.ts`, `*.js`, `*.jsx`, `*.tsx`
  - Babel (with MDX-loader) for `*.md`, `*.mdx`

### Bundler (for 'Preview' and 'DevServer')

Uses Webpack.

Includes the following file types:

`*.web.mjs`, `*.mjs`, `*.js`, `*.ts`, `*.tsx`, `*.jsx`, `*.mdx`, `*.md`, `*.(module.)css`, `*.(module.)scss`, `*.(module.)sass`, `*.(module.)less`

### Default dependencies (for components handled by the environment)

```js
{
      dependencies: {
        react: '-',
        'core-js': '3.8.3',
      },
      devDependencies: {
        '@types/node': '12.20.4',
        '@types/react': '16.9.43',
        '@types/jest': '26.0.20',
        '@types/mocha': '-',
        '@types/react-router-dom': '5.1.7',
        '@babel/runtime': '7.12.18',
      },
      peerDependencies: {
        react: '16.13.1',
        'react-dom': '16.13.1',
      },
};

```

> The `-` sign indicates a dependency is removed by the environment. 'react' is configured as a peer dependency instead of a (runtime) dependency.

### Development files

The React environment treats the following files as development files: `*.doc.*`, `*.spec.*`, `*.test.*`, `*.composition.*`, `*.compositions.*`.

Dependencies of development files will be recognized and registered as development dependencies (`devDependencies`).

## Using React

To use the React environment, set it in the `workspace.jsonc` configuration file. React can only be configured using the 'variants' config API.

### Use React as the default environment

Apply the React environment on all components in the workspace, using the wildcard character `*`.

```json title="workspace.jsonc"
{
  "teambit.workspace/variants": {
    "*": {
      "teambit.react/react": {}
    }
  }
}
```

### Use React on a specific group of components

Apply the React environment on a limited set of components. For example, all components inside the components/react-ui directory.

```json title="workspace.jsonc"
{
  "teambit.workspace/variants": {
    "components/react-ui": {
      "teambit.react/react": {}
    }
  }
}
```

## Extending React

Use the React environment extension API to create your own customized environment extension. The extension component can then be exported to a remote scope to make it available for reuse by other workspaces. Doing so is not only a way to save time (otherwise lost on setting up a dev environment) but also a way to maintain a consistent development environment for independent React components authored in various decoupled workspaces.

This page lists React's Environment Transformers. These are the 'override' methods that allow to add or override React's default configurations.

## Environment transformers

React's environment transformers enable merging new configurations for different Bit aspects used by the React environment

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

export class ReactExtension {

// ...

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const newReactEnv = react.compose([
      react.overrideTsConfig(tsconfig)
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

export class ReactExtension {

// ...

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const newReactEnv = react.compose([
      react.overridePreviewConfig(webpackConfig)
    ]);


}

// ...
```

### overrideDevServerConfig

```ts
overrideDevServerConfig(config: Configuration): EnvTransformer
```

Overrides the Webpack configurations for the [DevServer](/building-with-bit/environments#devserver) environment service, with a new ([webpack.config.js](https://webpack.js.org/configuration/)) configuration file.

For example:

```ts
// ...

const webpackConfig = require('./webpack/webpack.config');

export class ReactExtension {

// ...

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const newReactEnv = react.compose([
      react.overrideDevServerConfig(webpackConfig)
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

export class ReactExtension {

// ...

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const newReactEnv = react.compose([
      react.overrideJestConfig(require.resolve('./jest/jest.config'))
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

export class CustomReact {
  // ...

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    // Get the environment's default build pipeline using the 'getBuildPipe' service handler
    const reactPipe = react.env.getBuildPipe()

    // Add the custom task to the end of the build tasks sequence.
    const tasks = [...reactPipe, new CustomTask()]

    const newReactEnv = react.compose([react.overrideBuildPipe(tasks)])

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
      dependencies: {
        react: '-',
      },
      devDependencies: {
        '@types/react': '16.9.43',
        '@types/jest': '~26.0.9',
        '@types/mocha': '-',
        '@types/react-router-dom': '^5.1.5',
      },
      peerDependencies: {
        react: '^16.13.1' || this.config.reactVersion,
        'react-dom': '^16.13.1',
      },
    };
}

export class CustomReact {

  // ...

  static async provider([envs, react]: [EnvsMain, ReactMain]) {

    const newReactEnv = react.compose([
      react.overrideDependencies(newDependencies)
    ]);

    // ...

  }
}
```

:::note removing a dependency
The above example shows the 'react' library being removed as a (runtime) dependency and added as a peer dependency.
:::

#### Handling multiple peer dependencies in a workspace with multiple environments

Peer dependencies assume a single “hosting code”, a single application. A Bit workspace is not a single “host”.
It may create multiple “hosts” as each "application" is generated by a different Bit environment (that's what gives us the freedom to author and explore components of all sorts of types in one single workspace).
That means different "hosts", different environments, may have the same package defined as a peer dependency only with different versions. To prevent such conflicts, set the `resolveFromEnv` property of that dependency as `true`.
This will make sure to install the needed peer dependency in a directory set by the environment. It will then resolve the path to the env's installed package, and create a symlink to it in the `node_modules` directory of each component requiring it (this ensures a single and common instance for all components using that env).
Each component will only use the package relevant to its environment.

For example:

```js
const newDependencies = {
      peerDependencies: {
        'enzyme': {
          version: '^3.11.0',
          resolveFromEnv: true
        }
      },
    };
}
```

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

export class CustomReact {
  // ...

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const newReactEnv = react.compose([
      react.overridePackageJsonProps(newPackageProps)
    ])

    // ...
  }
}
```

## Composition Providers

The React environment "wraps" every composition with an array of providers.
These providers can be used to render compositions in a common context such as a theme or data that needs to be globally available.

A Provider is any React component that accepts compositions as children. This component is registered using the `registerProvider`.

:::info
Providers are part of the component compositions and documentation bundle that is served by the environment's server and rendered by the browser.
As such, they run in the environment's Preview runtime and not the Main runtime.
:::

For example, a provider that centers compositions in their rendering page, will look like so:

```tsx title="A composition provider example"
import React, { ReactNode, ReactElement } from 'react'

const style = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh'
}

export const Center = ({ children }: { children: ReactNode }): ReactElement => {
  return <div style={style}>{children}</div>
}
```

This provider will be registered using the registerProvider method in the React extension `*.preview.runtime.tsx` file:

```tsx title="react-with-providers.preview.runtime.tsx"
import { PreviewRuntime } from '@teambit/preview'
import { ReactAspect, ReactPreview } from '@teambit/react'
import { ReactWithProvidersAspect } from './react-with-providers.aspect'
import { Center } from './composition-providers/center'

export class ReactWithProvidersPreview {
  static runtime = PreviewRuntime
  static dependencies = [ReactAspect]

  static async provider([react]: [ReactPreview]) {
    react.registerProvider([Center])

    return ReactWithProvidersPreview
  }
}

ReactWithProvidersAspect.addRuntime(ReactWithProvidersPreview)
```

- See the full demo project [here](https://github.com/teambit/react-env-with-providers).

## Customizing the Tester

The Tester is an Environment Service that enables environments to integrate a specific test runner into various Bit features, processes and events.

For example, the React environment (`@teambit.react/react`) uses the Tester Environment Service to configure the Jest extension component as its test runner. Jest will be used (for components using this environment) when running the `bit test` command, when running the build process and will even display its results in the Workspace UI (just to name a few examples).

To customize your environment's test runner, first create an environment extension. This will be a new Bit component the uses an existing environment to extend and customize it to your own needs.

> As an example, we'll extend Bit's out-of-the-box React environment (`@teambit.react/react`).

## Create a new extension component

### Create the environment extension files

```shell
// In the workspace's root directory
$ mkdir -p extensions/custom-react
$ touch extensions/custom-react/react.extension.ts
$ touch extensions/custom-react/index.ts
```

### Option #1: Override the environment's default tester configurations

Import the environment to be extended and customize its tester configurations.

In this example, we'll extend the React environment and customize its test runner configurations. We will set new Jest configurations by creating a new [`jest.config.js`](https://jestjs.io/en/configuration) configuration file to override the one used by the environment.

> Different environments may expose different Environment Transformers (i.e., 'override' methods) to customize the configurations set on the specific test runner used by them. <br /> <br />
> For a list of all available Transformers see your environment's documentation.

```typescript title="custom-react.extension"
import { EnvsMain, EnvsAspect } from '@teambit/envs'
import { ReactAspect, ReactMain } from '@teambit/react'

export class CustomReactExtension {
  constructor(private react: ReactMain) {}

  static dependencies: any = [EnvsAspect, ReactAspect]

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const customReactEnv = react.compose([
      // Override the environment's default Jest configuration by providing the path to its config file.
      react.overrideJestConfig(require.resolve('./jest.config'))
    ])

    envs.registerEnv(customReactEnv)

    return new CustomReactExtension(react)
  }
}
```

```js title="jest.config.js"
module.exports = {
  transformIgnorePatterns: [
    '[/\\\\]node_modules[/\\\\].+\\.(js|jsx|ts|tsx)$',
    '^.+\\.module\\.(css|sass|scss|less)$'
  ]
}
```

```ts title="index.ts"
import { CustomReactExtension } from './custom-react.extension'
export { CustomReactExtension }
export default CustomReactExtension
```

The above example overrides the ["transformIgnorePatterns"](https://jestjs.io/en/configuration#transformignorepatterns-arraystring) property for Jest's configuration file (`jest.config.js`) used by the environment.

The new `jest.config.js` file does not replace the default one but merges into it (and therefor only configures the properties to override). Since the "transformIgnorePatterns" property conflicts with the one set by the environment, it replaces it. In cases where there is no conflict between two properties, the override property will simply be added to the default configuration file.

> Do not use the configuration file to set the pattern for your test files names. Instead, use the Tester workspace config API.

### Option #2: Replace the test runner used by the environment

Environments use Environment Services by implementing a special class of methods called Service Handlers.

An environment's test runner can be replaced by overriding its Tester Service Handler method (`getTester()`).

For example, the code below shows a React environment extension that replaces its default compiler, Jest, with Mocha.

```tsx title="custom-react.extension"
import { EnvsMain, EnvsAspect } from '@teambit/envs'
import { ReactAspect, ReactMain } from '@teambit/react'
// Import the Mocha extension component to configure it and set it as the new test runner
import { MochaAspect, MochaMain } from '@teambit.defender/mocha'

export class CustomReactExtension {
  constructor(private react: ReactMain) {}

  // Set the necessary dependencies to be injected (by Bit) into the following 'provider' function
  static dependencies: any = [EnvsAspect, ReactAspect, MochaAspect]

  static async provider([envs, react, mocha]: [
    EnvsMain,
    ReactMain,
    MochaMain
  ]) {
    // Create a new Mocha tester
    const mochaTestRunner = mocha.createTester({})

    const testerOverride = envs.override({
      getTester: () => {
        return mochaTestRunner
      }
    })

    const customReactEnv = react.compose([testerOverride])

    envs.registerEnv(customReactEnv)

    return new CustomReactExtension(react)
  }
}
```

```ts title="index.ts"
import { CustomReactExtension } from './custom-react.extension'
export { CustomReactExtension }
export default CustomReactExtension
```

## Customize the Compiler

The Compiler is an Environment Service that enables environments to integrate a specific compiler into various Bit features, processes and events.

For example, the React environment (`@teambit.react/react`) uses the Compiler Environment Service to configure the TypeScript extension component as its compiler. The TypeScript compiler will be used (for components using this environment) when running the `bit compile` command, when Bit's development server re-compiles modified components, and when running the build process (just to name a few examples).

To customize your environment's compiler, first create an environment extension. This will be a new Bit component the uses an existing environment to extend and customize it to your own needs.

> As an example, we'll extend Bit's out-of-the-box React environment (`@teambit.react/react`).

## Create a new extension component

### Create the environment extension files

```shell
// In the workspace's root directory
$ mkdir -p extensions/custom-react
$ touch extensions/custom-react/react.extension.ts
$ touch extensions/custom-react/index.ts
```

### Option #1: Override the environment's default compiler configurations

Import the environment to be extended and customize its compiler configurations.

In this example, we'll extend the React environment and customize its TypeScript compiler configurations. We will set new TypeScript configurations by creating a new `tsconfig.json` configuration file to override the one used by the environment.

> Different environments may expose different Environment Transformers (i.e., 'override' methods) to customize the configurations set on the specific compiler used by them. <br /> <br />
> For a list of all available Transformers see your environment's documentation.

```typescript
import { EnvsMain, EnvsAspect } from '@teambit/envs'
import { ReactAspect, ReactMain } from '@teambit/react'

export class CustomReactExtension {
  constructor(private react: ReactMain) {}

  // The new TS configuration for this extension
  newTsConfig = require('./tsconfig.json')

  static dependencies: any = [EnvsAspect, ReactAspect]

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const customReactEnv = react.compose([
      // Override the environment's default TypeScript configuration
      react.overrideTsConfig(newTsConfig)
    ])

    envs.registerEnv(customReactEnv)

    return new CustomReactExtension(react)
  }
}
```

```json
{
  "compilerOptions": {
    "target": "ES3"
  }
}
```

```ts
import { CustomReactExtension } from './custom-react.extension'
export { CustomReactExtension }
export default CustomReactExtension
```

The above example overrides the ["target"](https://www.typescriptlang.org/tsconfig#target) property for the TypeScript compiler configuration file (`tsconfig.json`) used by the environment.

The new `tsconfig.json` file does not replace the default one but merges into it (and therefor only configures the properties to override). Since the "target" property conflicts with the one set by the environment, it replaces it. In cases where there is no conflict between two properties, the override property will simply be added to the default configuration file.

### Option #2: Replace the compiler used by the environment

Environments use Environment Services by implementing a special class of methods called Service Handlers

An environment's compiler can be replaced by overriding its Compiler Service Handler method (`getCompiler()`).

For example, the code below shows a React environment extension that replaces its default compiler, TypeScript, with Babel.

```tsx
import { EnvsMain, EnvsAspect } from '@teambit/envs'
import { ReactAspect, ReactMain } from '@teambit/react'
// Import the Babel extension component to configure it and set it as the new compiler
import { BabelAspect, BabelMain } from '@teambit.compilation/babel'

const babelConfig = require('./babel-config')

export class CustomReactExtension {
  constructor(private react: ReactMain) {}

  // Set the necessary dependencies to be injected (by Bit) into the following 'provider' function
  static dependencies: any = [EnvsAspect, ReactAspect, BabelAspect]

  static async provider([envs, react, babel]: [
    EnvsMain,
    ReactMain,
    BabelMain
  ]) {
    // Instantiate a new Babel compiler with the 'babelConfig' configurations
    const babelCompiler = babel.createCompiler({
      babelTransformOptions: babelConfig
    })

    const compilerOverride = envs.override({
      getCompiler: () => {
        return babelCompiler
      }
    })

    const customReactEnv = react.compose([compilerOverride])

    envs.registerEnv(customReactEnv)

    return new CustomReactExtension(react)
  }
}
```

```ts
import { CustomReactExtension } from './custom-react.extension'
export { CustomReactExtension }
export default CustomReactExtension
```

#### Multi-Compiler

The Multi-compiler is a Bit extension component that enables the use of multiple compilers in a single environment.

For example:

```typescript
import { EnvsMain, EnvsAspect } from '@teambit/envs'
import { ReactAspect, ReactMain } from '@teambit/react'
// Import the Babel extension component
import { BabelAspect, BabelMain } from '@teambit.compilation/babel'
// Import the TypeScript extension component
import {
  TypeScriptAspect,
  TypeScriptMain
} from '@teambit.typescript/typescript'
// Import the multi-compiler extension
import {
  MultiCompilerAspect,
  MultiCompilerMain
} from '@teambit.compilation/multi-compiler'

export class CustomReactExtension {
  constructor(private react: ReactMain) {}

  // Set the necessary dependencies to be injected (by Bit) into the following 'provider' function
  static dependencies: any = [
    EnvsAspect,
    ReactAspect,
    BabelAspect,
    TypeScriptAspect,
    MultiCompilerAspect
  ]

  static async provider([envs, react, babel, typescript, multiCompiler]: [
    EnvsMain,
    ReactMain,
    BabelMain,
    TypeScriptMain,
    MultiCompilerMain
  ]) {
    // Create a new composition of compilers
    const compilers = multiCompiler.createCompiler([
      createBabelCompiler(),
      createTsCompiler()
    ])

    // Override the environment's Compiler Service Handler
    const compilerOverride = envs.override({
      getCompiler: () => {
        return compilers
      }
    })

    // Compose all Environment Transformers into a single environment
    const customReactEnv = react.compose([compilerOverride])

    envs.registerEnv(customReactEnv)

    return new CustomReactExtension(react)
  }
}
```

> When using multiple compilers, make sure they target exclusive sets of file types. This is done using the compilers' `isFileSupported()` API.
