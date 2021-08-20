<p align="center">
  <img src="https://storage.googleapis.com/static.bit.dev/harmony-docs/readme-logo%20(2).png"/>
</p>

<p align="center">
  <a href="https://harmony-docs.bit.dev/">Documentation</a> |
  <a href="https://bit.dev/">Platform</a> |
  <a href="https://www.youtube.com/channel/UCuNkM3qIO79Q3-VrkcDiXfw">Learn</a>
</p>

<h3 align="center">
  Build components first.
</h3>

<p align="center">
Open infrastructure for component-driven applications to speed and scale development.
</p>

<p align="center">
<a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
<a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
<a href="https://circleci.com/gh/teambit/bit/tree/master"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield&circle-token=d9fc5b19b90fb7e0655d941a5d7f21b61174c4e7">
<a href="https://github.com/prettier/prettier"><img alt ="Styled with Prettier" src="https://img.shields.io/badge/styled_with-prettier-ff69b4.svg">
<a href="https://join.slack.com/t/bit-dev-community/shared_invite/zt-o2tim18y-UzwOCFdTafmFKEqm2tXE4w" ><img alt="Join Slack" src="https://img.shields.io/badge/Slack-Join%20Bit%20Slack-blueviolet"/></a>

## What is Bit?

<p align="center">
  <a href="https://harmony-docs.bit.dev/">
    <img alt="Bit Workspace" src="https://storage.googleapis.com/static.bit.dev/harmony-docs/CleanShot%202021-05-28%20at%2021.01.49%402x.png" />
  </a>
</p>
<p align="left">
Bit is an OSS Infrastructure for building and composing components. It is an extensible toolchain for component-driven applications / systems which are faster to develop, simpler to understand, test, and maintain, more resilient and performant, and easier to collaborate on.

Instead of building an application that has many components, Bit lets you develop components outside of any application and use them to compose many applications from the bottom up. An application is just a deployed composition of components. You can add and remove components from applications to extend or change their functionality. All components can be reused in many different applications.

</p>

### Key Features

<p align="left">

- **Workspace - build and compose components**. The workspace is the foundation of Bit. It is where you develop and compose components. It lets you build fully distributed projects with a simple monolithic-like dev experience. Open the _Workspace UI_ to visually develop and manage your components with ease.

- **Scope - manage and scale with components**. Scopes are where you push, version, and organize your components. It’s a component store. _Remote Scopes_ let you use components across projects. You can setup and host remote Scopes on any servers. [Bit.dev](https://bit.dev) is an optional enterprise-grade platform for hosting and connecting all scopes and components to give teams a streamlined cross-project collaboration experience. It is highly secure and trusted by Fortune-50 teams.</p>

### How to Start?

<p align="center">
  <a href="https://www.youtube.com/watch?v=7afMBwj5fR4">
    <img alt="Bit Workspace" src="https://storage.googleapis.com/static.bit.dev/harmony-docs/build%20with%20bit%20youtube.png" />
  </a>
</p>

To get started follow the [quick-start guide](https://harmony-docs.bit.dev/getting-started/installing-bit) or try the official [Bit for React tutorial](https://harmony-docs.bit.dev/tutorials/react/create-and-consume-components).

Install [Bit Version Manager](https://harmony-docs.bit.dev/getting-started/installing-bit):

```bash
npm i -g @teambit/bvm
# or
yarn global add @teambit/bvm
```

Install Bit:

```bash
bvm install
```

Start a [Bit workspace](https://harmony-docs.bit.dev/getting-started/initializing-workspace):

```bash
bit new react <my-workspace-name>
```

Install dependencies:

```bash
cd <my-workspace-name>
bit start
```
 
Open-up your browser on localhost:3000, or any other available port, and view the demo components.

  
Create components:

```bash
bit create react ui/button     # TypeScript
bit create react-js ui/button  # JavaScript
```


### Popular Onboarding Use-Cases

- Micro Frontends
- Design Systems (Component Marketplace)
- Shared Logic and Backend Functionality
- Rapid Application Development

### Resources & Community

- [Videos](https://www.youtube.com/c/Bitdev/videos)
- [Conference talks](https://harmony-docs.bit.dev/resources/interviews)
- [Interviews](https://harmony-docs.bit.dev/resources/interviews)
- [Podcasts](https://harmony-docs.bit.dev/resources/podcasts)
- [Live streams](https://harmony-docs.bit.dev/resources/live-streams)
- [Articles](https://harmony-docs.bit.dev/resources/articles)
- [Community](https://harmony-docs.bit.dev/resources/community)

## Contributing 🎗️

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## License 💮

Apache License, Version 2.0
![Analytics](https://ga-beacon.appspot.com/UA-96032224-1/bit/readme)
