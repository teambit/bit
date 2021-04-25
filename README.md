# Bit

Bit is a component-based approach to modern application development.  

It unlocks the development and composition of modern applications from independent components, which can be independent developed and integrated into many projects. Bit's rich and extendable toolset, with a visual UI, creates an enjoyable developer experience for every step of modular development.  

The [component cloud platform](https://bit.dev/) is a component marketplace as-a-service, where teams can smoothly scale collaboration on components to many developers and applications. Developers can host, discover, and share components while continuously releasing small updates to everyone in the organization. Everything is free for open-source developers.

Modularity benefits almost every part of the development process, from [accelerating releases](https://www.youtube.com/watch?v=yDjTcBKXKDE) to making debugging or refactoring much simpler. For teams, Bit is often used as a solution for a verity of [use-cases](https://blog.bitsrc.io/4-bit-use-cases-build-like-the-best-teams-1c36560c7c6e) such as Micro Frontends, Design Systems, Delivery Speed, and Collaboration on components.

[![Bit](https://storage.googleapis.com/static.bit.dev/harmony-docs/homepage-components-micro-frontends.png)](https://bit.dev/)

<a href="https://opensource.org/licenses/Apache-2.0"><img alt="apache" src="https://img.shields.io/badge/License-Apache%202.0-blue.svg"></a>
<a href="https://github.com/teambit/bit/blob/master/CONTRIBUTING.md"><img alt="prs" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg"></a>
<a href="https://circleci.com/gh/teambit/bit/tree/master"><img alt="Circle Status" src="https://circleci.com/gh/teambit/bit/tree/master.svg?style=shield&circle-token=d9fc5b19b90fb7e0655d941a5d7f21b61174c4e7">
[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
<a href="https://join.slack.com/t/bit-dev-community/shared_invite/zt-o2tim18y-UzwOCFdTafmFKEqm2tXE4w" ><img alt="Join Slack" src="https://img.shields.io/badge/Slack-Join%20Bit%20Slack-blueviolet"/></a>
[![Tweet](https://img.shields.io/twitter/url/http/shields.io.svg?style=social)](https://twitter.com/intent/tweet?text=Share%20code%20components%20as%20a%20team%20@bitdev_&url=https://bit.dev&hashtags=opensource,javascript,programming,reactjs,webdev,vuejs,angularjs)

[Docs](https://harmony-docs.bit.dev/) • [Bit Cloud](https://bit.dev/) • [Slack](https://join.slack.com/t/bit-dev-community/shared_invite/zt-o2tim18y-UzwOCFdTafmFKEqm2tXE4w) • [Twitter](https://twitter.com/bitdev_) • [YouTube](https://www.youtube.com/channel/UCuNkM3qIO79Q3-VrkcDiXfw) • [Blog](https://blog.bitsrc.io/tagged/bit) • [Resources](https://harmony-docs.bit.dev/resources/conference-talks/)

## Getting Started

### Docs

- [Getting started](https://harmony-docs.bit.dev/getting-started/installing-bit)
- [What is Bit?](https://harmony-docs.bit.dev/essentials/what-is-bit)
- [Thinking in Components](https://harmony-docs.bit.dev/component-architecture/thinking-in-components)

### Resources & Community

- [Conference talks](https://harmony-docs.bit.dev/resources/interviews)
- [Interviews](https://harmony-docs.bit.dev/resources/interviews)
- [Podcasts](https://harmony-docs.bit.dev/resources/podcasts)
- [Live streams](https://harmony-docs.bit.dev/resources/live-streams)
- [Articles](https://harmony-docs.bit.dev/resources/articles)
- [Community](https://harmony-docs.bit.dev/resources/community)

## What is Bit?

Bit allows us to compose apps and codebases from components. We use this approach to build using service-oriented architecture, where components are services. This simplifies our codebase, as it promotes composability and modularity.

Use this approach to build using service-oriented architecture, where **components are services**. This simplifies our codebase, as it promotes composability and modularity.

<div style={{textAlign: 'center'}}>
    <img src="https://storage.googleapis.com/static.bit.dev/harmony-docs/readme-virtual-component-monorepo.png" width="200" alt="Bit in a Nutshell" />
</div>

With Bit we sort components in **Scopes**, where each Scope "implements" a set of components that handle a feature or a business functionality. Each component in a Scope is essentially a service for other developers to use when composing their app.

## Why Bit?

- A new way of working with software that focuses on simplicity, productivity, and composability.
- A first-class development experience for discovering, navigating, and refactoring an organization's codebase.
- Feature ownership across the orgnaization.
- Ensure different product teams remain independent while depending on other team's code.
- Compose apps and services from ready-made components and share components as services for other teams to compose with.
- Build scalable products and improve collaboration between different teams in a consistent, repeatable, and non-intrusive manner.
- Reduce code duplications.
- Easily build systems of any size.

**Develop in harmony.**

## Benefits of Using Bit

- Components simplify the design of our tools and services by giving us building blocks at the required level of abstraction.
- Components maximize code reuse to the point of having zero code duplication across our entire codebase.
- Composing apps and services with components removes the need for architecture layers in our codebase and allows for a much smoother dev-experience of working in a service-oriented codebase where each component is a service that can be composed with other components to solve concrete problems.
- Bit's scopes implement feature ownership across the organization and host cross-cutting concern components that facilitate services.
- Workspaces are flexible and can be used to maintain components from many scopes, making it easier to reuse and collaborate on available components.
- Lanes helps distributed teams to communicate and collaborate on API changes by understanding the underline dependency graph of components and "bundling" together changes that affect many teams and should be synced.

## Large scale example of building with Bit

Bit is 100% built with Bit! Every feature in Bit, from the [Bit Version Manager](https://bit.dev/teambit/bvm) to the workspace UI and even [supporting MDX](https://bit.dev/teambit/mdx), are just scopes of components developed with Bit.

Explore [dozens of OSS scopes and hundreds of OSS components](https://bit.dev/teambit) on Bit's cloud platform.

## Contributing 🎗️

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## License 💮

Apache License, Version 2.0
![Analytics](https://ga-beacon.appspot.com/UA-96032224-1/bit/readme)
