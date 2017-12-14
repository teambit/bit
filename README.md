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

Bit connects great tools like Git, Yarn and NPM to form a frictionless code sharing experience between repositoires and people. If shared libraries are a music CD-Rom, Bit is your component playlist. 

Bit provides a distributed component development workflow. You can isolate components in any Git repository, and quickly share them to dynamic and curatable collections of components. From there, components can be individually found and consumed with package managers like Yarn/NPM or sourced in any repository for further modifications.

* Share individual components quickly, without changing your source-code and from any path in your repository.
* Keep a single source of truth for components, while developing or sourcing components in any repository.
* Organize components in curated and dynamic collections. Explore and discover components in your component collections.
* Consume components with NPM, Yarn or any other package manager.
* Get control and learn which components are used by who and where. Easily make vast changes across projects and components, and gain full control over your dependency graph.

Bit is a collaborative open source project, actively maintained by a venture-backed team and used by different organizations and OSS communities.

## Use Cases

Share and sync UI components (React, Angular etc) between projects.
* Tutorial: [Bit with React](https://docs.bitsrc.io/react-tutorial.html).

Share and sync Node.js components between micro-services in a multi-repo architecture.
* Tutorial: [Bit with Node.js](https://docs.bitsrc.io/node-tutorial.html).

Shared library: use Bit as "component iTunes" for your static shared library.
* Add Bit to a project ([example React app](https://github.com/itaymendel/movie-app)) to make its components [individually available](https://bitsrc.io/bit/movie-app) to discover and install from an organized collection.
* Tutorial: [Bit with Shared Libraries](https://docs.bitsrc.io/shared-lib-main.html).

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

## Why Bit

Over the past 2 years, our team grew to include more developers working on more projects.

Over time, we found it increasingly hard to share our code and keep it synced between projects. Determined to avoid duplications, we considered many solutions from an arsenal of small repos and packages to shared static libraries.
However, issues such as publish overhead, discoverability, and maintainability prevented us from truly sharing and syncing our components as a team between our projects.

The idea of Bit is that we can keep our components as an integral part of our repository and still natively integrate them into other repositories, without forcing any source code changes.
You can think of Bit as a “virtual monorepo” for sharing and syncing components across repositories.

Using Bit, we were able to create node.js micro-services composed entirely of shared components and share our arsenal of React components across apps.
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
