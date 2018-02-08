
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

Building your codebase out of smaller pieces if great for better modularity, reusability, separation of concerns and mitigation of development pain.

However, sharing code and making changes across repositories and projects can quickly become painful and generate a lot of overhead.

Bit works with Git and NPM to combine the speed of copy-pasting with the advantages of managed code sharing, so you can share code and manage changes with zero overhead.
It’s workflow enables you to easily share code from any repository, change it from any project and easily track changes across your codebase.

*Bit is a collaborative open source project, actively maintained by a venture-backed team and used by different organizations and OSS communities*.


#### Contents

- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
- [Use Cases And Examples](#use-cases-and-examples)
- [Motivation](#motivation)
- [Contributing](#contributing)
- [Docs](https://docs.bitsrc.io)
- [Website](https://bitsrc.io)

## How It Works

### Faster code sharing

Splitting your codebase into more repositories just to publish packages requires a lot of overhead. So does handling the configurations needed for each of these packages.

To eliminate this overhead Bit lets you share code directly from any existing repository without having to create new repositories or boilerplate multiple packages.

Instead, you can use Bit to track code you would like to share from your repository, isolate it by [automatically defining](https://docs.bitsrc.io/docs/isolating-and-tracking-components.html) its dependency tree (both package dependencies and other files in the project) and easily [share them](https://docs.bitsrc.io/docs/organizing-components-in-scopes.html) to a remote shared location called a Scope. This will not change your existing project’s code or structure at all. 

Bit also helps to reduce the overhead of [build](https://docs.bitsrc.io/docs/building-components.html) and [test](https://docs.bitsrc.io/docs/testing-components.html) configruations for shared code by leting you easily define these environments for code shared from your project.

### Installing with package managers

Once shared to a remote Scope, your code can be installed as a package using your favorite package manager (Yarn / NPM) without having to use Bit at all. You can read more about it [here](https://docs.bitsrc.io/docs/installing-components-using-package-managers.html).


### Making changes from any project

Making changes to shared code across multiple repositories can get very messy very quickly. Modifying packages is also a cumbersome process that requires a lot of overhead.

Bit simplifies this workflow by letting to import the shared source code itself into any of your projects, changing it, and sharing the updated version back to the remote Scope to update changes across between projects. When sharing, you can also eject the imported source code and automatically replace it with a package dependency for your project.

This means you can easily change and edit shared code from any project in a distributed development workflow, and Bit will track changes across your codebase. If a project is consuming shared code as a package dependency, then once the package is updated with a new version your package manager will be able to automatically update like any other package.

### Better discoverability and control

Bit helps you gain control over the code shared throughout your projects. You can easily organize and discover all your shared code in a single place, manage versions, learn which pieces of code already exist (sometimes more than once) and search for shared code throughout your codebase.

Bit also provides improved discoverability through useful visual information for your shared code, including auto-parsed docs and examples, test and build results and even live rendering for UI components ([alpha example](https://bitsrc.io/bit/movie-app)).

Using Bit you can also gain control over your universal dependency graph, and easily make multiple changes to code shared in multiple repositories throughout your codebase without breaking anything.

### Extending Bit

You can extend Bit to integrate with your favorite dev tools to build, test, bundle, lint, pack, publish and optimize the workflow around shared code any way you choose.

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

Let’s use Bit to track these components

```
bit add src/components/* # use a glob pattern to track multiple components or a single path to track a single component.
```

Now let’s use Bit to lock a version and define their dependencies

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

Instead of working hard to maintain and update multiple repositories and multiple packages just to share code, we wanted to provide a better workflow for code sharing.

Learning from what iTunes did for music sharing in the post CD-Rom, we decided to build a tool that will make managed code sharing as fast and simple as copy-pasting.

The key to Bit’s capabilities lies in its ability to decouple the representation of shard code from the project’s file system. This allows the tracking of source code even when implemented and sourced in different repositories. By integrating with the existing Git / NPM ecosystem, Bit helps to smooth the code sharing workflow and makes it easier to track changes which can be used in both multi-repo and monorepo architectures.

After using it for over a year, and after being used by more teams and communities every day, we welcome you to join and use Bit for your work or take part in its development.

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
