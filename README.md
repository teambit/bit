<p align="center">
    <img alt="Bit" src="https://s29.postimg.org/q9flqqoif/cover_github_1.png" width="500">
</p>

<p align="center">
<b>Distributed code component manager</b>
</p>
<p align="center">
  <a href="https://ci.appveyor.com/project/TeamBit/bit"><img alt="Appveyor Status" src="https://ci.appveyor.com/api/projects/status/pr2caxu6awb387lr?svg=true"></a>
</p>
---

Bit is a distributed, fast and language-agnostic code component manager designed for easy use, maintenance and discovery of code components.

**Easily reuse code components:** Open source tool for fast and easy extraction and reuse of code components without creating code duplications or having to publish tiny packages.

**Easy to maintain:** Easily maintain all your components in one place. Isolated component environment and simplified versioning make life even easier.

**Simple to find:** A built-in functional search and a simple scoping mechanism make it simple to find components created by you, your team or the community. Thanks to the component isolated environment, components can be built and run anywhere.

Bit currently supports JavaScript. We plan to add drivers for more languages as soon as we can. We always love some help.

## Why...?

We believe in code reusability.
Many components can and should be shared across projects.
Reusability also means taking care of maintainability and discoverability. 

Up until now, the only way to reuse components was packaging them and distributing them via package managers. This is an overkill for code components. It also completely misses the mark when it comes to maintainability and recoverability. A small, focused component (e.g. ‘isString’, ‘left-pad’..) should not be a package. The problem is, the alternative (copy-pasting) creates endless code duplications across projects and services, and an ever growing technological debt. No good. Reusability, maintenance and discoverability of components across projects, teams and even communities should be done right.

This is why we built Bit - the distributed code component manager.

Bit enables you to easily extract reusable components from your code in seconds.
It allows you to handle all your components in one place, make sure they are ready to run and build. Bit also makes it easy to find and use any component created by you, your team or someone completely different. 

Using Bit means you end up with a thinner code base with little to no duplications, lighter and faster applications and an easily manageable and dynamic collection of tested components - ready to be used anywhere.

## Features

* **Fast & Easy component export.** Easily export a component to be reused anywhere by you or your team - all in less than a minute.
* **Code environment boilerplate.** Components are isolated, and contain their own full working environment, ready to be shipped and used anywhere.
* **Components can build and run anywhere.** Thanks to the Bit component environment. 
* **Simplified minor versioning.** Components versions is incremental for easier update and maintenance.
* **Internal search engine.** Find code components in local and remote locations.
* **On-export dependency resolution.** All dependencies are kept with your component, to keep components immutable while downloading.
* **Distributed.** Multiple backups, works offline and supports any workflow.

## Getting Started

1. [Install instructions](https://github.com/teambit/bit/wiki/Install).

2. [Quick getting started manual](https://github.com/teambit/bit/wiki/Getting-Started)

Head over to Bit's [wiki pages](https://github.com/teambit/bit/wiki) for more information.

## Contributing to Bit

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).
