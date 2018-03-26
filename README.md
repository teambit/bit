
[![Bit community hub](https://storage.googleapis.com/bit-docs/Github%20cover2.png)](http://bitsrc.io)

  <a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
  [![Gitter chat](https://badges.gitter.im/gitterHQ/gitter.png)](https://gitter.im/bit-src/Bit)
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/vg7wvfvku12kkxkc?svg=true"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield&circle-token=d9fc5b19b90fb7e0655d941a5d7f21b61174c4e7">
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=Share%20code%20components%20as%20a%20team%20@bit_src&url=https://bitsrc.io&hashtags=opensource,javascript,programming,reactjs,webdev,vuejs,angularjs)

[Website](https://bitsrc.io) • [Docs](https://docs.bitsrc.io) • [Video](https://www.youtube.com/watch?v=vm_oOghNEYs) • [Blog](https://blog.bitsrc.io/) • [Gitter](https://gitter.im/bit-src/Bit) • [Examples](https://bitsrc.io/bit/movie-app#styles)

## About

**Bit works with Git and NPM to improve the workflow of sharing code between multiple projects and applications**.

Components of software such as UI components, small modules and more can be used as building blocks for multiple projects and applications.

However, sharing this code between projects often comes with a loft of overhead when forcing you to split your existing repositories and sync changes between them.  

Bit eliminates this overhead by helping you seamlessly isolate and share components directly from any repository, organize them for your team and keep them synced across your codebase.  

Any team member can easily discover, use and develop shared components from any of their projects, improving collaboration and innovation while reducing the overhead of code sharing.  

With Bit, code-sharing becomes as simple as copy-pasting.

*Bit is a collaborative open source project, actively developed and maintained by a venture-backed team, used by our team for over 10 months and now being used by more organizations and communities every day. You are welcome to use it, contribute and suggest feedback.*

## Contents

- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Examples](#examples)
- [Motivation](#motivation)
- [Contributing](#contributing)
- [Docs](https://docs.bitsrc.io)
- [Website](https://bitsrc.io)


## How It Works

### Seamless code sharing

Instead of splitting your project into more repositories just to publish packages, Bit enables you to isolate and share components of code (subsets of files) directly from your existing repository without splitting it or changing a single line of code.

Once shared, your components can be installed with NPM / Yarn or imported into any project with Bit for further development, while keeping changes synced between your projects.

This becomes possible thanks to three main features:

**Automatic dependency detection and definition** - Components can depend on other components, packages or files in your project. Bit [automatically defines](https://docs.bitsrc.io/docs/isolating-and-tracking-components.html) the dependency graph for the components you share, to isolate them from your project.

**Isolated environment** - Bit’s understanding of the component’s dependency graph enables it to  create an [isolated environment](https://docs.bitsrc.io/docs/ext-concepts.html) for the component,  so it can be developed from any other project. For example, components written in typescript can be sourced and developed in a project written in flow-typed.

**Scope** - The [Scope](https://docs.bitsrc.io/docs/organizing-components-in-scopes.html) is a remote source of truth in which your components are stored, organized and synced (while versioned) throughout your projects. When combined with the isolated component envrionemnt, Scopes also enable components to [build](https://docs.bitsrc.io/docs/building-components.html) and [test](https://docs.bitsrc.io/docs/testing-components.html) in isolation.

Scopes also serve as a “playlist” of your team’s components, from which they can be easily discovered and used. You can set up a Scope locally, or use Bit’s [free Hub](https://bitsrc.io). 
 
### Installing components with NPM

Once shared to a Scope on the [free hub](https://bitsrc.io), components automatically become available to install as packages using NPM and Yarn. This means you can turn any component from any project into a package in seconds, without creating a new repository and [environment](https://docs.bitsrc.io/docs/building-components.html).

### Simultaneous development from different projects

Bit decouples the representation of the code you share from your project’s file structure.
As a result, you can make changes to the code you share from any project you’re working on, and sync these changes across other projects using your Scope as a remote source of truth.

This distributed workflow also make it very easy to update packages from any end repository if you choose to install your components using package managers.

### Discoverability

The code you share with Bit is organized in your Scopes and can be made available to your team to discover, use and develop. If shared to Bit’s [free hub](https://bitsrc.io), your components will be presented with a visual UI including rendering for React components, isolated test results, auto-parsed docs and examples. Here’s [an example](https://bitsrc.io/bit/movie-app/components/hero).

Since Bit tracks the code you share across your projects, you can easily learn which components are used by who and where, and make vast changes to multiple components together with universal control over your dependency graph.


### Extending Bit

You can [extend Bit](https://docs.bitsrc.io/docs/ext-developing-extensions.html) to integrate with your favorite dev tools to build, test, bundle, lint, pack, publish and optimize the workflow around the code you share.

## Getting Started

* [Quick start guide](https://docs.bitsrc.io/docs/quick-start.html)
* [Tutorial: Bit with React](https://docs.bitsrc.io/tutorial/react-tutorial.html) 

### Example workflow

Let’s use Bit to isolate and share the UI components `button`, `login` and `logo` in the following project’s directory structure.

```bash
$ tree
.
├── App.js
├── App.test.js
├── favicon.ico
├── index.js
└── src
    └── components
        ├── button
        │   ├── Button.js
        │   ├── Button.spec.js
        │   └── index.js
        ├── login
        │   ├── Login.js
        │   ├── Login.spec.js
        │   └── index.js
        └── logo
            ├── Logo.js
            ├── Logo.spec.js
            └── index.js

5 directories, 13 files
```

1. First, let’s [install Bit](https://docs.bitsrc.io/docs/installation.html).

```bash
$ npm install bit-bin -g
```

2. Let’s [initialize Bit](https://docs.bitsrc.io/docs/initializing-bit.html) for the project.

```bash
$ cd project-directory
$ bit init
```

3. Let’s [add the components](https://docs.bitsrc.io/docs/isolating-and-tracking-components.html) to be tracked by Bit.

```bash
$ bit add src/components/* # use a glob pattern to track multiple components in the same path or a single path to track a single component.
```

4. Let’s add [build](https://docs.bitsrc.io/docs/building-components.html) and [test](https://docs.bitsrc.io/docs/testing-components.html) environments from this [pre-made collection](https://bitsrc.io/bit/envs) (you can also [implement your own](https://docs.bitsrc.io/docs/ext-developing-extensions.html)).
- In case these are React UI components, it will also enable Bit to render your components! Here's [an example](https://bitsrc.io/bit/movie-app/components/hero).

```bash
$ bit import bit.envs/bundlers/webpack-css-modules --compiler
the following component environments were installed
- bit.envs/bundlers/webpack-css-modules@0.0.6

$ bit import bit.envs/testers/karma-mocha --tester
the following component environments were installed
- bit.envs/testers/testers/karma-mocha@0.0.8

```

5. Now let’s [lock a version](https://docs.bitsrc.io/docs/versioning-tracked-components.html) and let Bit isolate the components from the project by defining their file / package dependancy graph.

```bash
$ bit tag --all 1.0.0
3 components tagged | 3 added, 0 changed, 0 auto-tagged
added components:  components/button@1.0.0, components/login@1.0.0, components/logo@1.0.0
```

6. Now let’s [share](https://docs.bitsrc.io/docs/organizing-components-in-scopes.html) the components to a remote [Scope](https://bitsrc.io).

```bash
$ bit export username.scopename  # Share components to this Scope
exported 3 components to scope username.scopename
```
Note that using the `--eject` flag you can also remove an exported component from your source-code and add it as a package dependency in your project’s `package.json` file.

That’s it. You can now [install the components](https://docs.bitsrc.io/docs/installing-components-using-package-managers.html) using your favorite package manager, or use `bit import` to [bring their source code](https://docs.bitsrc.io/docs/importing-components.html) into any repository, make changes and easily [sync them](https://docs.bitsrc.io/docs/updating-sourced-components.html) across different projects.

Also see: [GETTING STARTED](https://docs.bitsrc.io/docs/quick-start.html)

## Usage

### Basics

1. [Installation](https://docs.bitsrc.io/docs/installation.html)
2. [Initializing Bit for your project](https://docs.bitsrc.io/docs/initializing-bit.html)
3. [Isolating and tracking components](https://docs.bitsrc.io/docs/isolating-and-tracking-components.html)
4. [Versioning and dependency defintion](https://docs.bitsrc.io/docs/versioning-tracked-components.html)
5. [Sharing components](https://docs.bitsrc.io/docs/organizing-components-in-scopes.html)
6. [Installing with NPM/Yarn](https://docs.bitsrc.io/docs/installing-components-using-package-managers.html)
7. [Component source code distribution](https://docs.bitsrc.io/docs/importing-components.html)

### Advanced:

* [Building components](https://docs.bitsrc.io/docs/building-components.html)
* [Testing components](https://docs.bitsrc.io/docs/testing-components.html)
* [Rendering components](https://docs.bitsrc.io/docs/rendering-components.html)
* [Documenting components](https://docs.bitsrc.io/docs/documenting-components.html)
* [Removing components](https://docs.bitsrc.io/docs/removing-components.html)
* [Extending Bit](https://docs.bitsrc.io/docs/ext-concepts.html)
* [Configuring Bit](https://docs.bitsrc.io/docs/conf-bit-json.html)
* [Troubleshooting](https://docs.bitsrc.io/docs/latest-version.html)

### Usage:

* [CLI reference](https://docs.bitsrc.io/docs/cli-add.html)

## Examples

### Bit with React / Vue

[Tutorial: Bit with React](https://docs.bitsrc.io/tutorial/react-tutorial.html).

Bit can be a great combination with your UI components.

For example, here is a [React movie-application project](https://github.com/teambit/movie-app) that contains 8 reusable UI components.

Using Bit, all of these components were seamlessly isolated and shared from the repository without changing a single line of code, and organized in [this Scope](https://bitsrc.io/bit/movie-app).

Here’s an example [React hero component](https://bitsrc.io/bit/movie-app/components/hero) from the project:

[![React Hero component](https://storage.googleapis.com/bit-docs/bit_03.png)](https://bitsrc.io/bit/movie-app/components/hero)


##### Node.js modules

Share and sync Node.js modules between microservices in a multi-repo architecture.

We use Bit for over 250 shared components between our Node.js microservices (!).

##### Shared libraries

Use Bit to turn any shared-lib into a dynamic collection of individual components.

Here’s an [example JS utility library](https://github.com/teambit/bit.utils) seamlessly turned into a [dynamic Scope](https://bitsrc.io/bit/utils) of individual components.

Additional use cases: **[GraphQL APIs](https://hackernoon.com/make-your-graphql-api-easier-to-adopt-through-components-74b022f195c1)**, **Serverless functions**, **Utility functions** and any encapsulated, reusable component and module.


## Motivation

Learn more about the journey towards turning components into the lego-like building blocks of different projects and applications, why Bit was created and what the future holds:

* “[How we started sharing components as a team](https://hackernoon.com/how-we-started-sharing-components-as-a-team-d863657afaca)” (Hackernoon)
* “[What music can teach us about how we share code](https://medium.freecodecamp.org/what-music-can-teach-us-about-the-way-we-share-code-a69c30ebded8)” (FreeCodeCamp)
* Read [our blog](https://blog.bitsrc.io/)


## Supported Languages

Bit's design is aimed to be language agnostic, but as of today it still requires language-specific drivers for language-sensitive features (binding etc).

* [bit-javascript](https://github.com/teambit/bit-javascript).

## Contributing

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## Feedback

Feedbacks and questions are more than welcome via Bit's [Gitter channel](https://gitter.im/bit-src/Bit).

## License

Apache License, Version 2.0

![Analytics](https://ga-beacon.appspot.com/UA-96032224-1/bit/readme)


