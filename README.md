
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

Bit adds a virtualized level of abstraction on top of your source files that allows you to keep and maintain your components in one repository, while still being able to independently use, modify and find each component.  
Creating and modeling components on a [Bit Scope](https://teambit.github.io/bit/bit-scope.html) means these components can be found and used as a virtual API containing nothing but the code actually used in your application.

Bit components can be reused in different contexts (repositories, micro-services, packages, etc.) without the overhead of configuring and maintaining multiple repos, packages and other tools for every few lines of code.

<p align="center">
  <img src="https://storage.googleapis.com/bit-assets/gifs/leftpad2.gif" height="500">
</p>

## Why use Bit

Code components are the fundamental building blocks of any application.
Different functionalities can and should be reused across different contexts, repositories and projects. In practice, this rarely happens. People often end up duplicating code everywhere or using vast libraries with static APIs that contain a lot of redundant code and dependencies they don’t really need. Building an arsenal of tiny repositories and micro-packages for all your code components simply isn't practical, for a few reasons:

* Initial overhead: to create a new repository and package for every small component you would have to create a VCS repository, create the package boilerplate (build, testing, etc.) and somehow make this process practical for a large set of components.

* Maintenance: modifying a repository and a package takes time and forces you to go through multiple steps such as cloning, linking, debugging, committing, republishing and so on. Centralized registries also makes it hard to address the different levels of abstraction needed for multiple micro-packages. Build and install times quickly increase and dependency hell always feels near.

* Discoverability: it’s hard if not impossible to organize and search multiple repositories and packages to quickly find the components you need. People often used different terms to describe the same functionality, and there is no single source of truth to search and trust.

Bit relies on a different paradigm that never creates these problems in the first place.

Bit adds a virtualized level of abstraction on top of your source files that allows you to keep and maintain your components in one repository, while still being able to independently use, modify and find each component.  
By addressing code components instead of static source files, Bit solves all of these problems.   

- **Scope.** A Scope is a distributed and virtualized repository. Scopes are where components are stored, tested, built and integrate with each other.

- **Virtual API.** Define the components you need in your application to form a dynamic API made of these components alone, without pulling any redundant code or irrelevant dependencies.

- **Component environment.** Transpiling and testing are done by simply using other Bit components (compiler and tester), which you can reuse while creating any component with any superset or a testing framework in any context.

- **Component discovery.** Bit has an integrated search engine that uses expressive linguistic models to make your components discoverable even when you forget the exact name you gave each component.

## Installation

For our different installation methods, please visit our docs [installation section](https://teambit.github.io/bit/installation.html).

## Quick start

Here is a [getting started guide](https://teambit.github.io/bit/getting-started.html).

## Documentation

[Docs](https://teambit.github.io/bit)

[Bit Scope](https://teambit.github.io/bit/bit-scope.html)

[Bit component](https://teambit.github.io/bit/bit-component.html)

[Bit on the server](https://teambit.github.io/bit/bit-on-the-server.html)

[CLI refrence](https://teambit.github.io/bit/cli-reference.html)

## Feedback

Feedbacks are more than welcome: [team@bitsrc.io](mailto:team@bitsrc.io)

## Contributing

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## License

Apache License, Version 2.0
