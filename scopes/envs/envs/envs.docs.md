---
description: Manages Environments and Environment Services
labels: ['environments', 'core aspect']
---

The Envs aspect runs Bit environments and environment services, and defines their structure.

A Bit environment is a development environment encapsulated in a Bit component. Just like other components, Bit environments can be instantly added to your workspace to start developing, testing, and building components with zero configurations.
Different environments can be easily applied to multiple components in a workspace, and can be easily extended or customized to fit your needs and development stack. For example, try the React environment to start developing React components in your workspace.
Like all Bit components, Bit environments are reusable, so you can share them across projects and teams to greatly speed up and standardize development.

#### Example

```json
// Using the 'Node' and 'React' environments for different components in a Bit workspace.
{
  "teambit.workspace/variants": {
    "components/ui": {
      "teambit.react/react": {}
    },
    "components/utils": {
      "teambit.harmony/node": {}
    }
  }
}
```

#### Features

- **Blazing fast environment setup**: Setting up an environment requires nothing more than configuring a workspace to use a Bit extension.
  Get started in seconds and focus on the thing that matters most - delivering great features.

- **Multiple environments in a single workspace**: No need to constantly switch between workspaces as different environments,
  set to handle different components, can all be used in parallel in a single workspace.

- **Less to learn**: Using a pre-configured environment extension means you don't have to get into all the details of your build tooling.
  That's a especially important when onboarding a new developer to your team.

- **Customizable and extensible**: Environments can be extended to add or override configurations.
  Quickly add your own modifications to get an environment that best suits your needs.
  Export your environment extension to a remote scope to have it available to all your team.

- **Standardized development**: Sharing and reusing environments makes it easier to maintain consistency in development across multiple decoupled Bit workspaces.

- **Easy to maintain**: Get your environment's latest updates with just a simple `bit import` command. Roll-back as easily, if needed.

## CLI reference

Bit environments make use of Bit's CLI to execute their different services. That means, `bit test`, for example, may execute different test runners, depending on the environment in use.

#### start

Runs the development serve (that includes running the Workspace UI).

```shell
// run the dev server
$ bit start
```

