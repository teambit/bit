
[![Bit community hub](https://storage.googleapis.com/bit-docs/Github%20cover2.png)](http://bitsrc.io)

  <a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/vg7wvfvku12kkxkc?svg=true"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield&circle-token=d9fc5b19b90fb7e0655d941a5d7f21b61174c4e7">
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=Share%20code%20components%20as%20a%20team%20@bit_src&url=https://bitsrc.io&hashtags=opensource,javascript,programming,reactjs,webdev,vuejs,angularjs)

[Hub](https://bitsrc.io) • [Docs](https://docs.bitsrc.io) • [Video](https://www.youtube.com/watch?v=vm_oOghNEYs) • [Examples](https://bitsrc.io/bit/movie-app#styles) • [Gitter](https://gitter.im/bit-src/Bit) • [Blog](https://blog.bitsrc.io/)

## About 

**Bit makes it easier to share code and update changes in multiple projects**. 

Separating concerns provides greater modularity, clear ownership, shorter learning curves and helps to mitigate development pain.

However, sharing code and managing changes across multiple projects and teams can become very hard very quickly, generating a lot of painful overhead.

Bit works with Git and NPM to make it easy to share code and manage changes across multiple repositories, with greater discoverability and less overhead. Its workflow provides the speed and efficiency of copy-pasting, while still keeping everything tracked and managed.

Bit is a collaborative open source project, actively maintained by a venture-backed team and used by different organizations and OSS communities.

#### Contents

- [How It Works](#how-it-works)
- [Use Cases And Examples](#use-cases-and-examples)
- [Getting Started](#getting-started)
- [Motivation](#motivation)
- [Contributing](#contributing)
- [Docs](https://docs.bitsrc.io)
- [Website](https://bitsrc.io)

## How It Works

### Faster sharing

Bit helps you isolate and share source code components (subsets of files) directly from any path in your Javascript repository and use them in other repositories without having to change the original repository's source code or maintain additional ones. 

You can point Bit to the components you would like to share, isolate them (Bit applies an automatic dependency definition to speed sharing) and share them into a remote source of truth that allows you to easily sync them between different projects. 

### Cross-repo change management

Bit helps you easily track and manage changes to shared code in any number of repositories, using a remote source of truth called a Scope.

You can import shared components into other projects and simultaneously develop them from different repositories. Changes made to imported components can be shared back to the Scope (creating a new version), and updated across different repositories.

If you share your components to the open [bitsrc registry](https://bitsrc.io), you can also install components using NPM or Yarn. Changes can still be applied to the shared source-code and shared back to the Scope, enabling updates across the consuming repositories. 

### Discoverability and control

Bit helps you create a single place where you can organize and discover the building blocks shared throughout your projects. You can learn which pieces of source code already exist (sometimes more than once) in your different repositories, organize different versions for different teams and search for components throughout your entire database.

Bit also makes it easy to learn exactly which components are used by who and where, to safely make multiple changes in multiple repositories with absolute control over your dependency graph.

### Extending Bit 

Bit can be extended to optimize the workflow around reusable components and modules. You can render UI components, test and build components and modules in an isolated environment, parse docs and examples from the source code itself and even publish components to NPM.

## Use Cases And Examples

#### UI / Web components

Share and sync UI components (React, Angular, Vue etc) between projects.

* Tutorial: [Bit with React](https://docs.bitsrc.io/tutorial/react-tutorial.html).

* An [example React app](https://github.com/itaymendel/movie-app) with 9 React components shared and made [individually available](https://bitsrc.io/bit/movie-app) with Bit.

#### Node.js modules

Share and sync Node.js modules between micro-services in a multi-repo architecture.

#### Eliminating shared Libraries

Use Bit to turn any shared-lib into a dynamic collection of individual components.

Additional use cases: **GraphQL APIs**, **Serverless functions**, **Utility functions** and any encapsulated, reusable functionality.

## Quick Start

### [Quick-start tutorial](https://docs.bitsrc.io/docs/quick-start.html).

1. [Installation](https://docs.bitsrc.io/docs/installation.html).
2. [Initializing Bit on a project](https://docs.bitsrc.io/docs/initializing-bit.html).
3. [Isolating and tracking components](https://docs.bitsrc.io/docs/isolating-and-tracking-components.html).
4. [Versioning and locking dependencies](https://docs.bitsrc.io/docs/versioning-tracked-components.html).
5. [Sharing from your project](https://docs.bitsrc.io/docs/organizing-components-in-scopes.html).
6. [Installing with NPM/Yarn](https://docs.bitsrc.io/docs/installing-components-using-package-managers.html).
7. [Modifying components from different projects](https://docs.bitsrc.io/docs/importing-components.html).

## Usage: 

* [CLI reference](https://docs.bitsrc.io/docs/cli-add.html).

## Advanced:

* [Building components](https://docs.bitsrc.io/docs/building-components.html).
* [Testing components](https://docs.bitsrc.io/docs/testing-components.html).
* [Documenting components](https://docs.bitsrc.io/docs/documenting-components.html).
* [Removing components](https://docs.bitsrc.io/docs/removing-components.html).
* [Extending Bit](https://docs.bitsrc.io/docs/ext-concepts.html).
* [Configuring Bit](https://docs.bitsrc.io/docs/conf-bit-json.html).
* [Troubleshooting](https://docs.bitsrc.io/docs/latest-version.html).


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
