<p align="center">
  <img src="http://static.bit.dev/bit-docs/readme-bit-logo.png"/>
</p>

<p align="center">
  <a href="https://bit.dev/docs/">Docs</a> |
  <a href="https://bit.cloud/bitdev">Community</a> |
  <a href="https://bit.cloud/">Bit Cloud</a>
</p>

</p>

<h3 align="center">
</h3>

<p align="center">
  
<p align="center">
<a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
<a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
<a href="https://circleci.com/gh/teambit/bit/tree/master"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield">
<a href="https://github.com/prettier/prettier"><img alt ="Styled with Prettier" src="https://img.shields.io/badge/styled_with-prettier-ff69b4.svg">
<a href="https://join.slack.com/t/bit-dev-community/shared_invite/zt-1vq1vcxxu-CEVobR1p9BurmW8QnQFh1w" ><img alt="Join Slack" src="https://img.shields.io/badge/Slack-Join%20Bit%20Slack-blueviolet"/></a>


Bit is a toolchain for **composable software**. It makes the development of composable software simple and fast.

Bit is similar in sense, but stands as the opposite for the "Monorepo" approach, which aims to center all code under a central repository. Instead Bit is bringing simplicity for distribution of source code into to independent components, composing each other.

People often use Bit to run a Monorepo, sometimes a Polyrepo or without using repositories at all.

The core innovation of Bit is the ["Bit Component"](https://bit.dev/#component), a composable container for source code, whereas dependencies are first-class citizens. Components can be used as packages, ESM modules, runtime scripts, and any other artifact a build task can generate.

- 📦 **Descriptive module names**. Use components through descriptive package names. No aliases required.
- 🚀 **Dependency versioning.** Automatic detection and versioning of dependency changes. No more redundant  package.json files.
- ⚓ **Reusable development environments.** Reusable components including all of your dev config. No more duplication of countless `tsconfig.json`, `eslintrc` or `pretterrc` configs.
- ⚒️ **Build pipelines**. Independently build and store packages, bundles, and binaries.
- 👓 **Preview and auto-generated docs**. Every component is an asset with auto-generated docs and component previews.
- 🛫 **Lanes**. Propose and change components to introduce new features, in collaboration with others.
- 🧑‍💻 **Component generators**. Create new components using pre-built or custom templates for any type of component.


## Getting started

### Install Bit
Use the Bit installer to install Bit to be available on your PATH.

```bash
npx @teambit/bvm install
```

### Create a new workspace

Run the following to create a workspace with a few components included, using the hello-world starter:
```bash
bit new hello-world my-hello-world --env teambit.community/starters/hello-world 
```

For the quick start, we use two React components and one Node module, though you can create components using any JS-based framework. You can explore our [official environments](https://bit.dev/docs) for [Vue](https://bit.dev/docs/quick-start/hello-world-vue), [Angular](https://bit.dev/docs/quick-start/hello-world-angular), or [learn how to create your own](https://bit.dev/reference/envs/create-env).

### Run the app

Your workspace maintains a number of components. One of these components is also an [app](https://bit.dev/reference/apps/application-types/). 

```bash
bit run hello-world-app
```

### Create components
Start creating components using the default component generators, or [create your own](https://bit.dev).

```bash
bit create REACT buttons/button
```

View other built-in component templates, by running the `bit templates` command.

### Use components

After creating a new component, starting using it by adding an import statement in one of your workspace components.

```ts
import { Button } from '@owner-name/buttons.button';
```

### Record component and dependency changes

Run the following to record component changes to your components, and assign a semantic version to them. Bit will version the dependents graph of the changed components.

```bash
bit snap --message 'initial release'
```

Snapped components are ready to be built upon 'export' (see next step). The build artifacts will also be stored in the component's new version ('snap').

By default, components are built using bit.cloud's CI platform, Ripple CI. However, you can run the components' build locally by adding the --build flag, or use your own CI platform. [To learn more see Set up CI](https://bit.dev/).

### Export components to a remote scope

```bash
bit export
```

🎉🎉🎉 Head over to your bit.cloud account to see your components build progress. Once the build process is completed, the components will be available in their remote scopes.

## Contributors
Bit is entirely built with Bit and you can find all its components on [Bit Cloud Here](https://bit.cloud/teambit/~scopes).

<a href="../../graphs/contributors"><img src="https://opencollective.com/bit/contributors.svg?width=890&button=false" /></a>

Your contribution, no matter how big or small, is much appreciated. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## License 

[Apache License, Version 2.0](https://github.com/teambit/bit/blob/master/LICENSE)
