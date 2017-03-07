
<p align="center">
<b>Distributed code component manager</b>
</p>
<div style="text-align:center">

<p align="center">
  <a href="https://ci.appveyor.com/project/TeamBit/bit"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/pr2caxu6awb387lr?svg=true"></a>
  <a href="https://opensource.org/licenses/Apache-2.0"><img alt="Appveyor Status" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="Appveyor Status" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>

</p>

</div>
Bit is a code component manager written in JavaScript yet designed to be language agnostic.

It helps you make code components such as functions, classes and more reusable without the overhead of packages and with zero initial configuration. Creating a Bit component and using it across repositories prevents the need to duplicate or re-invent it over and over again. Bit makes it easy to create a set of managed and tested components ready to be used anywhere.

Bit uses a distributed scoping system to organize your components and take care of their entire lifecycle including versioning, dependency management, building and testing components in an isolated environment and more. You can create a scope anywhere or connect scopes together to create a distributed network. 

<p align="center">
<img src="https://storage.googleapis.com/bit-assets/gifs/leftpad2.gif" height="500">
</p>

## Features

* **Use components across repositories.** Use your code components (functions/classes etc.) in multiple repositories without creating duplications or having to publish packages.

* **Zero initial configuration.** Creating a new Bit component requires next to no configuration at all, and can be done directly from within the project you're working on. Transpiling and testing is done with simple commands.

* **Scoping system.** Bit uses Scopes to organize, store and manage components. Exporting components to a remote scope makes them reusable across repositories for everyone working with this scope.

* **Distributed network.** Scopes can be created anywhere with a simple command (bit init --bare), and can be connected to create a distributed network.

* **Component CI.** Scopes can build and test your components in an isolated environment, so that they can build and run anywhere.

* **Fast dependency resolution.** Dependency resolution is performed on-export, so Bit doesn't have to perform any runtime resolution. Both performance and reliability are increased.

* **Quick modification.** Updating and modifying components is done with a single `bit modify` command. Components can be "brought in" for repairs, and shifted right back out.

* **Simple versioning management.** Bit uses simplified incremental versioning for components, preferring reliability and simplicity.

* **Semantic search engine.** A `bit search` CLI command kicks Bit's semantic search engine into action, searching for components created and stored in the Scopes you search.

## Installation

```bash
npm install bit-bin -g
```

For more installation methods, please check our wiki's [installation section](https://teambit.github.io/bit/installation.html).

## Quick start

Here is a [getting started guide](https://teambit.github.io/bit/basics.html).

## Documentation

[Docs](https://teambit.github.io/bit)

[Installation](https://teambit.github.io/bit/installation.html)

[Getting started](https://teambit.github.io/bit/getting-started.html)

[Bit Scope](https://teambit.github.io/bit/bit-scope.html)

[Bit component](https://teambit.github.io/bit/bit-component.html)

[Bit on the server](https://teambit.github.io/bit/bit-on-the-server.html)

[CLI refrence](https://teambit.github.io/bit/cli-reference.html)

<p align="center">
    <a href="https://github.com/teambit/bit/wiki">
        <img alt="Bit" src="https://storage.googleapis.com/bit-docs/bit-commands.png">
    </a>
</p>

## Why Bit?

Before Bit, we often found ourselves re-writing or duplicating code across repositories over and over again. This wasted time and effort while making our code base harder to maintain.

The only alternative was to spend time on boilerplating and build configuration. We also ended up having to maintain a git repo, package and CI for every small component. This required too much overhead to be practical.

We needed a tool that can save us the overhead of making code components reusable. We also needed to take care of our components through their entire lifecycle. We also wanted to collaborate by using and maintaining each other's components.

To achieve this we designed Bit - the first code component manager. Bit is a distributed manager written in JavaScript yet designed to be language agnostic. It allows you to make components reusable with zero initial configuration and use these components across repositories. It also helps to store, organize and manage your components. It allows you to group your components by context, while also handling versioning, dependency management, build and test execution and more. Bit also makes components easy to find and collaborate on.

At the end of the day, distributed component management is deeply connected to the very basics of writing software as we want it to be. Managing code components can help us all to build great things out of smaller building blocks - together. Imagine the possibilities.

## Feedback

Feedbacks are more than welcome: [team@bitsrc.io](mailto:team@bitsrc.io)

## Contributing

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## License

Apache License, Version 2.0
