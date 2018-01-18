
[![Bit communit hub](https://storage.googleapis.com/bit-docs/Github%20cover2.png)](http://bitsrc.io)

  <a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/vg7wvfvku12kkxkc?svg=true"></a>
  <a href="https://github.com/teambit/bit/blob/master/CHANGELOG.md"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield&circle-token=d9fc5b19b90fb7e0655d941a5d7f21b61174c4e7">
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

[Hub](https://bitsrc.io) • [Docs](https://docs.bitsrc.io) • [Video](https://www.youtube.com/watch?v=vm_oOghNEYs) • [Examples](https://bitsrc.io/bit/movie-app#styles) • [Gitter](https://gitter.im/bit-src/Bit) • [Blog](https://blog.bitsrc.io/)

## About 

**Bit makes it easier to share code and update changes in multiple projects**. 

Seperating concerns provides greater modularity, clear ownerships, shorter learning curves and helps to mitigate development pain.

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

### Cross-repo change managment

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

* Tutorial: [Bit with React](https://docs.bitsrc.io/react-tutorial.html).

* An [example React app](https://github.com/itaymendel/movie-app) with 9 React components shared and made [individually available](https://bitsrc.io/bit/movie-app) with Bit.

#### Node.js modules

Share and sync Node.js modules between micro-services in a multi-repo architecture.

* Tutorial: [Bit with Node.js](https://docs.bitsrc.io/node-tutorial.html).

#### Eliminating shared Libraries

Use Bit to turn any shared-lib into a dynamic collection of individual components.

* Tutorial: [Bit with Shared Libraries](https://docs.bitsrc.io/shared-lib-main.html).

Additional use cases: **GraphQL APIs**, **Serverless functions**, **Utility functions** and any encapsulated, reusable functionality.

## Getting Started

Let's use Bit to isolate and share components from a repository, import them into other repositories and update changes between them.

### Install Bit

`npm install bit-bin -g`

See additional [installation methods](https://teambit.github.io/bit/installation.html).

### Initialize Bit on a repository

To start isolating components in your repository you will need to initialize Bit for your repository.  

Go to your repository root directory and execute `bit init`.

```sh
MacbookPro:src bit$ cd my-repository
MacbookPro:src bit$ bit init
successfully initialized Bit on the repository.
```

### Organize your shared code

To organize your shared components Bit uses scopes.

A scope is a collection of shared components with a common theme or ownership. 
It’s key role is to serve as a source of truth for shared code across different repositories.

Let's create a free Scope on the [Bit community hub](https://bitsrc.io/signup) - so we could gain more discoverability, run tests in isolation and install components using Yarn / NPM if we choose to.

Much like Git repositories, scopes are lightweight and can be [set up on any server](https://teambit.github.io/docs/advanced.html#host-your-own-scope).

### Share source code components directly from your repository

Bit enables you to track subsets of files in your repository as reusable components and isolate them so that when they are shared they are also ready to execute.

Let's isolate the UI components `button`, `login` and `logo` in the following project's directory structure.

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

To start tracking these UI components use the `bit add` command.
This command also accepts a glob pattern, so you can track multiple components at once.

In this case, we have 3 components in the "components" directory. Let's track all of them.

We'll also use the `bit tag` command to lock component **versions** and **dependencies** in place (note that Bit uses **automatic dependency definition** to make sharing even quicker). 

```sh
bit add components/*
bit tag --all
```

Now, let's share these components to the Scope we created.

```
bit export {{owner}}.{{scope}}
```

That's it.

Once done, you can discovere the components you just shared in your Scope ([example](https://bitsrc.io/bit/movie-app)). 
For additional usage examples [click here]({{docs}}/usage.html#adding-component).

#### You can also create an empty component

```sh
touch empty-component.js
bit add empty-component.js
bit tag --all
bit export {{owner}}.{{scope}}
```
### Import the shared components

You can **import** shared components into other repositories using Bit.

Importing means you can install a component as an application-part in any destination on your project’s file system. It will still be tracked by Bit, so you can continue to develop it from different repositories and update changes between them.

**Note that if shared to the [bitsrc registry](https://bitsrc.io), components and modules can also be installed with your native NPM/Yarn client**.

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

A component can be easily updated between projects by simply changing the code from inside your project's context,
tagging it again, and exporting it back to your scope as a new version of the component.

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

Modularity has always been the holy grail of software development.

Whether it's being strived for through multiple repositories or through multi-package repositories, it provides greater flexibility, reusability, testability and separation of concerns through smaller encapsulated pieces (see the [FIRST principle](https://addyosmani.com/first/) by Addy Osmani).

Regardless of architecture, Bit was created to enable better modularity and composition of smaller pieces to build larger things. It does so by making it easier to share code, manage it and collaborate together to compose it into new applications.
Feel free to [visit our website](https://bitsrc.io) or [learn more on Hackernoon](https://hackernoon.com/how-we-started-sharing-components-as-a-team-d863657afaca).

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
