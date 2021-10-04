<p align="center">
  <img src="https://storage.googleapis.com/bit-docs/readme-logo%20(6).png"/>
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
  
Componentize modern app development, build modular systems and applications, and move components from app to app.

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

Bit is an open tool for web developers to build and collaborate on component-driven applications. It enables modern apps to be quickly assembled from components and eliminates the friction around developing together or working on more than one app. You can think of Bit as a way to develop entire web apps in a way similar to how microservices build your backend.

Bit consists of a **workspace** (with UI) where component are developed, managed, and integrated. In the workspace you build can fully distributed projects with a simple monolithic-like dev experience. A single workspace can easily host and manage many components even using different stacks and frameworks.

Each component has an isolated **dev environment** so it is independently developed, tested, built, and run anywhere you need it. Each component is versioned and can be independently deployed. **Dependencie** between components are automatically defined and managed by Bit, using smart **graph versioning**, making it simple to incrementally update and build changes to many components.

**Scopes** help you store and organize components. Remote scopes (on [bit cloud](https://bit.dev) or your own server) make it easy to move components from app to app or between teams, share and discover components, and collaborate to stay in sync.

### Why do developers like Bit?

Modern applications are already built with components. But, the tools used to build them were build to develop, version, and deploy entire projects and not the components within them. As a result, developers are forced to build component-driven applications in a monolithic way, which is painful and highly inefficient. They seek solutions such as Component Libraries and Micro Frontends to try and build in a more modular and distributed way, split development, or share components.

With Bit you don't have these problems. Bit gives developers a great experience for building components and composing them into infinite features and applications, making modern web development not only faster but also more distributed, collaborative, scalable, and consistent.

### Why do organizations need Bit?

When you build many applications with many teams, and every team works inside a monolith oblivious of other people's components, development becomes slow and inconsistent. Bit helps organizations take control of their components, standardize their development (with features like custom component generators and dev envs), and collaborate to achieve speed and consistency. It makes teams more autonomous to build and ship components and at the same time collaborate through a central hub for components.

[Here are 4 popular use-cases](https://blog.bitsrc.io/4-bit-use-cases-build-like-the-best-teams-1c36560c7c6e) many organizations choose to start with.

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
