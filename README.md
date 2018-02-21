
[![Bit community hub](https://storage.googleapis.com/bit-docs/Github%20cover2.png)](http://bitsrc.io)

  <a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/vg7wvfvku12kkxkc?svg=true"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield&circle-token=d9fc5b19b90fb7e0655d941a5d7f21b61174c4e7">
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=Share%20code%20components%20as%20a%20team%20@bit_src&url=https://bitsrc.io&hashtags=opensource,javascript,programming,reactjs,webdev,vuejs,angularjs)

[Website](https://bitsrc.io) • [Docs](https://docs.bitsrc.io) • [Video](https://www.youtube.com/watch?v=vm_oOghNEYs) • [Blog](https://blog.bitsrc.io/) • [Gitter](https://gitter.im/bit-src/Bit) • [Examples](https://bitsrc.io/bit/movie-app#styles)

## About

Sharing code between repositories is essential to the development and maintenance of your codebase.

However, just to publish packages you'd have to restructure your entire project's codebase - splitting it into more repositories or configuring multiple packages in a single repository. Even then, there is no simple way to sync shared code between different projects.

**Bit works with Git and NPM to make it super-easy to share code and sync changes between projects**.

Instead of creating new repositories for your packages or restructuring your project, you can instantly isolate and share any part of any existing repository and use your favorite package managers to install it in other projects.

Instead of configuring and making changes to multiple packages repositories or directories, you can simply change the code you share from any other project and easily sync the changes between all your projects.

With Bit, managed code sharing becomes as simple as copy-pasting.

*Bit is a collaborative open source project, actively maintained by a venture-backed team and used by different organizations and OSS communities. You are welcome to join*.


## Contents

- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Use Cases And Examples](#use-cases-and-examples)
- [Motivation](#motivation)
- [Contributing](#contributing)
- [Docs](https://docs.bitsrc.io)
- [Website](https://bitsrc.io)


## How It Works

### Next-generation code sharing

Instead of splitting your project into multiple repositories just to publish packages, Bit enables you to isolate and share components of code (subsets of files) from your existing repository that may then be installed with package managers. This also makes it possible to import the source code of your components into other repositories, continue to develop them and sync changes. This will not change your repository’s structure at all. These are the 2 key features that make it possible.

**Dependency definition** - Bit [automatically resolves](https://docs.bitsrc.io/docs/isolating-and-tracking-components.html) and defines the dependency tree for the components you isolate, including both package dependencies and other files from your project.

**Isolated environment** - Using Bit’s understanding of the components’ dependency graph, it’s able to create an [isolated environment](https://docs.bitsrc.io/docs/ext-concepts.html) for the code you share. This effectively saves the configuration overhead for the code you share and means that these components can also be developed from any other project with their own isolated dependency graph. For example, components written in typescript can be sourced and developed in a project written in flow-typed.

### Installing in other projects

Once Bit isolates code components from your project, you can share them to a remote source of truth called a Scope. You can set up a Scope locally, or use Bit’s [hosting Hub](https://bitsrc.io). From there, they can be [installed](https://docs.bitsrc.io/docs/installing-components-using-package-managers.html) using NPM and Yarn in any of your projects.

### Changing the code from any repository

Bit decouples the representation of the code you share from your project file structure.
As a result, you can make changes to the code you share from any repository in your codebase.

You can use `bit import` to bring the component's actual source code into any repository, change it, and share it back to the remote Scope to sync changes across your projects. You can think of it as “automated and managed copy-pasting” that creates a distributed development workflow.

### Discoverability and control

The code you share with Bit is organized in your remote Scopes which can be made available to your entire team. Bit also provides improved discoverability through a search engine and visual information for your shared code, including auto-parsed docs and examples, test and build results and even live rendering for UI components ([alpha example](https://bitsrc.io/bit/movie-app)).

Since Bit tracks the code you share throughout your codebase, you can easily learn which components are used by who and where, and make vast changes to multiple components together with universal control over your dependency graph.


### Extending Bit

You can extend Bit to integrate with your favorite dev tools to build, test, bundle, lint, pack, publish and optimize the workflow around shared code any way you choose.

## Getting Started

[QUICK START GUIDE](https://docs.bitsrc.io/docs/quick-start.html)


#### Example workflow


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

4. Let’s add [build](https://docs.bitsrc.io/docs/building-components.html) and [test](https://docs.bitsrc.io/docs/testing-components.html) environments. Here is an example.

```bash
$ bit import bit.envs/compilers/react --compiler
the following component environments were installed
- bit.envs/compilers/react@0.0.7

$ bit import bit.envs/testers/jest --tester
the following component environments were installed
- bit.envs/testers/jest@0.0.7

```

5. Now let’s [lock a version](https://docs.bitsrc.io/docs/versioning-tracked-components.html) and isolate the components from the project.

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

That’s it. You can now [install the components](https://docs.bitsrc.io/docs/installing-components-using-package-managers.html) using your favorite package manager, or use `bit import` to [bring their source code](https://docs.bitsrc.io/docs/importing-components.html) into any repository, make changes and sync them across your codebase.

Also see: [GETTING STARTED](https://docs.bitsrc.io/docs/quick-start.html)


## Usage


### Basics

1. [Installation](https://docs.bitsrc.io/docs/installation.html)
2. [Initializing Bit on a project](https://docs.bitsrc.io/docs/initializing-bit.html)
3. [Isolating and tracking components](https://docs.bitsrc.io/docs/isolating-and-tracking-components.html)
4. [Versioning and locking dependencies](https://docs.bitsrc.io/docs/versioning-tracked-components.html)
5. [Sharing from your project](https://docs.bitsrc.io/docs/organizing-components-in-scopes.html)
6. [Installing with NPM/Yarn](https://docs.bitsrc.io/docs/installing-components-using-package-managers.html)
7. [Component source code distribution](https://docs.bitsrc.io/docs/importing-components.html)

### Usage:

* [CLI reference](https://docs.bitsrc.io/docs/cli-add.html)

### Advanced:

* [Building components](https://docs.bitsrc.io/docs/building-components.html)
* [Testing components](https://docs.bitsrc.io/docs/testing-components.html)
* [Documenting components](https://docs.bitsrc.io/docs/documenting-components.html)
* [Removing components](https://docs.bitsrc.io/docs/removing-components.html)
* [Extending Bit](https://docs.bitsrc.io/docs/ext-concepts.html)
* [Configuring Bit](https://docs.bitsrc.io/docs/conf-bit-json.html)
* [Troubleshooting](https://docs.bitsrc.io/docs/latest-version.html)


## Use Cases And Examples

#### Example project

Here is a simple [React app](https://github.com/itaymendel/movie-app) project with 8 reusable components located in its src/components directory and one component which is the global styles.

By using Bit to track and share these components, they are now made available to discover and install from [this Scope](https://bitsrc.io/bit/movie-app).

#### Use cases:

##### UI / Web components

Share and sync UI components (React, Angular, Vue etc) between projects.

[Bit with React](https://docs.bitsrc.io/tutorial/react-tutorial.html)


##### Node.js modules

Share and sync Node.js modules between micro-services in a multi-repo architecture.

##### Shared libraries

Use Bit to turn any shared-lib into a dynamic collection of individual components.

Additional use cases: **GraphQL APIs**, **Serverless functions**, **Utility functions** and any encapsulated, reusable functionality.


## Motivation

Sharing code really shouldn’t be this hard.

Instead of working hard to maintain and update multiple repositories just to share packages, Bit was built to make it easier to share code between projects and people.

Learning from what iTunes did for music sharing in the post CD-Rom, we decided to build a tool that will make managed code sharing as fast and simple as copy-pasting.

The key to Bit’s capabilities lies in its ability to decouple the representation of shared code from the project’s file system. This allows the tracking of source code even when implemented and sourced in different repositories. By integrating with the existing Git / NPM ecosystem, Bit helps to smooth the code sharing workflow and makes it easier to make and sync changes across your codebase.

You can use Bit to share code from a single repository (monorepo) or to share and sync code between multiple repositories in your project’s codebase, and even between projects.

After using it for over a year, and seeing it used by more teams and communities every day, we welcome you to join and use Bit for your work or take part in its development.

You can learn more on our [website](https://bitsrc.io) and [blog](https://blog.bitsrc.io/).

## Supported Languages

Bit's design is aimed to be language agnostic but as of today it still requires language-specific drivers for language-sensitive features (binding etc).

* [bit-javascript](https://github.com/teambit/bit-javascript).

## Contributing

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## Feedback

Feedbacks and questions are more than welcome via Bit's [Gitter channel](https://gitter.im/bit-src/Bit).

## License

Apache License, Version 2.0

![Analytics](https://ga-beacon.appspot.com/UA-96032224-1/bit/readme)
