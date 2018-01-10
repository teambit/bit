
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

## About 

**Bit makes it easier to share code and manage changes in both multi-repo and mono-repo architectures**. 

Multiple repositories provide great modularity, separation of concerns, clear ownerships, shorter learning curves and mitigation of development pain.

Some projects choose to manage multiple packages in a single repository to avoid the overhead of multiple repositories and for better development testing.

In both cases, sharing common code between repositories or packages and managing changes can get painful.

Bit works with Git and NPM to help share more code and easily manage changes across repositories and packages, with greater discoverability and less overhead. It’s a collaborative open source project, actively maintained by a venture-backed team and used by different organizations and OSS communities.

- [Use Cases](#use-cases)
- [How It Works](#how-it-works)
- [Tutorials And Examples](#tutorials-and-examples)
- [Getting Started](#getting-started)
- [Motivation](#motivation)
- [Contributing](#contributing)
- [Docs](https://docs.bitsrc.io)

## Use Cases

### Multiple Javascript repositories (multi-repo)

Sharing code and managing changes across multiple repositories can become very hard very quickly.
Bit solves this issue by helping you share more code, and easily manage changes across multiple repositories. 

Bit lets you share components and modules directly from any repository’s source code without changing it or having to maintain additional repositories and libraries.

Shared components and modules can also be installed with the Yarn / NPM client from the [bisrc registry](https://bitsrc.io) - and updated by changing your original source code and re-sharing it.

Shared code can also be managed and changed across multiple repositories with updates leveraging Git’s compare and merge utilities, by using Bit to import shared components and syncing them in different project (still under development).


### A multi-package repository (mono-repo)

When managing multiple packages in a single repository (with tools like [Lerna](https://github.com/lerna/lerna)), many of these packages still share smaller components and modules. While these smaller components shouldn’t be packages of their own, we often can’t or don’t want to put them in one package and use them in others (separation of concerns).

Bit helps you share these components between different teams working with different mono-repos and between different packages within the same repository, without having to copy-paste code. It also provides better discoverability and control over all these smaller ingredients.

## How It Works

### Fatser, simplified code sharing

Bit helps you isolate and share source code components (subsets of files) from any Javascript repository and use them as managed modules in other repositories without having to change the original repository's source code or maintain any additional repositories.  This workflow provides the speed and efficiency of copy-pasting, while still keeping it managed.

### Managing changes across repos / packages

Bit helps to track and manage changes to shared code in any number of repositories. You can use NPM / Yarn to install shared modules and components in different repositories, keep track, and easily update changes in all of them together without working hard or being handicapped by ownership. You can also use Bit to import and source shared components in multiple repositories, develop them, and merge changes by extending Git’s compare and merge utilities (still in development).

### Discoverability and control

Bit helps you create a single source of truth for the building blocks shared throughout your projects and packages. You can easily discover your team’s technological assets, choose the ones you need and eliminate duplications. With Bit, you can also easily learn which components are used by who and where, to safely make multiple changes in multiple projects / packages.

### Extending Bit 

Bit can be extended to optimize the workflow around reusable components and modules. You can render UI components, test and build components and modules in an isolated environment, parse docs and examples from the source code itself and even publish components to NPM.

## Tutorials And Examples

#### UI / Web components

Share and sync UI components (React, Angular, Vue etc) between projects.

* Tutorial: [Bit with React](https://docs.bitsrc.io/react-tutorial.html).
* An [example React app](https://hub.com/itaymendel/movie-app) with 9 React components shared and made [individually available](https://bitsrc.io/bit/movie-app) with Bit.

#### Node.js modules

Share and sync Node.js modules between micro-services in a multi-repo architecture.
* Tutorial: [Bit with Node.js](https://docs.bitsrc.io/node-tutorial.html).

#### Eliminating shared Libraries

Use Bit to turn any shared-lib into a dynamic collection of individual components.
* Tutorial: [Bit with Shared Libraries](https://docs.bitsrc.io/shared-lib-main.html).

Additional use cases: **GraphQL APIs**, **Serverless functions**, **Utility functions** and any encapsulated, reusable functionality.

## Getting Started

Let's use Bit to isolate and share components from a repository, import them into other repositories and update changes between them.

Note that the same flow described below also works for multiple packages indside a single repository.

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
To organize your shared components and modules Bit uses scopes.
A scope is a collection of shared components with a common theme or ownership. 

It’s key role is to serve as a source of truth for syncing shared code across different repositories. It also helps to organize and make all your shared components discoverable.

Much like Git repositories, scopes are lightweight and can be [set up on any server](https://teambit.github.io/docs/advanced.html#host-your-own-scope).

Let's create a free Scope on the [Bit community hub](https://bitsrc.io/signup) - so we could view it through a more discoverable UI, run component tests in isolation and later install them using Yarn / NPM.

### Share source code components directly from your repository

To break the overhead of sharing more code, Bit enables you to track subsets of files in your repository as reusable components and isolate them with everything they need in order to execute.

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
To tell Bit to start tracking these UI components, use the `bit add` command.
This command also accepts a glob pattern, so you can track multiple components at once.

In this case, we have 3 components in the "components" directory. Let's track all of them.

We'll also use the `bit tag` command to lock component **versions** and **dependencies** in place (note that Bit uses **automatic dependency definition** to make sharing faster). 
```sh
bit add components/*
bit tag --all
```
Now, let's share these components to the Scope we created.
```
bit export {{owner}}.{{scope}}
```
That's it.

Once done, you can discovered the components you just shared on your Scope (example). 
For additional usage examples [click here]({{docs}}/usage.html#adding-component).

#### You can also create an empty component

```sh
touch empty-component.js
bit add empty-component.js
bit tag --all
bit export {{owner}}.{{scope}}
```
### Import the shared components

Once shared, you can install these components using the Yarn or NPM client from the bitsrc registry, or- **import** them into other repositories using Bit.

Importing means you can install a component as an application-part in any destination on your project’s file system. It will still be tracked by Bit, so you can continue to develop it from both repositories and sync updates between them.

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

**Note that once shared to [bitsrc](https://bitsrc.io), components and modules can also be installed with your native NPM/Yarn client**.

### Updating Components

A component can be updated from any project using Bit.
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

Modularity has always been the holy grail of software development.

Wether it's being strived for through multiple repositoires or through multi-package repositoires, it provides greater flexabilty, reusbality, testabilty and seperation of concerns (see the [FIRST principle](https://addyosmani.com/first/) by Addy Osmani).

Regardless of architecture, Bit was created to enable better modulairty and compisition of smaller pieces to build larger things. It does so by making it easier to share code, manage it and collaborate together to compose it into new applications.

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

