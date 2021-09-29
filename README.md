<p align="center">
  <img src="https://storage.googleapis.com/static.bit.dev/harmony-docs/readme-logo%20(2).png"/>
</p>

<p align="center">
  <a href="https://harmony-docs.bit.dev/">Documentation</a> |
  <a href="https://bit.dev/">Platform</a> |
  <a href="https://www.youtube.com/channel/UCuNkM3qIO79Q3-VrkcDiXfw">Learn</a>
</p>

<h3 align="center">
  Build anything in components
</h3>

<p align="center">
  The component build and collaboration framework
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

Bit is an open source build framework for components. It helps you build components that are independent and compose them into infinite features and apps. It allows you to build anything in a component-driven architecture: UI applications, backend services, and even CLI tools. It is a tool for advancing web development past the constraints of old monoliths.
  
**What are independent components?**

- You can develop and use them anywhere an standalone modules.
- Each component is versioned.
- You can import and use any component inside other components.
- Each component is built and tested independently from other components.
- The dependencies between components is managed and defined automatically by Bit.
- Each component has its own dev environment so you can develop it independently. You can customize and reuse your dev envs between components.

**What are component-driven apps?**

- Built from independent components that can be built in different codebase by different people.
- Your apps is a composition of components represented by a graph.
- You can add, change, or remove any component independently.
- You build and test changes only to components and their dependencies.
- You can have many components using different stacks in their dev environments or standardize your development. 
  
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
