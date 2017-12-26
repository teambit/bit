# Bit
[![Bit communit hub](https://storage.googleapis.com/bit-assets/Github/readme-github-3.jpg)](http://bitsrc.io)

<div style="text-align:left">
  <a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/vg7wvfvku12kkxkc?svg=true"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield&circle-token=d9fc5b19b90fb7e0655d941a5d7f21b61174c4e7"></a>

</p>

</div>

[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

[Community](https://bitsrc.io) • [Docs](https://docs.bitsrc.io) • [Video](https://www.youtube.com/watch?v=vm_oOghNEYs) • [Examples](https://bitsrc.io/bit/movie-app#styles) • [Gitter](https://gitter.im/bit-src/Bit) • [Blog](https://blog.bitsrc.io/)

**Bit** - Build applications with reusable components, in a component-driven distributed workflow.

It integrates into your existing ecosystem (Git, Yarn, NPM) and creates a lightning-fast experience for sharing code between projects and teams. You can easily isolate and share components directly from any project’s source code without changing it, and organize them as building blocks for your team to use in different projects and build new things. 

Bit helps you cut the time for building new applications and features, eliminates the maintenance overhead of additional repositories and packages, helps to keep your code DRY and saves your time & resources for building new features and applications.

**Distributed component development workflow**

- Quickly isolate and share components directly from any path in your repository, without changing your source-code or having to maintain additional repos/packages.

- Organize components in curated collections to make them discoverable for you and your team. Extend Bit to visually render, test, compile and parse useful information for your components without having to spend hours writing documentation.

- Source and develop components from different repositories, while collaborating with a single source of truth.

- Install components using Yarn or NPM, even if shared with Bit.

- Easily learn exactly which components are being used by who and where, and make multiple component changes in multiple projects without breaking a single one of them.

Bit is a collaborative open source project, actively maintained by a venture-backed team and used by different organizations and OSS communities.

## Use Cases

**UI / Web components**: Organize, share and reuse React, Vue and Angular components between projects.
* Tutorial: [Bit with React](https://docs.bitsrc.io/react-tutorial.html).
* An [example React app](https://github.com/itaymendel/movie-app) with 9 React components shared and made [individually available](https://bitsrc.io/bit/movie-app) with Bit.

**Node.js modules**: Share and sync Node.js components between micro-services in a multi-repo architecture.
* Tutorial: [Bit with Node.js](https://docs.bitsrc.io/node-tutorial.html).

**Shared Libraries**: use Bit to easily turn any shared-lib into a dynamic collection of individual components.


* Tutorial: [Bit with Shared Libraries](https://docs.bitsrc.io/shared-lib-main.html).

Additional use cases: **GraphQL APIs**, **Serverless functions**, **Utility functions** and any encapsulated, reusable functionality.

## Supported Languages
Bit's design is language agnostic. Still, it requires language-specific drivers for language-sensitive features (binding etc):

* [bit-javascript](https://github.com/teambit/bit-javascript)

## Quick Start

Let's add Bit to a repository to isolate and share components.

### Install Bit

`npm install bit-bin -g`

See additional [installation methods](https://teambit.github.io/bit/installation.html).

### Initialize Bit on a repository

To start isolating components in your repository (UI components, small modules, reusable functions etc), we will need to initialize Bit for your repository.  

Go to your repository root directory and execute `bit init`.

```sh
MacbookPro:src bit$ cd my-repository
MacbookPro:src bit$ bit init
successfully initialized Bit on the repository.
```

### Create a component collection

A scope is a collection of shared components with a common theme or ownership. 
Scopes group and organize components together, so that they can be discovered and synced in additional projects.

Let's create a free Scope on the [Bit community hub](https://bitsrc.io/signup).
You can also think of it as your "component cloud".

Scopes are lightweight and can also be [set up on any server](https://teambit.github.io/docs/advanced.html#host-your-own-scope), much like Git repositories.

### Isolate and track reusable component(s) in your repository

Bit enables you to isolate and track any subset of files in your repository as a reusable component.

Let's isolate the components `button`, `login` and `logo` in the following project's directory structure.

```
MacbookPro:src bit$ tree . -I node_modules
.
├── App.js
├── App.test.js
├── components
│   ├── button
│   │   ├── Button.js
│   │   ├── Button.spec.js
│   │   └── index.js
│   ├── login
│   │   ├── Login.js
│   │   ├── Login.spec.js
│   │   └── index.js
│   └── logo
│       ├── Logo.js
│       ├── Logo.spec.js
│       └── index.js
├── favicon.ico
└── index.js

4 directories, 13 files
```

To isolate and track these directories as reusable components, lets use the `bit add` command.

This command also accepts a glob pattern, so you can track multiple components at once.

In this case, we have 3 components in the "components" directory. Let's track all of them.
We'll also use the `bit tag` command to lock component versions and dependencies in place.

```sh
bit add components/*
bit tag --all
```

Now, let's share these components to the Scope we created on the Bit community hub.

```
bit export {{owner}}.{{scope}}
```

That's it.
Once done, you will see your components individually available here in this Scope. Browse and take a look.

For additional usage examples [click here]({{docs}}/usage.html#adding-component).

As an example, here is a [React app repo](https://github.com/itaymendel/movie-app) and a [matching Scope](https://bitsrc.io/bit/movie-app), where its different components are shared.

#### You can also create an empty component

```sh
touch empty-component.js
bit add empty-component.js
bit tag --all
bit export {{owner}}.{{scope}}
```

### Import Components

Bit enables you to import individual components for a Scope, and keep them sync between projects.
You can install a component as an application-part in any destination on your project’s file system.

Let's import the components we just created to a new project.

1. Create a new directory for the consuming project.
2. Initialize a new scope using the `bit init` command.
3. Import the component:

```sh
bit import <username>.<scopename>/components/button
```

You can now use the component in your new project:

```
const component = require('./components/button');
```

### Updating Components

A component can be updated from any project using it.

To update a component, simply change the code from inside your project's context. 
Then tag it again, and export it back to your Scope as a new version of your component.

1. Open the file you just imported.
2. Make changes.
3. Run the `bit status` command to check that `components/button` has been modified.
4. Tag a new version for the component:

```sh
bit tag -am "updated component"
```

5. Export the new version of the component back to the Scope:

```sh
bit export <username>.<scopename>
```

Now you can go back to your browser, and see that there's a new version for `components/button` with the changes we've made from the consumer project.

* You can find the full getting started guide [here](https://teambit.github.io/bit/getting-started.html).
* You can find a list of command examples [here](https://docs.bitsrc.io/en/article/usage).

## Motivation

Every day, more software is being built with smaller, encapsulated and reusable components. From UI and Web components to reusable functionalities, GraphQL APIs an even serverless functions, smaller components are the building blocks of our future software.

The way we share code between projects and people was designed for larger projects. As a result, when working with smaller components we still have to choose between cumbersome shared libraries or an arsenal of micro-packages. Both suffer from the same problems we had while using music CD-Roms before our iTunes playlists: they require great overhead, they are hard to change and maintain at scale and they make it hard to discover and use single components. As a result, we often write more of the same things or duplicate code between projects. 

Our vision is to enable any developer to easily share, discover and compose components together in order to build any software application. We believe that through powerful and effective experience for modularity, sharing and collaboration we can speed and improve the way we build technology.

Although it is a work in progress, feel free to get started.
Learn more on Hackernoon: "[How we started sharing components as a team](https://hackernoon.com/how-we-started-sharing-components-as-a-team-d863657afaca)".*

## Contributing

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## Feedback

Feedbacks and questions are more than welcome via Bit's [Gitter channel](https://gitter.im/bit-src/Bit).

## License

Apache License, Version 2.0

![Analytics](https://ga-beacon.appspot.com/UA-96032224-1/bit/readme)
