
[![Bit community hub](https://storage.googleapis.com/bit-docs/Github%20cover2.png)](http://bitsrc.io)

  <a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
  [![Gitter chat](https://badges.gitter.im/gitterHQ/gitter.png)](https://gitter.im/bit-src/Bit)
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/vg7wvfvku12kkxkc?svg=true"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield&circle-token=d9fc5b19b90fb7e0655d941a5d7f21b61174c4e7">
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=Share%20code%20components%20as%20a%20team%20@bit_src&url=https://bitsrc.io&hashtags=opensource,javascript,programming,reactjs,webdev,vuejs,angularjs)

[Website](https://bitsrc.io) • [Docs](https://docs.bitsrc.io) • [Video](https://www.youtube.com/watch?v=P4Mk_hqR8dU) • [Blog](https://blog.bitsrc.io/) • [Gitter](https://gitter.im/bit-src/Bit) • [Examples](https://bitsrc.io/bit/movie-app#styles)

## About

**Bit scales code sharing and reduces the overhead around it**.

Code sharing is vital for the development and maintenance of your software’s codebase.

However, the overhead around it can be massive: refactoring code, splitting repositories, configuring packages, maintaining wikis, ownership issues and so on.

Bit works with **Git and NPM** to create a faster and more collaborative workflow for code sharing.

With Bit, any component or modules from any repository can be instantly shared and made available to use and even develop from any other project. 0 refactoring, 0 configurations.

Teams can collaborate to share their components, develop them from different projects, suggest updates, merge changes and stay in sync.
Popular use cases are UI components (React, Vue etc), Node.js modules, plain Javascript and more. Feel free to jump in and give it a try.

*Bit is a collaborative open source project, actively developed and maintained by a venture-backed team. Bit is adopted by more organizations and communities every day.*

## Contents

- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
- [Examples](#examples)
- [Example Workflow](#example-workflow)
- [Motivation](#motivation)
- [Contributing](#contributing)
- [Docs](https://docs.bitsrc.io)
- [Website](https://bitsrc.io)


## How It Works

### Effortless code sharing

Instead of having to split repositories and create new ones just to publish packages, Bit helps you seamlessly isolate components (sets of files) from any existing repository and share them to be used, developed and synced in other projects.

To share components you don’t need to refactor or configure anything. Instead, Bit automatically [detects]((https://docs.bitsrc.io/docs/isolating-and-tracking-components.html)) the component’s dependency graph (including package / file / component dependencies) and creates an [isolated environment](https://docs.bitsrc.io/docs/ext-concepts.html) for every component. 

This environment enables you to to use and develop components from other projects.
For example, components written in typescript can be used and developed in a project written in flow-typed. It also lets Bit test and build your components in isolation, so you can know the exact state of every component.

### Development from different repositories

You can use Bit to [import](https://docs.bitsrc.io/docs/importing-components.html) components into any project you’re working on. Importing a component means you can use it and also make changes and continue to develop it from your project. Bit will track your components across different projects to sync changes between them.


Once shared to Bit’s hub, components automatically become available to [install as packages](https://docs.bitsrc.io/docs/installing-components-using-package-managers.html) using NPM and Yarn. This means you can turn any part of any repository into a package without refactoring or splitting the repository.

Combining the two workflows also allows you to easily make changes to components installed as packages right from any project consuming them.


### Syncing changes between projects

Since Bit tracks components across different projects, you can [update](https://docs.bitsrc.io/docs/updating-sourced-components.html) components with new versions and suggest updates to components shared by your team. When a component is changed in your project, Bit leverages Git’s merge utility to let you [merge](https://docs.bitsrc.io/docs/merge-changes.html) component changes between your projects.

This workflow also helps you learn exactly which components are used by who and where, so you can easily make changes to components in multiple projects with universal control over your dependency graph.

### Discoverability and teamwork

While making code sharing easier, Bit helps you organize your components and make them discoverable for your team to find and choose from.

Using a semantic component search engine and features such as  a [live playground](https://blog.bitsrc.io/introducing-the-live-react-component-playground-d8c281352ee7) for component visualization, auto-parsed docs, test results and more, Bit makes it simpler to collaborate and share your favorite components.

Here is [an example](https://bitsrc.io/bit/movie-app) of React UI components organized, rendered, tested and made discoverable via [Bit’s hub](https://bitsrc.io).


### Extending Bit

Bit can be extended for a variety of purposes and integrated into your favorite tools. For example, you can create and use Bit extensions to [build](https://docs.bitsrc.io/docs/building-components.html), [test](https://docs.bitsrc.io/docs/testing-components.html), [render](https://docs.bitsrc.io/docs/rendering-components.html), bundle, lint, pack, publish and optimize the workflow around your components.


## Getting Started

* [Quick start](https://docs.bitsrc.io/docs/quick-start.html)
* [Bit with React](https://docs.bitsrc.io/tutorial/react-tutorial.html) 

#### Basics

1. [Installation](https://docs.bitsrc.io/docs/installation.html)
2. [Initializing Bit](https://docs.bitsrc.io/docs/initializing-bit.html)
3. [Isolating components](https://docs.bitsrc.io/docs/isolating-and-tracking-components.html)
4. [Versioning components](https://docs.bitsrc.io/docs/versioning-tracked-components.html)
5. [Sharing components](https://docs.bitsrc.io/docs/organizing-components-in-scopes.html)
6. [Installing components with NPM](https://docs.bitsrc.io/docs/installing-components-using-package-managers.html)
7. [Modifying components with Bit](https://docs.bitsrc.io/docs/importing-components.html)
8. [Merging component changes](https://docs.bitsrc.io/docs/merge-versions.html)

#### Advanced:

* [Building components](https://docs.bitsrc.io/docs/building-components.html)
* [Testing components](https://docs.bitsrc.io/docs/testing-components.html)
* [Rendering UI components](https://docs.bitsrc.io/docs/rendering-components.html)
* [Documenting components](https://docs.bitsrc.io/docs/documenting-components.html)
* [Removing components](https://docs.bitsrc.io/docs/removing-components.html)
* [Extending Bit](https://docs.bitsrc.io/docs/ext-concepts.html)
* [Configuring Bit](https://docs.bitsrc.io/docs/conf-bit-json.html)
* [Troubleshooting](https://docs.bitsrc.io/docs/latest-version.html)
* [CLI reference](https://docs.bitsrc.io/docs/cli-add.html)

## Examples

### Bit with React / Vue

Tutorial: [Bit with React](https://docs.bitsrc.io/tutorial/react-tutorial.html).

UI components are often designed with reusability in mind.

As such, Bit can be a powerful tool for sharing these components between app and projects.

For example, here is a [React movie-application project](https://github.com/teambit/movie-app) that contains 8 reusable UI components and 1 global-styles component.

Using Bit, all of these components were isolated and shared from the repository, and organized in [this Scope](https://bitsrc.io/bit/movie-app).

Every component can now be [played with online](https://blog.bitsrc.io/introducing-the-live-react-component-playground-d8c281352ee7), installed using NPM or imported into any project for further development.

Here’s an example [React hero component](https://bitsrc.io/bit/movie-app/components/hero) from this Scope.

[![React Hero component](https://storage.googleapis.com/bit-docs/react-hero-component%20(2).gif)](https://bitsrc.io/bit/movie-app/components/hero).


### Node.js modules and common code

Some teams use Bit to sync common code between Node.js repositories and services. We [use Bit to sync](https://blog.bitsrc.io/how-we-successfully-share-and-reuse-code-between-microservices-at-scale-20fcfaebc6d0) over 250 shared components between our Node.js microservices (!). 

Bit is useful for preventing duplicate code while making maintenance easier.

### Shared libraries

You can use Bit to turn any shared-lib into a dynamic collection of individual components.

Here’s an example GitHub [community-made UI library](https://github.com/GSS-FED/vital-ui-kit-react) with React. The library’s authors shared their components with Bit, making them available to discover and use [from this Scope](https://bitsrc.io/gssfed/vital-ui-kit-react). 

Here’s an example of the React Card component in Bit’s live playground.

[![React Card component](https://storage.googleapis.com/bit-docs/react-card-component.gif)](https://bitsrc.io/gssfed/vital-ui-kit-react/packages/card).


### More 

Bit can be useful for sharing any common component, functionality and module including **[GraphQL APIs](https://hackernoon.com/make-your-graphql-api-easier-to-adopt-through-components-74b022f195c1)**, **Serverless functions**, **Utility functions** and more.


### Example workflow

Let’s use Bit to isolate and share the `button`, `login` and `logo` React UI components in the following repository file structure, and make them available to use in other projects.

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

2. Next, let’s [initialize Bit](https://docs.bitsrc.io/docs/initializing-bit.html) for the project.

```bash

$ cd project-directory
$ bit init

```

3. Now, let’s [track the components](https://docs.bitsrc.io/docs/isolating-and-tracking-components.html) using `bit add` and let Bit detect their file / package dependency graphs.

```bash

# Use a glob pattern to track multiple components in the same path, or specific paths to track specific components.
$ bit add src/components/* 

```

4. Next, let’s import [build](https://docs.bitsrc.io/docs/building-components.html) and [test](https://docs.bitsrc.io/docs/testing-components.html) environments to let Bit build, render and test the components in isolation. You can use [pre-made environemnts](https://bitsrc.io/bit/envs) or [implement your own](https://docs.bitsrc.io/docs/ext-developing-extensions.html)).

```bash

# Import an environment to build and render the components
$ bit import bit.envs/bundlers/webpack-css-modules --compiler

# Import an environment to test the components in isolation
$ bit import bit.envs/testers/karma-mocha --tester

```

5. Now, let’s [tag](https://docs.bitsrc.io/docs/versioning-tracked-components.html) the components and let Bit lock the component’s version and dependency graph.

```bash

$ bit tag --all 1.0.0

```

6. Next, let’s create a remote Scope on [Bit’s hub](https://bitsrc.io) for your components. From the Scope your components can be discovered, used and synced in your projects.
Once created, let’s [export](https://docs.bitsrc.io/docs/organizing-components-in-scopes.html) the components to the Scope. This will not remove them from the repo or change its structure at all.

```bash

# Export the components to your remote Scope
$ bit export username.scopename  # Share components to this Scope

```
Note that using the `--eject` flag you can also remove an exported component from your source-code and add it as a package dependency in your project’s `package.json` file.

That’s it. 

Your components are now organized in your Scope and can be discovered, [installed](https://docs.bitsrc.io/docs/installing-components-using-package-managers.html) (NPM) and [developed](https://docs.bitsrc.io/docs/importing-components.html) (`bit import`) from any other project. Bit will keep tracking the components across projects, so you can easily [update](https://docs.bitsrc.io/docs/updating-sourced-components.html)  and [merge](https://docs.bitsrc.io/docs/merge-changes.html) changes between them.


## Motivation

Learn more about the journey towards turning components into the lego-like building blocks of different projects and applications, why Bit was created and what the future holds on [Bit’s blog](https://blog.bitsrc.io/).

You can also check out Bit on **FreeCodeCamp** and **Hackernoon**.

* “[How we started sharing components as a team](https://hackernoon.com/how-we-started-sharing-components-as-a-team-d863657afaca)” 
* “[What music can teach us about how we share code](https://medium.freecodecamp.org/what-music-can-teach-us-about-the-way-we-share-code-a69c30ebded8)”

## Supported Languages

Bit's design is language agnostic. Still, as of today, it requires language-specific drivers for language-sensitive features (binding etc). We released Bit’s driver for Javascript, and will be releasing more drivers in the future. You are also welcome to add your own.

* [bit-javascript](https://github.com/teambit/bit-javascript).

## Contributing

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## Feedback

Feedbacks and questions are more than welcome via Bit's [Gitter channel](https://gitter.im/bit-src/Bit).

## License

Apache License, Version 2.0

![Analytics](https://ga-beacon.appspot.com/UA-96032224-1/bit/readme)
