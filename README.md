<p align="center">
  <img src="https://storage.googleapis.com/bit-docs/readme-logo%20(6).png"/>
</p>

<p align="center">
  <a href="https://harmony-docs.bit.dev/">Docs</a> |
  <a href="https://github.com/bit-demos/">Demos</a> |
  <a href="https://www.youtube.com/channel/UCuNkM3qIO79Q3-VrkcDiXfw">Videos</a> |
  <a href="https://bit.dev/">Bit Cloud</a>
</p>

</p>

<h3 align="center">
  Build anything in components
</h3>

<p align="center">
Distribute and scale web application development through components.  
  
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
  
Bit distributes web application development in order to scale it.  
  
Instead of building monolithic applications where all components are internal and has no added value, in Bit you build components that are independent (each component has its own codebase, version, and build), then use them to compose many applications.  
  
Building in Bit is simpler than without it. You can start writing components anywhere in any project you want, and through Bit integrate and use them anywhere to build anything. With Bit you just don’t do extra work to enjoy things like micro frontends or component libraries; All your components are available anywhere, and all your applications are composed of independent components. Bit is open source and organizations can expand collaboration via [Bit Cloud](https://bit.dev).
  
Bit consists of a **workspace** (with UI) where component are developed, managed, and integrated. In the workspace you build can fully distributed projects with a simple monolithic-like dev experience. A single workspace can easily host and manage many components even using different stacks and frameworks. 
  
Each component has an isolated **dev environment** so it is independently developed, tested, built, and run anywhere you need it. Each component is versioned and can be independently deployed. **Dependencies** between components are automatically defined and managed by Bit, using smart **graph versioning**, making it simple to incrementally update and build changes to many components.  
  
**Scopes** help you store and organize components. Remote scopes (on [bit cloud](https://bit.dev) or your own server) make it easy to move components from app to app or between teams, share and discover components, and collaborate to stay in sync. 
  
Organizations can assign team ownership over features to autonomous teams, who build and serve components for all apps to use. For example, a team can build a set of front and backend components for “search” and serve them for all applications to integrate and use, just like a microservice serves APIs.

Bit distributes and scales web development in a way similar to how microservices distributed and scaled backend development, only in a more flexible degree of freedom through unlimited granularity and across the entire modern web development stack, front and back.

**_We build 100% of our technology with Bit, and so do thousands of developers and dozens of Fortune-500 companies._**

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

[Here are 4 popular use-cases](https://blog.bitsrc.io/4-bit-use-cases-build-like-the-best-teams-1c36560c7c6e) many organizations choose to start with.

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
