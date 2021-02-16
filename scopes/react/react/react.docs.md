---
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
}

```

_Learn more about configuring a selected set of components, [here](https://bit.dev/teambit/workspace/variants)_

### Set the React environment to compile MDX components

> Coming Soon.

> The MDX configuration does not affect the compilation of MDX documentation files (`*.doc.mdx`), which will happen regardless.

## Extending React

Use the React environment extension API to create your own customized environment extension. The extension component can then be exported to a remote scope to make it available for reuse by other workspaces. Doing so is not only a way to save time (otherwise lost on setting up a dev environment) but also a way to maintain a consistent development environment for independent React components authored in various decoupled workspaces.

This page lists React's Environment Transformers. These are the 'override' methods that allow to add or override React's default configurations.

> #### Learn how to create a new environment extension, [here](https://bit.dev/teambit/envs/envs).

### Environment transformers

React's environment transformers enable merging new configurations for different [Bit extensions used by the React environment](/docs/environments/environment-services).

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

Overrides the Webpack configurations for the [Preview](/docs/environments/environment-services#preview) environment service, with a new ([webpack.config.js](https://webpack.js.org/configuration/)) configuration file.

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

Overrides the Webpack configurations for the [DevServer](/docs/environments/environment-services#devserver) environment service, with a new ([webpack.config.js](https://webpack.js.org/configuration/)) configuration file.

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

Overrides the default properties added to the `package.json` file of every package generated from components using this environment. Learn more about setting package properties [here](/docs/packages/publish-to-npm#packagejson).

For example:

```ts
// ...

const newPackageProps = {
  main: 'dist/{main}.js',
  types: '{main}.ts',
};

export class CustomReact {
  // ...

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    const newReactEnv = react.compose([react.overridePackageJsonProps(newPackageProps)]);

    // ...
  }
}
```

## Add composition providers

The React environment "wraps" every composition with an array of providers.
These providers can be used to render compositions in a common context (e.g, a specific canvas size), a common theme, or to provide access to mock data.

A Provider is any React component that accepts compositions as children. This component is registered using the `registerProvider`.

> Providers are part of the component compositions and documentation bundle that is served by the environment's server and rendered by the browser.
> As such, they run in the environment's **Preview** runtime and not the **Main** runtime. To learn more about runtime environments, [see here](https://bit.dev/teambit/envs/envs)

For example:

A provider that centers compositions in their rendering page, will look like so:

```tsx
import React, { ReactNode, ReactElement } from 'react';

const style = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100vh',
};

export const Center = ({ children }: { children: ReactNode }): ReactElement => {
  return <div style={style}>{children}</div>;
};
```

This provider will be registered using the `registerProvider` method in the React extension `*.preview.runtime.tsx` file:

```ts
// react-with-providers.preview.runtime.tsx

import { PreviewRuntime } from '@teambit/preview';
import { ReactAspect, ReactPreview } from '@teambit/react';
import { ReactWithProvidersAspect } from './react-with-providers.aspect';
import { Center } from './composition-providers/center';

export class ReactWithProvidersPreview {
  static runtime = PreviewRuntime;
  static dependencies = [ReactAspect];

  static async provider([react]: [ReactPreview]) {
    react.registerProvider([Center]);

    return ReactWithProvidersPreview;
  }
}

ReactWithProvidersAspect.addRuntime(ReactWithProvidersPreview);
```

**See the full demo project [here](https://github.com/teambit/react-env-with-providers)\***
