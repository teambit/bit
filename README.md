<p align="center">
  <img src="http://static.bit.dev/bit-docs/readme-bit-logo.png"/>
</p>

<p align="center">
  <a href="https://bit.dev/">Website</a> |
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

[Bit](https://bit.dev) is a complete solution for building **composable software**. It simplifies the creation, maintenance and reuse of software using independent and reusable components.

You can use Bit components to build new projects or reuse components to modernize your existing applications. Here are few examples to components people build with Bit:

- [Reusable components](#getting-started)
- [Backend services](https://bit.dev/docs/quick-start/platforms)
- [Design systems](https://bit.dev/docs/quick-start/design-system)
- [Composable platforms](https://bit.dev/docs/composable-platforms)
- [Shell applications](https://bit.dev/docs/quick-start/react)
- [Micro frontends](https://bit.dev/docs/micro-frontends/react-micro-frontends)

Bit supports all tooling in the JS ecosystem and comes out of the box with official dev environments for [NodeJS](https://bit.dev/docs/backend-intro), [React](https://bit.dev/docs/react-intro), [Angular](https://bit.dev/docs/angular-introduction), [Vue](https://bit.dev/docs/vue-intro), [React Native](https://bit.dev/docs/react-native-intro), [NextJS](https://bit.dev/docs/quick-start/hello-world-nextjs) and [far more](https://bit.dev/docs). All are native to TypeScript and ESM and equipped with the best dev tooling.

Bit is a fit to every codebase structure. You can use Bit components in a monorepo, polyrepo, or even without repositories at all.

## Getting started

### Install Bit

Use the Bit installer to install Bit to be available on your PATH.

```bash
npx @teambit/bvm install
```

Initialize Bit on a new folder or in an existing project by running the following command:

```bash
bit init --default-scope my-org.my-project
```

Make sure to create your scope on the Bit platform and use the right org and project name. After running the command, Bit is initialized on the chosen directory, and ready to be used via Bit commands, your editor or the Bit UI!

### Create components

Start creating components using the default component generators, or [create your own](https://bit.dev/docs/node-env/generators).

```bash
bit templates
```

The following command uses the React UI component template to create a new reusable React component:

```bash
bit create react hello-world
```

You can find simple guides for creating NodeJS modules, UI components and apps, backend services and more on the [Create Component docs](https://bit.dev/docs/getting-started/composing/creating-components/). Run the Bit UI to preview components using the following command:

```
bit start
```

Use `bit run` to preview applications during development. To create an application, follow the [Create App docs section](https://bit.dev/docs/getting-started/composing/create-apps/).

### Use components

After creating a new component, start using it by adding an import statement in one of your workspace components.

```ts
import { Button } from '@org/scope-name.buttons.button';
```

Once added, Bit will autodetect the dependency between these components. Use `bit show` or the [VSCode plugin](https://bit.dev/docs/getting-started/installing-bit/editor-setup) to view the list of dependencies Bit detected for your components.

### Release components

You can either use hosted scopes on [Bit Cloud](https://bit.cloud) or by [hosting scopes on your own](https://bit.dev/reference/scope/running-a-scope-server). Use the following command to create your Bit Cloud account and your first scope.

```bash
bit login
```

Use semantic versioning to version your components:

```bash
bit tag --message "my first release" --major
```

By default, Bit uses [Ripple CI](https://bit.cloud/products/ripple-ci) to build components. You can use the `--build` flag to build the components on the local machine. To tag and export from your CI of choice to automate the release process or use [our official CI scripts](https://bit.dev/docs/getting-started/collaborate/exporting-components#ci-scripts).

After versioning, you can proceed to release your components:

```bash
bit export
```

Head over to your [bit.cloud account](https://bit.cloud) to see your components build progress. Once the build process is completed, the components will be available for use using standard package managers:

```bash
npm install @my-org/my-project.hello-world
```

## Next steps

- [Create more components](https://bit.dev/docs/getting-started/composing/creating-components/)
- [Setup your editor](https://bit.dev/docs/getting-started/installing-bit/editor-setup)
- [Configure CI of choice](https://bit.dev/docs/getting-started/collaborate/exporting-components/#ci-scripts)
- [Start from an existing project](https://bit.dev/docs/getting-started/installing-bit/start-from-existing-project)

## Contributors

Bit is entirely built with Bit and you can find all its components on [Bit Cloud](https://bit.cloud/teambit/~scopes).

<a href="../../graphs/contributors"><img src="https://opencollective.com/bit/contributors.svg?width=890&button=false" /></a>

Your contribution, no matter how big or small, is much appreciated. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## License

[Apache License, Version 2.0](https://github.com/teambit/bit/blob/master/LICENSE)
