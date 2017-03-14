
<p align="left">
<h1>Bit</h1>
</p>
<div style="text-align:left">
  <a href="https://opensource.org/licenses/Apache-2.0"><img alt="Appveyor Status" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
  <a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="Appveyor Status" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>

</p>

</div>
Bit is a distributed and virtual code component repository designed to be language agnostic.  

With Bit, you can virtually create and model components on a [distributed Scope](https://teambit.github.io/bit/bit-scope.html), then discover and use these components to dynamically compose a virtual API with the components you actually use in your application.  

It helps resuing code components in different contexts (repositories, micro-services, serverless functions, etc.) without the overhead of maintaining many small packages with different boilerplates or pulling redundant code.  

<p align="center">
  <img src="https://storage.googleapis.com/bit-assets/gifs/leftpad2.gif" height="500">
</p>

## Features

- **Scope.** A Scope is a distributed dynamic codebase responsible for end-to-end management of code components. Scopes are where components are stored, tested, built and integrate with each other.

- **Dynamic and virtual API.** Define the components you need in your application to form a dynamic API made of these components alone, without pulling any redundant code or irrelevant dependencies. 

- **Component environment.** Transpiling and testing are done by simply using other Bit components (compiler and tester), which you can reuse while creating any component with any superset or a testing framework in any context.

- **Fast and predictable depednency resolution.** Dependency resolution is performed on component export, so Bit doesn't have to perform any runtime resolution. This makes the use of components predictable, fast and always available.

- **Discoverability.** Bit has an integrated search engine that uses expressive linguistic models to make your components discoverable even when you forget the exact name you gave each component.

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
