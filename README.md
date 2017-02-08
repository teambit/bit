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

Bit's design philosophy is one: code components should be composable building blocks.

Code components should be easily reused across projects without creating code duplications. They should be easy to create, simple to maintain and quick to find.

Up until now, the only way to reuse small and focused components (e.g. ‘isString’, ‘left-pad’ etc..) was packaging them and distributing them via package managers. Packages are hard to create, complex to maintain and impossible to find. However, components are not packages.

This is why we built Bit - the distributed code component manager.

Bit is an open source tool for fast and easy extraction and reuse of code components. 
It enables you to reuse components anywhere you like without creating code duplications or having to publish hundreds of tiny packages. It also makes maintenance much simpler for both your individual components and your entire code base. Using bit means components are also easy to find, so you and your friends don't have to write the same component twice ever again.
 
Bit was built with many features to support this philosophy such as being fully distributed, providing local workflow, creating an isolated component environment and performing an on-export offline dependency resolution. 

Bit helps create a thinner code base which is also much easier to test and maintain. It also means you only use the code you actually need, so your entire application can become lighter and faster.  Ultimately, bit allows you to create a dynamic collection of fully managed components ready to be used anywhere- writing components once and composing them together to build anything.

## Features

* **Fast & Easy component export.** Easily export a component to be reused anywhere by you or your team - all in less than a minute.
* **Code environment boilerplate.** Components are isolated, and contain their own full working environment, ready to be shipped and used anywhere.
* **Components can build and run anywhere.** Thanks to the Bit component environment. 
* **Simplified minor versioning.** Components versions are incremental for easier update and maintenance.
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
