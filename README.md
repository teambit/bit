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

We beleive that the more code gets reused across software projects - the better.

Currently the best way to reuse code is to package it, and distribute via package managers. 
In theory it should work, but in practice it's not so simple. Packaging small pieces of code is an over
kill for most uses cases (would you go to all the trouble to package 'isString'?). The packaging
overhead causes many developers to prefer copy-pasting code snippets instead (the infamus left-pad
discussion). 

This is why we built Bit. To make distributing the small pieces of functionality a simple and easy
task. We want tTo make it a part of the workflow and routine of how we code.

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
