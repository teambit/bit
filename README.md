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

[Bit](https://bit.dev) is a complete solution for composing highly performant and consistent platforms from independent business features. It empowers developers to seamlessly integrate API-centric features into shell applications while maintaining optimal user experience, performance, safety, and developer experience

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

### Create shell application

Create the application shell to run, compose and deploy your platform:

```bash
bit create harmony-platform acme-platform
```

Run the platform:

```
bit run acme-platform
```

Head to `http://localhost:3000` to view your application shell. You can provide API to ease the integration of features to the platform using Platform aspects. Learn more on [building platform aspects](https://bit.dev/docs/platform-engineering/platform-aspects) or optionally learn maintaining an [independent platform workspace](https://bit.dev/docs/workspaces/platform-workspace).

### Create feature

Create a feature composing [React](https://bit.dev/docs/react/react-intro), [Angular](https://bit.dev/docs/angular/angular-intro), [Vue](https://bit.dev/docs/vue/vue-intro) or other components into your platform:

```
bit create aspect people
```

You can find simple guides for creating NodeJS modules, UI components and apps, backend services and more on the [Create Component docs](https://bit.dev/docs/getting-started/composing/creating-components/). 

You can add API to the people aspect to leverage as introducing new features into the platform. Dive deeper into [creating features](docs/getting-started/composing/create-feature) or optionally learn to create and maintain [independent feature workspaces](docs/workspaces/feature-workspace).

Compose the feature into the application shell:

```ts
// acme-platform.bit-app.ts
import { HarmonyPlatform } from '@bitdev/harmony.harmony-platform';
import { SymphonyPlatformAspect } from '@bitdev/symphony.symphony-platform';
// import the feature component
import { PeopleAspect } from '@my-org/people.people';

export const AcmePlatform = HarmonyPlatform.from({
  name: 'acme-platform',
  // use the Bit default platform engineering aspect
  platform: [SymphonyPlatformAspect],
  
  aspects: [
    // compose the people feature into the platform
    PeopleAspect
  ],
});
```

### Create components

Create the components to compose into the feature. Run the following command to create a new React UI component for the platform `login` route:

```
bit create react login
```

Adjust the React login to your needs and finally compose the component into the platform:

```tsx
// people.browser.runtime.tsx
import { SymphonyPlatformAspect, type SymphonyPlatformBrowser } from '@bitdev/symphony.symphony-platform';
// import the login component.
import { Login } from '@acme/support.routes.login';

export class PeopleBrowser {
  // optionally define people browser runtime API
  static dependencies = [SymphonyPlatformAspect];

  static async provider([symphonyPlatform]: [SymphonyPlatformBrowser]) {
    const people = new PeopleBrowser();
    // Integrate the login as a route to the platform.
    symphonyPlatform.registerRoute([
      {
        path: '/login',
        component: () => <Login />
      }
    ]);

    return people;
  }
}
```

Head to `http://localhost:3000/login` to view your new login page. 

You can use `bit templates` to list official templates or find guides for creating React hooks, backend services, NodeJS modules, UI components and more on our [create components page](/getting-started/composing/creating-components). 
Optionally, use `bit start` to run the Bit UI to preview components in isolation.

### Release and deploy

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

### Modernize existing projects

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
