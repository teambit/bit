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
Bit is a toolchain for component-driven software development.
  
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
  
Bit stands at the intersection between product and engineering. It helps you take complex product requirements, and break them down into independent, reusable pieces called "components" that fit well together. Components can be anything independent by nature from a general purpose module, UI components, UI applications, pages, blocks, backend services, content and anything else you might imagine. Think of Bit as a ways to build larger projects from smaller pieces together with more people.
  
As a developer, imagine having a single mini-repository for each of your components, and a dev experience that makes the development of them seamless together. As an arhictect, imagine having your entire software architecture built from service-oriented components, sorted and controlled on a single architectural graph, it is like scaling Microservices for everything. As a designer, think of composing a design out of symbols, each symbol is indepednent and reusable.

Bit does not prescribe how you build your entire application. It helps you define and compose components and allows for every component to adopt the dev tools that best fit its nature. A React component might be compiled, tested and sometimes even deployed with a different composition of tools than a Microservice component, or a generic function. Bit comes with native support in various dev tools like TypeScript, Babel, Jest, Webpack, ESLint and ready made development environments for React, NodeJS, Angular and more. New tools can be easily integrated by adding one more component into Bit!

**_We build 100% of our technology with Bit, and so do thousands of developers and many Fortune-50 companies._**

### How to Start?

#### Installation
  
To get started, we would first have to make sure the bit binary is installed on your machine and configured to your PATH.
  
```
$ npx @teambit/bvm install
```
  
(NodeJS installation is required)

#### Creating the workspace
  
The first step in the Bit journey is to create a component development workspace. Workspaces allow the creation and maintanance of isolated and independent pieces called "components". Since every component is isolated, the workspace is tech agnostic and allows for components, with a different tech stack to co-exist. A single workspace might include React components, general purpose node modules, Angular modules and even backend services.

To create a new workspace, run:

```
bit new great-inventions
cd my-workspace
```
  
#### Start the Workspace UI console:

```
bit start
```
  
### Popular Use-Cases

[Here are 4 common use-cases](https://blog.bitsrc.io/4-bit-use-cases-build-like-the-best-teams-1c36560c7c6e) to start your transition to component-driven development. 

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
