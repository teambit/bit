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

Multiple repositories provide better modularity, separation of concerns, clear ownerships, shorter learning curves and mitigation of development pain.
However, over time it becomes hard to track and manage changes to common code across these repositories.

**Bit extends Git and integrates into package managers to make it simple to share more modules and merge changes across repositories.**

It also provides better discoverability to track and control shared code across your entire codebase.
Bit is a collaborative open source project, actively maintained by a venture-backed team and used by different organizations and OSS communities.

### How it works

##### Easily share more modules:
Bit helps you isolate and share source code components (subsets of files) from any Javascript repository and use them as managed modules in other repositories without having to change the original repository's source code or maintain any additional repositories. This shared code can be managed by Bit or installed using NPM or Yarn, as you choose.

##### Merging cross-repo changes:
Bit extends Git to track and merge changes across multiple repositories without being handicapped by ownership or the overhead of changing packages. Instead, you can sync changes to shared code done in one repository to all other repositories its shared in. 

##### Discoverability across your codebase
Bit provides simple discoverability to learn exactly what shared components are available and which component is being used in which repository. It also helps you gain absolute control over tour dependency graph across the entire codebase. For a mono-repo architecture, Bit helps discover and organize the building blocks which that repo is built from.

##### Extend Bit 
To benefit from working with shared source code at the resolution of smaller components, by visually discovering them , testing them, compiling them and parsing useful information directly from their source code without writing documentation. You can also extend Bit to publish components straight to the NPM registry.

### Use Cases

#### Multiple Javascript repositories
Bit negates most of the pains of working multi-repo by making it easy to share code directly from any repository source code without changing it, track and keep it synced across different repositories by leveraging extensions to Git’s comparison and merge utilities. 

#### Single Javascript repository (monorepo)
Bit helps to decouple the representation of different components from the project’s file system to provide greater discoverability in the repository, shorten learning curves, increase flexibility of dependency upgrade and make the repository less intimidating 
### Examples

##### UI / Web components
Share and sync React, Vue and Angular components.

* Tutorial: [Bit with React](https://docs.bitsrc.io/react-tutorial.html).
* An [example React app](https://hub.com/itaymendel/movie-app) with 9 React components shared and made [individually available](https://bitsrc.io/bit/movie-app) with Bit.

##### Node.js modules
Share and sync Node.js modules between micro-services in a multi-repo architecture.
* Tutorial: [Bit with Node.js](https://docs.bitsrc.io/node-tutorial.html).

##### Shared Libraries
Use Bit to turn any shared-lib into a dynamic collection of individual components.

* Tutorial: [Bit with Shared Libraries](https://docs.bitsrc.io/shared-lib-main.html).

Additional use cases: **GraphQL APIs**, **Serverless functions**, **Utility functions** and any encapsulated, reusable functionality.

## Supported Languages
Bit's design is language agnostic. Still, it requires language-specific drivers for language-sensitive features (binding etc):
* [bit-javascript](https://github.com/teambit/bit-javascript).

## Quick Start (workflow)
Let's add Bit to a repository to isolate and share components, import them into other repositories and update them between them.

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

Much like Git repositories, Scopes are lightweight and can also be [set up on any server](https://teambit.github.io/docs/advanced.html#host-your-own-scope).

Let's create a free Scope on the [Bit community hub](https://bitsrc.io/signup).

### Share source code components directly from your repository
To break the overhead of sharing more modules, Bit enables you to track subsets of files in your repository as reusable components and isolate them with everything they need to execute.

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
To command Bit to start tracking these UI components, use the `bit add` command.
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
### Install / import the shared components

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

Many words has been written on working multi-repo vs. working mono-repo.
Multiple repositories provides many advantages such as better modularity, clear ownerships, better scale, mitigation of development times and pain, shorter learning curves and more.

However, over time it becomes harder and harder to manage hundreds or thousands of repositories and to effectively share source code between them. Duplicate code and rewrites begin to grow, maintenance becomes harder and a technological debt accumulates. 

Package managers were built for large projects. The overhead of publishing and changing packages, along with ownership problems, makes it hard to share enough code and manage changes across different repositories. Shared libraries fail to provide a solution, as they are cumbersome and static, making them hard to adapt in the test of time.

So, Bit was created to solve the pains of sharing and managing shared code across multiple repositories, by extending and completing the existing Git - Package management ecosystem. 

Feel free to get started.
Learn more on Hackernoon: "[How we started sharing components as a team](https://hackernoon.com/how-we-started-sharing-components-as-a-team-d863657afaca)".*

## Contributing

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).
See [Contributing](CONTRIBUTING.md).

## Feedback

Feedbacks and questions are more than welcome via Bit's [Gitter channel](https://gitter.im/bit-src/Bit).

## License

Apache License, Version 2.0
![Analytics](https://ga-beacon.appspot.com/UA-96032224-1/bit/readme)

