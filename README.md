
[![Bit community hub](https://storage.googleapis.com/bit-docs/Github%20cover2.png)](http://bitsrc.io)

  <a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/vg7wvfvku12kkxkc?svg=true"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield&circle-token=d9fc5b19b90fb7e0655d941a5d7f21b61174c4e7">
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=Share%20code%20components%20as%20a%20team%20@bit_src&url=https://bitsrc.io&hashtags=opensource,javascript,programming,reactjs,webdev,vuejs,angularjs)

[Hub](https://bitsrc.io) • [Docs](https://docs.bitsrc.io) • [Video](https://www.youtube.com/watch?v=vm_oOghNEYs) • [Examples](https://bitsrc.io/bit/movie-app#styles) • [Gitter](https://gitter.im/bit-src/Bit) • [Blog](https://blog.bitsrc.io/)

## About 

**Bit makes it easier to share code and manage changes across projects**. 

Separating concerns provides greater modularity and reusability, clear ownerships, shorter learning curves and helps to mitigate development pain.

However, sharing code and tracking changes between projects and team members can quickly become very painful and generate a lot of overhead.

Bit works with Git and NPM to make it easy to share code and manage changes across multiple repositories, with greater discoverability and less overhead. Its workflow provides the speed and efficiency of copy-pasting, while still keeping everything tracked and managed.

Bit is a collaborative open source project, actively maintained by a venture-backed team and used by different organizations and OSS communities.


#### Contents

- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
- [Use Cases And Examples](#use-cases-and-examples)
- [Motivation](#motivation)
- [Contributing](#contributing)
- [Docs](https://docs.bitsrc.io)
- [Website](https://bitsrc.io)

## How It Works

### Faster sharing

Keeping separate repositories or boilerplating multiple packages for different components and modules requires a lot of overhead. Bit eliminates this overhead by letting you share code directly from its original project, without having to restructure it or configure multiple packages within it. 

To share code you can simply point Bit to the components you would like to share, isolate them (Bit applies an automatic dependency definition to speed sharing) and share them into a remote source of truth called a Scope. From there, they can be installed with package managers like NPM and Yarn or sourced in multiple projects. Bit also helps to reduce the overhead of configuring build and test environments for multiple components by allowing you to define a component environment for components shared from your project.

### Updating and tracking changes

Changing a package’s source code also usually up a lot of time and effort. Bit helps you mitigate this pain using a remote source of truth called a Scope. From the Scope components can be installed using package managers or imported into different repositories to continue to develop their source code in a distributed workflow. 

This means you can change and edit any component from any project, and let Bit track changes for your. To update a package you will simply need to import it’s source code, change it, and share it back out while making sure to require the bumped version if you choose to.  Using Bit you can easily learn exactly which components are used in which project to safely make multiple changes in multiple projects without breaking anything, while gaining universal control over your dependency graph.

### Full discoverability

Bit helps you create a single place where you can organize and discover the building blocks shared throughout your projects. You can learn which pieces of source code already exist (sometimes more than once) in your different repositories, organize different versions for different teams and search for components throughout your entire database.

It also provides useful visual information for your components via it’s Hub, including auto-parsed docs and examples, test and build results and even live rendering for UI components (alpha).


### Extending Bit

Bit can be extended and integrated to your favorite dev tools so that you can optimize the workflow around reusable components and modules. You can extend Bit build and test components, render UI components, parse docs and examples and even publish shared code to NPM.

## Getting Started

### Tutorials

* [Quick Start](https://docs.bitsrc.io/docs/quick-start.html)
* [Bit with React](https://docs.bitsrc.io/tutorial/react-tutorial.html)

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

#### Example workflow

Let’s share the UI components `button`, `login` and `logo` in the following project’s directory structure.

```
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

First let’s install Bit

```
npm install bit-bin -g
```

Let’s init Bit for the project

```
cd project-directory
bit init
```

Now let’s point Bit to these components

```
bit add src/components/* # use a glob pattern to track multiple components or a single path to track a single component.
```

Tell Bit to lock a version and define dependencies

```
$ bit tag --all 1.0.0
3 components tagged | 3 added, 0 changed, 0 auto-tagged
added components:  components/button@1.0.0, components/login@1.0.0, components/logo@1.0.0
```

Now let’s share the components to a [remote Scope](https://bitsrc.io)

```
$ bit export username.scopename  # Share components to this Scope
exported 3 components to scope username.scopename
```
Note that using the `--eject` flag you can remove an exported component from your source-code and add it as a package dependency in your project’s `package.json` file.

That’s it. You can now install components using NPM and Yarn or use Bit to easily edit and update their code from any project. 

[GET STARTED HERE](https://docs.bitsrc.io/docs/quick-start.html)

#### Example project

Here is a simple [React app](https://github.com/itaymendel/movie-app) with 8 reusable components located in its src/components directory and one component which is the global styles.

By using Bit to track and share these components, they are now made available to discover, install and update from [this Scope](https://bitsrc.io/bit/movie-app).

#### Use cases:

##### UI / Web components

Share and sync UI components (React, Angular, Vue etc) between projects.

Tutorial: [Bit with React](https://docs.bitsrc.io/tutorial/react-tutorial.html)


##### Node.js modules

Share and sync Node.js modules between micro-services in a multi-repo architecture.

##### Shared libraries

Use Bit to turn any shared-lib into a dynamic collection of individual components.

Additional use cases: **GraphQL APIs**, **Serverless functions**, **Utility functions** and any encapsulated, reusable functionality.


## Motivation

Modularity has always been the holy grail of software development.

Whether it's being strived for through multiple repositories or through multi-package repositories, it provides greater flexibility, reusability, testability and separation of concerns through smaller encapsulated pieces (see the [FIRST principle](https://addyosmani.com/first/) by Addy Osmani).

Regardless of architecture, Bit was created to make it easy to **share**, **discover** and **update** shared source code components. It enables better modularity and composition of smaller pieces to build larger things. It does so by making it easier to share code, manage it and collaborate together to compose it into new applications. Feel free to [visit our website](https://bitsrc.io) or [learn more on Hackernoon](https://hackernoon.com/how-we-started-sharing-components-as-a-team-d863657afaca).

## Supported Languages

Bit's design is language agnostic. Still, it requires language-specific drivers for language-sensitive features (binding etc):
* [bit-javascript](https://github.com/teambit/bit-javascript).

## Contributing

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## Feedback

Feedbacks and questions are more than welcome via Bit's [Gitter channel](https://gitter.im/bit-src/Bit).

## License

Apache License, Version 2.0

![Analytics](https://ga-beacon.appspot.com/UA-96032224-1/bit/readme)
