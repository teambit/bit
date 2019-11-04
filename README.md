
<p align="center">
  <a href="https://bit.dev"><img src="https://storage.googleapis.com/bit-docs/component-discovery-bit-react-gif.gif"></a>
</p>

  <a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
  [![Gitter chat](https://badgen.now.sh/badge/chat/on%20gitter/cyan)](https://gitter.im/bit-src/Bit)
  [![Discourse status](https://img.shields.io/discourse/https/meta.discourse.org/status.svg)](https://discourse.bit.dev/)
  <a href="https://ci.appveyor.com/project/TeamBit/bit-wikt3/branch/master"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/vg7wvfvku12kkxkc?svg=true"></a>
  <a href="https://circleci.com/gh/teambit/bit/tree/master"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield&circle-token=d9fc5b19b90fb7e0655d941a5d7f21b61174c4e7">
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=Share%20code%20components%20as%20a%20team%20@bitdev_&url=https://bit.dev&hashtags=opensource,javascript,programming,reactjs,webdev,vuejs,angularjs)

[Component platform](https://bit.dev/) • [Discover components](https://bit.dev/components) • [Video demo](https://www.youtube.com/watch?v=E5lgoz6-nfs) • [Docs](https://docs.bit.dev) • [Blog](https://blog.bitsrc.io/) • [Gitter](https://gitter.im/bit-src/Bit) • [Discourse](https://discourse.bit.dev/) • [Twitter](https://twitter.com/bitdev_)

## About  

**Bit makes it easy to share and manage components between projects and apps at any scale**.

It lets you **isolate components** from existing projects with **0 refactoring**, with **fully-automated dependancy definition/resolution** and **scalable versioning**.

It lets you **reuse individual components across projects**, using your favorite package managers like **npm** and **yarn** through **[Bit's component hub](https://bit.dev)**.

It lets you **extend Git's workflow** to **develop components from any consuming project** , suggest updates and **easily sync changes across your codebase**.

## Why?

Modular software makes for better software. It's faster to build, easier to test, simpler to maintain and more fun to collaborate on. Bit turns modularity into a practical commodity, bringing component source-code management and dependency management together. It helps teams build better software faster together.

*Bit is a collaborative open source project, actively developed and maintained by a venture-backed team and used by more teams and communities every day*.  

## Contents  

- [Examples](#examples)
- [Getting started](https://bit.dev)
- [Docs](https://docs.bit.dev)
- [Workflow](#workflow)
- [Bit in the wild](#bit-in-the-wild)
  - [Bit monorepo](#bit-monorepo)
  - [Bit across apps](#bit-across-apps)
  - [Component design system](#component-design-system)
- [Motivation](#motivation)
- [Contributing](#contributing)  

## Examples  

Bit is used to quickly share and reuse code from any project. Every component can be installed, developed and used in any other project. Popular use cases are [UI components](https://bit.dev/components?labels=ui%20components) and [React components](https://bit.dev/components?labels=react), [JavaScript functions](https://bit.dev/components?labels=utils) and more.  

Learn: **[Build a Super-Modular Todo App with React and Bit Components](https://blog.bitsrc.io/build-a-super-modular-todo-app-with-react-and-bit-components-aa06bbac4084)**.

### UI components

Share components from UI libraries and projects, and use them to build new apps. [Discover components](https://bit.dev/components?labels=react) from the community, to add to your apps. Example:

**React spinners**:  

<p align="center">
  <a href="https://bit.dev/bondz/react-epic-spinners"><img src="https://storage.googleapis.com/bit-docs/react-spinners-bit-ui-gif.gif"></a>
</p>  

[GitHub Repository](https://github.com/bondz/react-epic-spinners) → [Components with Bit](https://bit.dev/bondz/react-epic-spinners).  

Once you choose a component, you can play with it in a live playground, save examples, and use npm/yarn to install it in your project.  

<p align="center">
  <a href="https://bit.dev/davidhu2000/react-spinners/pacman-loader"><img src="https://storage.googleapis.com/bit-docs/react-pacman-loader-ui-gif.gif"></a>
</p>  


### Plain JavaScript and NodeJS

Share components from JavaScript libraries and projects, and use them to build new apps.   

**Ramda functions**:  

<p align="center">
  <a href="https://bit.dev/ramda/ramda"><img src="https://storage.googleapis.com/bit-docs/ramda-functions-bit-gif2.gif"></a>
</p>  

[GitHub repository](https://github.com/ramda/ramda) → [Functions with Bit](https://bit.dev/ramda/ramda).

## Workflow

Bit turns components into isolated and reusable building blocks you can run and develop from any other project in any context. It works in any given repository structure, without changing it at all, so the repository’s structure will remain the same.  

### Component isolation and sharing

When running the `bit add` command Bit will isolate components in the existing project structure. Meaning, Bit will [track the components](https://docs.bit.dev/docs/add-and-isolate-components.html) and create a dependency graph for each of them. With this data, Bit creates an isolated environment for each component, which lets the component run and work in any other project. For example, components written in typescript can be used and developed in a project written in flow-typed.

To [tag a version]((https://docs.bit.dev/docs/tag-component-version.html)) for the components, use the `bit tag` command. At any point, you can use the `bit status` command to learn more.  

Then, `bit export` them to a [remote collection](https://docs.bit.dev/docs/organizing-components.html) from which they can be installed in other projects. You can set up a collection on any server, or use [Bit’s component hub](https://bit.dev). Here’s a quick demo.

**Exporting 256 Ramda components (functions) from the repository to Bit’s hub in 2 minutes**:  

<p align="center">
  <a href="https://www.youtube.com/watch?v=pz0y2GTsSrU"><img width="460" height="300" src="https://storage.googleapis.com/bit-docs/image-ramda-256-components.png"></a>
</p>  

### Component usage  

Once components are shared to Bit’s hub (which isn’t mandatory; Bit is distributed and you can [set up a collection](https://docs.bit.dev/docs/bit-on-the-server.html) on any server), you can use them in other projects in a number of methods:  

<p align="center">
  <a href="https://bit.dev/davidhu2000/react-spinners/pacman-loader"><img src="https://storage.googleapis.com/bit-docs/Install-compnent-npm-yarn-bit.png"></a>
</p>

* [Install components with NPM and Yarn](https://docs.bit.dev/docs/installing-components.html)
* [Import components with Bit](https://docs.bit.dev/docs/sourcing-components.html)  

#### Installing components with npm/yarn

You can install components shared to [Bit’s hub](https://bit.dev/components) from Bit’s [package registry](https://blog.bitsrc.io/introducing-bits-npm-package-registry-f4892de57b0c) via the NPM or Yarn clients. This means Bit can turn any repository and library into a multi-package monorepo almost instantly, without refactoring, and with advanced discoverability.

#### Importing components with Bit

You can import components shared to [Bit’s hub](https://bit.dev/components) using the `bit import` command. This will [source the component](https://docs.bit.dev/docs/sourcing-components.html) in your local project, so you can [continue to develop it](https://docs.bit.dev/docs/modifying-sourced-components.html) right from the consuming project. Since Bit will keep tracking the component, you can [update](https://docs.bit.dev/docs/update-dependencies.html) and [sync](https://docs.bit.dev/docs/merge-changes.html) changes from your project to Bit’s hub (and if you wish, eject the component to become a package dependency) and to other projects.  

### Distributed component development

Relying on Bit’s ability to [import component](#importing-components-with-bit) into any project, you can develop the same component from different projects at the same time.  

This creates a distributed workflow in which your team can collaborate and suggest new updates for each other’s components, so that they can be extended over time. It also lets you control permissions for who can update which component, rather than being limited by access to the library from which the components were shared from.  

### Extending Bit 

Bit can be extended to play with the tools you work with, including [build and test environments](https://bit.dev/bit/envs) to test and compile your components. 

Pre-made environments, which are also Bit components that can be imported into your project before tagging the components, save the overhead of configurations for each component. You can use the [example environments](https://bit.dev/bit/envs) in Bit’s hub, or create your own. You can learn more about it [in the docs](https://docs.bit.dev/docs/building-components.html).

Update: An extensive extension system is in the works and should become available within weeks. This will make the process of creating extensions effortless, and open new possibilities to integrate any tool or workflow into Bit’s code-sharing workflow.

## Bit in the wild

### Bit monorepo

Any repository or library containing components is already a Bit monorepo.  

Adding Bit to the repository will not change its structure, source code or configurations. You won’t need to refactor or create separate directories and configurations for every component.  
Instead, you can use Bit to track and share the components from your library directly to Bit’s hub. Then, they become available to install as individual NPM packages.   

This means that your React UI library + Bit will become a monorepo from which components can be individually discovered and installed, without changing the library. Component dependencies will be automatically defined by Bit, and build/test configurations will be [applied to all the components](https://docs.bit.dev/docs/building-components.html) using [Bit’s environments](https://bit.dev/bit/envs). In addition, you will get discoverability for the components across your team, community or organization.

#### Example:

[Semantic UI library before Bit](https://github.com/Semantic-Org/Semantic-UI-React)

[Semantic UI React library with Bit](https://github.com/teambit/Semantic-UI-React/tree/addBit)

[Semantic UI components in Bit’s hub](https://bit.dev/semantic-org/semantic-ui-react)

[Learn more: Bit with and without Lerna](https://blog.bitsrc.io/monorepo-architecture-simplified-with-bit-and-npm-b1354be62870).  

### Bit across apps

Many teams keep separate repositories for different parts of their codebase.  

When the same code is needed in different places, effective code-sharing becomes the key to development velocity and the maintenance of your codebase over time.  

Bit makes this process more effective by:  

- Eliminating the overhead around “publishing” code directly from any repository.
- Organizing and making these code units discoverable and manageable.
- Creating a collaborative code-sharing workflow where everyone, given permissions, can make changes, suggest updates and stay in sync.  

As a result, you can share more code in less time and manage it at scale without having to “force” adoption or get lost in the overhead around the process.

### Component design system

Bit is a quick and effective way to create a design system from your components.  

<p align="center">
  <a href="https://bit.dev/components?labels=ui%20components"><img src="https://storage.googleapis.com/bit-docs/Component-design-system-bit.png"></a>
</p>

You can organize components for your team to share, view and try them hands-on in Bit’s hub component playground, and use components directly your projects.  

Developers, designers and other team members can share, view and work with components to build faster together. [Learn more](https://blog.bitsrc.io/building-a-consistent-ui-design-system-4481fb37470f).

## Motivation  

[Modularity](https://en.wikipedia.org/wiki/Modular_programming) has always been a key principle in software development.  

In today’s ecosystem, the tools and technologies we use across our stack are built for modularity, from React/Vue/Angular/Web components in the front to GraphQL and NodeJS in the back, and even serverless functions. 

Looking into the future, smaller components are the [composable building blocks](https://addyosmani.com/first) of our software applications. Instead of having to reinvent the wheel every time or having to work hard and long to share and reuse them, we should make it easy -and even fun- to discover, share and build with components. To that purpose, Bit was created.  

And, it’s only the beginning.

## Supported Languages

Bit's design is language agnostic. Still, as of today, it requires language-specific drivers for language-sensitive features (binding etc). We released Bit’s driver for JavaScript, and will be releasing more drivers in the future. You are also welcome to add your own.

- [bit-javascript](https://github.com/teambit/bit-javascript).

## Contributing

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## Feedback

Feedbacks and questions are more than welcome via Bit's [Gitter channel](https://gitter.im/bit-src/Bit) or [Discourse boards](https://discourse.bit.dev/).

## License

Apache License, Version 2.0

![Analytics](https://ga-beacon.appspot.com/UA-96032224-1/bit/readme)
