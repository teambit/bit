
<p align="left">
<h1>Bit</h1>
</p>
<div style="text-align:left">
  <a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/vg7wvfvku12kkxkc?svg=true"></a>
  <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield&circle-token=d9fc5b19b90fb7e0655d941a5d7f21b61174c4e7"></a>
</p>

</div>

Bit is a distributed and virtualized code component repository designed to be language agnostic.  

Bit adds a virtualized level of abstraction on top of your source files, allowing you to create and model code components in a single vritualized repository while still being able to find, maintain and use them individually. Chosen components can be used as a virtual API containing nothing but the code actually used in your application.

Bit components can be reused in different contexts (repositories, micro-services, packages, etc.) without the overhead of configuring and maintaining multiple repos, packages and other tools for every few lines of code.

<p align="center">
  <img src="https://storage.googleapis.com/bit-assets/gifs/leftpad2.gif" height="500">
</p>

## Virtualized code component repository

Code components are the fundamental building blocks of any application.
Different functionalities can and should be reused across different contexts, repositories and projects. In practice, this rarely happens. Building and maintaining an arsenal of tiny repositories and micro-packages for all your different components simply isn't practical. People often end up duplicating code everywhere or using vast libraries with static APIs that contain a lot of redundant code and dependencies they don’t really need. This happens for for a few reasons:

* Initial overhead: to create a new repository and package for every small component you would have to create a VCS repository, create the package boilerplate (build, testing, etc.) and somehow make this process practical for a large set of components.

* Maintenance: modifying a repository and a package takes time and forces you to go through multiple steps such as cloning, linking, debugging, committing, republishing and so on. Centralized registries also makes it hard to address the different levels of abstraction needed for multiple micro-packages. Build and install times quickly increase and dependency hell always feels near.

* Discoverability: it’s hard if not impossible to organize and search multiple repositories and packages to quickly find the components you need. People often used different terms to describe the same functionality, and there is no single source of truth to search and trust.

Bit relies on a different paradigm that solves all of these problems. It adds a virtualized level of abstraction on top of your source files, allowing you to easily create, maintain and find reusable code components. Instead of addressing source files, Bit is designed from the ground up to address code components:

- **Virtual Scope.** Bit uses a distributed and virtual repository called a Scope to keep and maintain all your components in a single place, while still being able to independently find, use and modify each component. You can define the components needed in your application to form a dynamic API made of these components alone, without pulling any redundant code or irrelevant dependencies.

- **Component environment.** Bit lowers the overhead of creating and maintaining multiple reusbale components. An isolated configurable environment uses other Bit components (compiler and tester) for transpiling and testing any component using any superset or a testing framework in any context.

- **Component discovery engine.** Bit comes with an integrated search engine that uses expressive linguistic models to make your components discoverable even when you forget the exact name you gave each component. This also helps for collaborating as a team on shared Scopes.

## Documentation

[Docs](https://teambit.github.io/bit)

[Bit Scope](https://teambit.github.io/bit/bit-scope.html)

[Bit component](https://teambit.github.io/bit/bit-component.html)

[Bit environment](https://teambit.github.io/bit/bit-component.html#component-environment)

[Bit on the server](https://teambit.github.io/bit/bit-on-the-server.html)

[CLI reference](https://teambit.github.io/bit/cli-reference.html)

## Installation

For our different installation methods, please visit our docs [installation section](https://teambit.github.io/bit/installation.html).

## Quick start

Here is a [getting started guide](https://teambit.github.io/bit/getting-started.html).

## Contributing

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## Feedback

Feedbacks are more than welcome: [team@bitsrc.io](mailto:team@bitsrc.io)

## License

Apache License, Version 2.0

![Analytics](https://ga-beacon.appspot.com/UA-96032224-1/bit/readme)
