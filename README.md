<p align="center">
    <a href="https://bitsrc.io/">
        <img alt="Bit" src="https://s29.postimg.org/q9flqqoif/cover_github_1.png" width="350">
    </a>
</p>

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
Bit is a code component manager written in javascript yet designed to be language agnostic.

It helps you make code components such as functions, classes and more reusable with zero initial configuration. Bit uses a distributed scoping system to organize your components and take care of versioning, dependency management and even building and testing them in an isolated environment.
 
You can create a scope anywhere or connect scopes together to create a distributed network. Creating a Bit component and using it across repositories prevents the need to duplicate or re-invent it over and over again.

<p align="center">
<img src="https://storage.googleapis.com/bit-assets/gifs/leftpad2.gif" height="500">
</p>

## Features

* **Use components across repositories.** Use your functions/classes in multiple repos.

* **Zero initial configuration.** Transpiling and testing with simple  commands.

* **Scoping system.** Orgenize your components in multiple scopes.

* **Distributed.** Create a scope anywhere you want with `bit init --bare`

* **Component CI.** Build and test execution in an isolated invironment.

* **Fast dependency resolution.** Performed on export.

* **Quick modification.** Update components with a single `bit modify` command.

* **Simple versioning management.** Simplified incremental versioning for easier update and maintenance.

* **Semantic search engine.** Find and use components created by you or your team.

## Installation

```bash
npm install bit-bin -g
```

For more installation methods, please check our wiki's [installation section](https://teambit.github.io/bit/installation.html).

## Quick start

Here is a [getting started guide](https://teambit.github.io/bit/basics.html).

## Documentation

Head over to the [Docs](https://teambit.github.io/bit) for more information.

<p align="center">
    <a href="https://github.com/teambit/bit/wiki">
        <img alt="Bit" src="https://storage.googleapis.com/bit-docs-marketing/bit-commands.png">
    </a>
</p>

## Why Bit?

Before Bit, we often found ourselves re-writing or duplicating code across repositories over and over again. This wasted time and effort while making our code base harder to maintain.

The only alternative was to spend time on boilerplating and build configuration. We also ended up having to maintain a git repo, package and CI for every small component. This required too much overhead to be practical.

We needed a tool that can save us the overhead of making code components reusable. We also needed to take care of our components through their entire lifecycle. We also wanted to collaborate by using and maintaining each other's components.

This compelled us to build Bit.
It helped us get rid of hundreds of duplications, saved time an effort and made our code base much easier to maintain.
It also proved valuable to performence and helped us get rid of tools we no longer needed.
Bit made it practical to collaborate as a team working with the same components.
In the long run, we hope Bit will help create dynamic sets of building blocks that will allow everyone to create anything.

## Feedback

Feedbacks are more than welcome: [team@bitsrc.io](mailto:team@bitsrc.io)

## Contributing

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## License

Apache License, Version 2.0
