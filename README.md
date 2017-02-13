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

**Easily reuse code components:** Open source tool for fast and easy extraction and reuse of code components across repositories and microservices without creating code duplications or having to publish tiny packages. 

**Easy to maintain:** Easily maintain all your components in one place. Isolated component environment and simplified versioning make life even easier.

**Simple to find:** A built-in functional search and a simple scoping mechanism make it simple to find components created by you, your team or the community. Thanks to the component isolated environment, components can be built and run anywhere.

**Component managment and CI** Bit handles components' entire lifecycle from storing and version management, through build and test execution all the way to faster dependency management. 

Bit currently supports JavaScript. We plan to add drivers for more languages as soon as we can. We always love some help.

## Why?

When we started to design Bit, we felt the current ecosystem is not well suited for management of code components. As a result, code duplications are increasing as more code components are duplicated across repositories and microservices.

The alternative of publishing every component as a package felt overwhelming. Trying to publish a small component can take hours. Managing a repository + package + CI for every component is an unscalable maintenance odyssey. Discovering these micro packages became even harder, to the point we didn't know each other's tiny packages created within our team.

We needed a way to manage code components quickly and easily without creating duplications. 

We needed easy maintenance and modification of components from inside our project. 

We needed a single tool to handle the components' entire life cycle from creation, to storing and version management, CI (test and build) and a super-fast and reliable dependency resolution. 

We needed a built-in semantic search to make components easy to find. 

We needed much more than the ecosystem had to offer.

This is why we built Bit - the distributed code component manager.

Bit is all of those things. It takes care of your component's entire lifecycle, all the way from creation to storing and version management, through build and test execution all the way to faster dependency management and resolution. It has a built-in semantic search system so that components are easy to find. It allows us to create and modify components in seconds.

Bit helps create a thinner code base which is also much easier to grow and maintain. It shrinks our code size, boosts our build time and helps rid of code duplications across repositories. It also saves the need to create and maintain a repo + package management + CI for each component.

Ultimately, bit allows you to create a dynamic collection of fully managed components ready to be used anywhere. 

This is what we needed.

## Features

* **Fast & Easy component export.** Easily export a component to be reused in any repository by you or your friends.

* **Component management & CI.** Bit handles a component's full life cycle from creation within the project to storing and CI cycles (build and test) and all the way to simple find and reuse.

* **Components can build and run anywhere.** Bit manages the CI environment for each component to make sure it can build and run anywhere.

* **Versioning management.** Bit takes care of version management with a simplified incremental versioning for easier update and maintenance.

* **Built-in semantic search engine.** Easily find code components in local and remote locations.

* **On-export dependency resolution.** A faster, more reliable dependency resolution as dependencies are kept within the component itself.

* **Quick consumption and modification of components.** Using simple commands such as import, modify etc.

* **Distributed.** Multiple backups, works offline and supports any workflow.

## Getting Started

1. [Install instructions](https://github.com/teambit/bit/wiki/Install)

2. [Quick getting started manual](https://github.com/teambit/bit/wiki/Getting-Started)

Head over to Bit's [wiki pages](https://github.com/teambit/bit/wiki) for more information.

## Contributing to Bit

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).