_Learn more [here](https://bit.dev/teambit/compilation/bundler)._

#### build

Runs the build pipeline (without tagging components with a new release version).

```shell
$ bit build
```

_Learn more [here](https://bit.dev/teambit/pipelines/builder)._

#### test

Runs all tests.

```shell
$ bit test
```

_Learn more [here](https://bit.dev/teambit/defender/tester)._

#### compile

Compiles all components.

```shell
$ bit compile
```

_Learn more [here](https://bit.dev/teambit/compilation/compiler)._

#### lint

Get lint results for all components.

```shell
$ bit lint
```

_Learn more [here](https://bit.dev/teambit/defender/linter)_.

## Usage

### Setting a default environment for the workspace

Environments can only be configured using the `teambit.workspace/variants` workspace API. That means the `teambit.workspace/workspace` cannot be utilized to set an environment as the default for all components. To achieve a similar result, select all components using the `*` wildcard.

For example:

```json
{
  "teambit.workspace/variants": {
    "*": {
      "teambit.react/react": {}
    }
  }
}
```
> <p style={{color: '#c31313'}}>Never use the '*' wildcard in a workspace that uses multiple environments!</p> 
Instead, use exclusive namespaces or directories to select and configure each group of components to use its own environment (see an example in the next section).
<br />
<br /> 
To learn more, see the 'Troubleshooting' section.

> A single component (with the same version) cannot use more than a single environment.

### Setting multiple environments

A single workspace can use different environments for different sets of components. Setting an environment on a specific group of components is done by selecting the group and applying the environment. This is done using `teambit.workspace/variants`. To learn more about using 'variant' to select components, [see here](/docs/workspace/cascading-rules)

For example, to set the Node and React environments on two sets of components (selected by their directory):

```json
{
  "teambit.workspace/variants": {
    "components/ui": {
      "teambit.react/react": {}
    },
    "components/utils": {
      "teambit.harmony/node": {}
    }
  }
}
```

### Extending an environment

> This section goes through the steps of extending the 'main runtime'. 
See the 'Runtime Environment' section to learn how to extend multiple runtime environments.

An environment extension is a component that extends an existing environment. An extension file will have the `.extension.ts` suffix as a convention.

> The `*.extensions.ts` pattern should only be used when no other 'runtime environment' is being extended other than the 'main runtime.' For more details, see the 'runtime environments' section.

To create and use an environment extension:

1. Create the extension files
2. Use and extend an existing environment
3. Track the new component
4. Use the new extension component ID to set it in the workspace configuration file
5. (Optional) Tag the new component
6. (Optional) Export the component the make it available to be used by others

#### 1. Create the environment extension files

We'll start by creating a new extension:

```shell
// In the workspace's root directory
$ mkdir -p extensions/custom-react
$ touch extensions/custom-react/custom-react.extension.ts
$ touch extensions/custom-react/index.ts
```

#### 2. Use an existing environment to extend it

> The below code uses the React environment as an example.

Our files will have the following code (the code below will only extend the `@teambit.react/react` environment without changing its configurations):

```tsx
// custom-react.extension.ts

// Import from the Environments aspect to register this extension as an environment
import { EnvsMain, EnvsAspect } from '@teambit/envs';
// Import from the React aspect to extend it
import { ReactAspect, ReactMain } from '@teambit/react';

export class CustomReactExtension {
  constructor(private react: ReactMain) {}

  // Set the necessary dependencies to be injected (by Bit) into the following 'provider' function
  static dependencies: any = [EnvsAspect, ReactAspect];

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    // The 'compose' methods to compose the overrides into a single environment
    const customReactEnv = react.compose([
      // This is were the environment's 'transformers' will be used to customize it
    ]);

    // Register this extension as an environment using the "registerEnv" slot (provided by the Environments aspect).
    envs.registerEnv(customReactEnv);

    return new CustomReactExtension(react);
  }
}
```

```ts
// index.ts

import { CustomReactExtension } from './custom-react.extension';
export { CustomReactExtension };
export default CustomReactExtension;
```

#### 3. Track the extension component

We'll then track the new component (with the 'my-extensions' namespace):

```shell
$ bbit add extensions/custom-react -n my-extensions
```

#### 4. Set the extension component in the workspace config file

Our extension component now has a component ID that can be used in our `workspace.jsonc` configuration file:

```json
{
  "teambit.workspace/workspace": {
    "name": "my-workspace",
    "icon": "https://image.flaticon.com/icons/svg/185/185034.svg",
    "defaultScope": "my-org.my-extensions"
  },
  "teambit.workspace/variants": {
    "*": {
      "my-org.my-extensions/custom-react": {}
    }
  }
}
```

### The anatomy of an environment extension

An environment extension uses the following Bit components to extend an existing environment, and to register itself as an environment:

- The **"base" environment** (e.g, `@teambit/react`) is extended and customized using its override methods. Each override method, or "environment transformer", corresponds to a Bit extension component used by the environment (e.g, the TypeScript component). Using an 'environment transformer' will add new configurations to the relevant Bit component and will override any conflicting ones.<br /> The full list of available 'environment transformers' can be seen in the specific environment's documentation (see: React, React Native, Node).

- The **'Environments' component** (`@teambit/envs`) is used to:
  1. Register the new environment using its [slot](TODO)
  2. Override a ["service handler"](TODO). This is done to replace a Bit component used by an environment service. For example, to set the "compiler" service handler to use Babel instead of TypeScript (see an example, [here](/docs/environments/build-environment#override-a-service-handler)).

#### Override the config for a Bit component used by the environment

> The current Envs API will soon be replaced. 

The example below is of a React environment extension. This new environment overrides React's DevServer configuration by setting a new Webpack configuration file.

```tsx
// custom-react.extension.ts

// Import from the Environments aspect to register this extension as an environment
import { EnvsMain, EnvsAspect } from '@teambit/envs';
// Import from the React aspect to extend it and override its DevServer config
import { ReactAspect, ReactMain } from '@teambit/react';

const newWebpackConfig = require('./webpack/new-webpack-config');

export class CustomReactExtension {
  constructor(private react: ReactMain) {}

  // Set the necessary dependencies to be injected (by Bit) into the following 'provider' function
  static dependencies: any = [EnvsAspect, ReactAspect];

  static async provider([envs, react]: [EnvsMain, ReactMain]) {
    // The 'compose' methods to compose the overrides into a single environment
    const customReactEnv = react.compose([

      // Override the Webpack configs of the DevServer aspect
      react.overrideDevServerConfig(newWebpackRules);

    ]);

    // Register this extension as an environment using the "registerEnv" slot (provided by the Environments aspect).
    envs.registerEnv(customReactEnv);

    return new CustomReactExtension(react);
  }
}
```

```ts
// index.ts
import { CustomReactExtension } from './custom-react.extension';
export { CustomReactExtension };
export default CustomReactExtension;
```

> The 'provider' method will be executed by Bit. Its Bit aspects dependencies are set in the `dependencies` variable, and will be injected into the method upon execution.

#### Override a 'service handler' to replace a component used by the environment

The example below is of a React environment extension. This new environment overrides the 'service handler' for the compiler service. It replaces the Bit aspect used by it, TypeScript, with another Bit aspect, Babel.

```tsx
// custom-react.extension.ts

// Import from the Environments aspect to register this extension as an environment
import { EnvsMain, EnvsAspect } from '@teambit/envs';
// Import from the React aspect to extend it and override its DevServer config
import { ReactAspect, ReactMain } from '@teambit/react';
// Import the Babel aspect to configure it and set it as the new compiler
import { BabelAspect, BabelMain } from '@teambit.compilation/babel';

const babelConfig = require('./babel/babel-config');

export class CustomReactExtension {
  constructor(private react: ReactMain) {}

  // Set the necessary dependencies to be injected (by Bit) into the following 'provider' function
  static dependencies: any = [EnvsAspect, ReactAspect, BabelAspect];

  static async provider([envs, react, babel]: [
    EnvsMain,
    ReactMain,
    BabelMain
  ]) {
    // Create a new Babel compiler with the 'babelConfig' configurations
    const babelCompiler = babel.createCompiler({
      babelTransformOptions: babelConfig,
    });

    // Use the 'override' method provided by the 'environments' aspect (not the React aspect)
    const compilerOverride = envs.override({
      getCompiler: () => {
        return babelCompiler;
      },
    });

    // Compose the overrides into a single environment
    const customReactEnv = react.compose([compilerOverride]);

    // Register this extension as an environment using the "registerEnv" slot (provided by the 'environments' aspect).
    envs.registerEnv(customReactEnv);

    return new CustomReactExtension(react);
  }
}
```

```ts
// index.ts
import { CustomReactExtension } from './custom-react.extension';
export { CustomReactExtension };
export default CustomReactExtension;
```

## Concepts and tools

### Environment Services

To become a "one-stop-shop" for components, an environment "bundles" together different Environment Services provided by various Bit aspect components. These Environment Services enable other Bit aspects to integrate into Bit's component life-cycle features.

For example, the 'Tester' service (`@teambit.defender/tester`) enables the React environment (`@teambit.react/react`) to set 'Jest' (`teambit.defender/jest`) as the default test runner for its components. This will enable Jest to be executed on the `bbit test` command, to be run as a pre-tag check, to output results using Bit's logger, and even to display the generated logs in the Workspace and Scope UIs (to name just a few examples).

<img
src="https://storage.googleapis.com/docs-images/react_env_ex.png"
alt="React env using Jest with the tester service"
style={{width: '50%', minWidth: 500}}></img>

> ##### Services VS Build Tasks
>
> Environment Services which are executed either by the development server, or via the CLI, are not identical
> to Build Tasks that run as part of the Build Pipeline.
> For example, the TypeScript configurations used for compilation by the development server are not the same as the ones used for a component's build process.
> [See here](https://bit.dev/teambit/pipelines/builder), to learn more about the Build Pipeline.

#### Compiler

Runs the environment's selected compiler (for example, TypeScript).

#### Tester

Runs the environment's selected test runner (for example, Jest)

#### Linter

Runs the environment's selected linter (for example, ESLint)

#### Documentation

Sets the template for the auto-generated component documentation, as well as the API for customizing component docs.

#### Build pipeline (CI)

Sets the sequence of build tasks to run before a component is tagged with a new version.

#### DevServer

Bundles all components and runs a server to display them, live (using "hot reloading") in the workspace UI. This includes rendering the 'compositions' as well as the documentation shown in the 'Overview' tab.

> Even though different types of components, e.g. React and Node components, run on different servers (one for each environment) the workspace is explored and navigated through as if it where a single server.

#### Package

Generates the node module package for components, with properties set by the environment.

#### Dependencies

Sets the default dependencies (as well as their version and type) for each component handled by the environment. That includes peer dependencies used for runtime (for example, `react-dom`) and dev dependencies (for example, `@types/react`).

#### Bundler

Bundles components (compositions, docs, etc.) using the environment's bundler and bundling configurations. The generated assets are use both in development (when running the development server) and when exploring component's tagged releases (for example, in the scope UI).

### Service Handlers

Service Handlers are the link that binds an environment to the various Environment Services. They are methods in the Environment class that set an Environment Service to use a specific Bit extension component or a configuration file.

For example, the React environment uses the Service Handler `getCompiler()` to configure the Compiler Environment Service to run the TypeScript extension component.

Environment services run on various events. Whenever a service runs, it executes its corresponding service handler which consequently runs the configured aspect (in the previous example, that would be TypeScript).

Different components in a Bit workspace may use different environments. That means environment services need to execute their corresponding service handlers in the specific environment applied on the component currently being processed.

For example, if _component A_ uses the Node environment then the Compiler service processing that component, will execute the Service Handler (in that case, `getCompiler`) found in the Node environment.

### List of service handlers

#### getTester

```ts
getTester(...args : any[]): Tester
```

Returns a test runner to be used by the Tester service.

For example:

```ts
export class ReactEnv implements Environment {
  constructor(
    // ...

    // The Jest Aspect
    private jestAspect: JestMain
  ) {}

  // ...

  getTester(jestConfigPath: string, jestModule = jest): Tester {
    const jestConfig = require.resolve('./jest/jest.config');
    return this.jestAspect.createTester(jestConfig);
  }
}
```

#### getCompiler

```ts
getCompiler(...args : any[]): Compiler
```

Returns a compiler to be used by the Compiler service.

For example:

```ts
export class ReactEnv implements Environment {

constructor(
    // ...

    // The TypeScript aspect
    private tsAspect: TypescriptMain
){}

// ...

getCompiler() {
    const tsConfig = require.resolve('./typescript/tsconfig.json')
    return this.tsAspect.createCompiler(tsConfig);
}
```

#### getLinter

```ts
getLinter(...args : any[]): Linter
```

Returns a linter to be used by the Linter service.

For example:

```ts
export class ReactEnv implements Environment {

    constructor(){
        // ...

        // The ESLint aspect
        private eslint: ESLintMain
    }

    // ...

    getLinter() {
        const eslintConfig = require.resolve('./eslint/eslintrc')
        return this.eslint.createLinter({
            config: eslintConfig,
            // resolve all plugins from the react environment
            pluginPath: __dirname,
        });
    }
}
```

#### getDevServer

```ts
getDevServer(...args : any[]): DevServer
```

Returns a DevServer to be used by the DevServer service. (A DevServer is essentially the combination of the bundler configurations, together with a specified 'listen' port number)

For example:

```ts
export class ReactEnv implements Environment {
  constructor(
    // ...

    // The Webpack aspect
    private webpack: WebpackMain
  ) {}

  // ...

  getDevServer(): DevServer {
    const withDocs = Object.assign(context, {
      entry: context.entry.concat([require.resolve('./docs')]),
    });
    return this.webpack.createDevServer(withDocs, webpackConfig);
  }
}
```

> The above example runs the dev server with the environment's documentation template.

#### getDocsTemplate

```ts
getDocsTemplate(...args : any[]): string
```

Returns the path to the documentation template files, to be used by the Documentation service.

For example (see docs files [here](https://github.com/teambit/bit/tree/master/scopes/react/react/docs)):

```ts
export class ReactEnv implements Environment {
  // ...

  getDocsTemplate() {
    return require.resolve('./docs');
  }
}
```

#### getPackageJsonProps

```ts
getPackageJsonProps(...args : any[]): object
```

Returns an object that defines the `package.json` properties of the packages generated for components handled by this environment. This configuration is used by the Packager service.

Learn more about overriding the `package.json` properties [here](/docs/packages/publish-to-npm#packagejson)

```ts
export class ReactEnv implements Environment {
  // ...

  getPackageJsonProps() {
    return {
      main: 'dist/{main}.js',
      types: '{main}.ts',
    };
  }
}
```

> As with any other 'merging' process, the properties defined in the above returned object will be added to configurations set by Bit.  
> Conflicting properties will be overridden by the properties that are set here.  
> Configurations that are set here may also be overridden, either by the [pkg aspect](https://bit.dev/teambit/pkg/pkg) or by workspace configurations set using the [variants API](https://bit.dev/teambit/workspace/variants).

#### getDependencies

```ts
getDependencies(component: any): Promise<DependencyList>
```

Returns an object that defines the default dependencies for components handled by this environment. The returned object is used by the Dependencies service.

For example:

```ts
export class ReactEnv implements Environment {
  // ...

  async getDependencies() {
    return {
      dependencies: {
        react: '-',
      },
      devDependencies: {
        '@types/react': '16.9.43',
        '@types/jest': '~26.0.9',
      },
      peerDependencies: {
        react: '^16.13.1',
        'react-dom': '^16.13.1',
      },
    };
  }
}
```

> As with any other 'merging' process, the properties defined in the above returned object will be added to configurations set by Bit.  
> Conflicting properties will be overridden by the properties that are set here.  
> Configurations that are set here may also be overridden, either by the [Dependency Resolver aspect](https://bit.dev/teambit/dependencies/dependency-resolver) or by workspace configurations set using the [variants API](https://bit.dev/teambit/workspace/variants).

#### getBuildPipe

```ts
getBuildPipe(...args : any[]): BuildTask[]
```

Returns an array of build tasks to be used by the Builder service. Tasks will be added after and before Bit's pre-configured build tasks. Learn more about it [here](/docs/build-pipeline/overview).

For example:

```ts
export class ReactEnv implements Environment {
  constructor(
    // ...

    // The Compiler aspect
    private compiler: CompilerMain,

    // The Tester aspect
    private tester: TesterMain
  ) {}

  getBuildPipe(): BuildTask[] {
    return [
      this.compiler.createTask('StencilCompiler', this.getCompiler()),
      this.tester.task,
    ];
  }
}
```

## Extending multiple runtime environments 

An environment may operate in multiple runtime environments: 'Main', which runs on the server and 'UI' and 'Preview', which run on the browser.
Each runtime environment runs all files that are named with its corresponding file pattern.

An environment extension that runs on multiple runtimes is called "Aspect" an will have the following file structure:

```
|-- env-extension
    |-- env-extension.main.ts
    |-- env-extension.ui.tsx
    |-- env-extension.preview.tsx
    |-- env.extension.aspect.ts
```

### Registering an environment as an aspect

Create a `*.aspect.ts` file:

For example:
```shell
$ touch path/to/extension/env-extension.aspect.ts
```

Place the following lines to register your environment as a multiple runtime extension (a.k.a, an Aspect):

```ts
// env-extension.aspect.ts

import { Aspect } from '@teambit/harmony';

export const ReactWithProvidersAspect = Aspect.create({
  // The ID should be your component's ID
  // Make sure to track your extension component before registering it as an Aspect
  id: 'my-scope.react-with-providers',
});

```

### Registering a runtime extension
An aspect is a collection of multiple extensions, each extending a specific runtime.

Register each runtime extension to its corresponding runtime, using the `addRuntime` method.

For example:

```typescript
// react-extension.preview.ts

import { PreviewRuntime } from '@teambit/preview';
import { ReactAspect, ReactPreview } from '@teambit/react';
import { ReactExtensionAspect } from './react-with-providers.aspect';


export class ReactExtensionPreview {
  static runtime = PreviewRuntime;

  static dependencies = [ReactAspect];

  static async provider([react]: [ReactPreview]) {
    return new ReactExtensionPreview();
  }
}

ReactExtensionAspect.addRuntime(ReactExtensionPreview);
```



### Runtime environments

#### Main

`*.main.runtime.ts`

Node files that run in a node runtime environments and outputs to the terminal.

**Example:**  
The React environment TypeScript compiler will be extended in the main runtime.

```typescript
// react-extension.main.ts

import { MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import { ReactAspect, ReactMain } from '@teambit/react';
import { ReactExtensionAspect } from './react-extension.aspect';

const tsconfig = require('./typescript/tsconfig.json');

export class ReactExtensionMain {
  constructor(private react: ReactMain, private envs: EnvsMain) {}

  icon() {
    return 'https://static.bit.dev/extensions-icons/react.svg';
  }

  static runtime = MainRuntime;

  static dependencies = [ReactAspect, EnvsAspect];

  static async provider([react, envs]: [ReactMain, EnvsMain]) {
    const reactExtension= envs.compose(react, [
      react.overrideTsConfig(tsconfig)
    ]);
    envs.registerEnv(reactExtension);
    return new ReactWithProvidersMain(react, envs);
  }
}

ReactExtensionAspect.addRuntime(ReactExtensionMain);

```

#### UI

`*.ui.runtime.[ts,js,jsx,tsx]`

JSX files that run in the browser, as part of the Workspace/Scope UI bundle that is being served by the development server.

#### Preview

`*.preview.runtime.*`

These files are served by the environment's server, as part of the environment's preview bundle (i.e, the component compositions and documentation).  
(The 'preview' runtime is rendered in the Workspace/Scope UI using an iframe.)

**Example:**  
A new composition provider that will "wrap" every composition using that environment will be added using the preview runtime since it is part of the component compositions (which are being served to the browser by the environment's server).

```typescript
// react-extension.preview.ts

import { PreviewRuntime } from '@teambit/preview';
import { ReactAspect, ReactPreview } from '@teambit/react';
import { ReactExtensionAspect } from './react-with-providers.aspect';
import { Center } from './my-providers/center';

export class ReactExtensionPreview {
  static runtime = PreviewRuntime;

  static dependencies = [ReactAspect];

  static async provider([react]: [ReactPreview]) {
    react.registerProvider(Center);

    return new ReactExtensionPreview();
  }
}

ReactExtensionAspect.addRuntime(ReactExtensionPreview);
```

## Troubleshooting

**Problem:** Components that are configured to use a specific environment, use the workspace's default environment, instead.

For example:

```json
{
  "teambit.workspace/variants": {
    "*": {
      "teambit.react/react": {}
    },
    "components/utils": {
      "teambit.harmony/node": {}
    }
  }
}
```

In the above example, components in the `components/utils` directory are set to use the Node environment.
Since that selection is more specific than the one done using the `*` wildcard selector, it is expected to override it.

**Understanding the problem:** 
To select the right configurations for each component, the [Variants](https://bit.dev/teambit/workspace/variants) aspect sorts all workspace configurations, from the most specific to the most general.
The first configuration set on an aspect (the most specific one) will be the one that is selected for that aspect.
That means, once Variants encounters configurations for an aspect, it stops looking for additional configurations for that specific aspect.

Each environment is considered as a different aspect, even though they are all under the "environments" category and can only be used once per component.
[Variants](https://bit.dev/teambit/workspace/variants) does not understand categories, only individual aspects and therefore, cannot override one environment with a different environment.

**Solution #1:**

Remove the `*` general selection and use only specific and exclusive selectors to configure environments
(that means your workspace directories/ namespaces need to be structured in a way that enables complete selection of all components using selectors that are exclusive).

For example:
```json
{
  "teambit.workspace/variants": {
    "components/react": {
      "teambit.react/react": {}
    },
    "components/utils": {
      "teambit.harmony/node": {}
    }
  }
}
```

**Solution #2:**
Configure the environment using the Envs config API.

Example:

```json
{
  "teambit.workspace/variants": {
    "*": {
      "teambit.react/react": {}
    },
    "components/utils": {
      "teambit.harmony/node": {},
      "teambit.envs/envs": {
         "env": "teambit.harmony/node"
       }
    }
  }
}
```
> Notice how the Node environment was added also as a standalone aspect, to ensure that it is registered as a dependency of the selected components.

---
