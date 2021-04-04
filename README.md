
# Build modular apps with components in harmony

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

- [Getting started (install Bit)](https://harmony-docs.bit.dev/getting-started/installing-bit)
- [What is Bit?](https://harmony-docs.bit.dev/essentials/what-is-bit)
- [Building with Bit](https://harmony-docs.bit.dev/building-with-bit/pre-existing-components)
- [Component Architecture](https://harmony-docs.bit.dev/component-architecture/thinking-in-components)
- [Bit commands](https://harmony-docs.bit.dev/reference/commands)

### Aspects

- [Overview](https://harmony-docs.bit.dev/aspects/aspects-overview)
- [React](https://harmony-docs.bit.dev/aspects/react)
- [React Native](https://harmony-docs.bit.dev/aspects/react-native)
- [Node](https://harmony-docs.bit.dev/aspects/node)

### Resources & Community

- [Conference talks](https://harmony-docs.bit.dev/resources/interviews)
- [Interviews](https://harmony-docs.bit.dev/resources/interviews)
- [Podcasts](https://harmony-docs.bit.dev/resources/podcasts)
- [Live streams](https://harmony-docs.bit.dev/resources/live-streams)
- [Articles](https://harmony-docs.bit.dev/resources/articles)
- [Community](https://harmony-docs.bit.dev/resources/community)


## What is Bit?

Bit is an open-source tool that helps you develop modern applications in a modular way, through components that are independently developed, built, tested, versioned, and integrated into different projects. Through the [Bit Cloud](https://bit.dev/) teamwork can scale to many teams collaborating on many components to compose many applications together.

We use this approach to build using service-oriented architecture, where **components are services**. This simplifies our codebase, as it promotes composability and modularity.

<div style={{textAlign: 'center'}}>
    <img src="https://storage.googleapis.com/static.bit.dev/harmony-docs/readme-virtual-component-monorepo.png" width="200" alt="Bit in a Nutshell" />
</div>

Bit lets us sort components in **Scopes**, where each Scope "implements" a set of components that handle a feature or a business functionality. Each component in a Scope is essentially a service for other developers to use when composing their app.

Scopes allow us to achieve feature ownership as each Scope's components can implement different tools, libraries, SDKs, and UI relevant to that specific business concern/feature.

## Why Bit?

Building software that scales is complex and gets more challenging for larger systems where the ability to collaborate and sync between many distributed teams on the same end-product(s) is crucial.  
We need a new way of working with software that focuses on simplicity, productivity, and composability.

Solutions like monorepos can be a solution for a single codebase; we need to scale this architecture for the entire organization, which has many product teams, each with its codebase. We need a first-class development experience for discovering, navigating, and refactoring an organization's codebase while ensuring different product teams remain independent while depending on other team's code.

We want to compose apps and services from ready-made components and share components as services for other teams to compose with. We want to build scalable products and improve collaboration between different teams in a consistent, repeatable, and non-intrusive manner.
We don't want code duplications and build systems of any size.

**We want to develop in harmony.**

## Virtual Component Monorepo

Bit unlocks a unique software architecture that simplifies our frontend apps, backend services, and tools by enabling us to construct them as "modular codebases" using composable components.

In Bit, we implement all our code in components, sort them into different scopes and use them to create different workspaces for features and bug fixes. By composing with components, we create dependency relationships across teams, so when we build new capabilities, we have full access to all available components, just like in a monorepo. However, we still use smaller repositories to collaborate on code changes.

### Component

<div style={{textAlign: 'center'}}>
    <img src="https://storage.googleapis.com/static.bit.dev/harmony-docs/readme-component.png" width="50" alt="Component" />
</div>

The component is the basic building block in Bit. A component can represent a UI primitive (button, text area), a middleware (authentication, log), SDK for a service, themes/styles...

Implement components as services to remove the need for layers (horizontal, vertical slice, or onion) in your architecture. This ensures all building of more concrete components is done by composing small and simple ones.

Highly concrete and specialized components can be apps, backend services, micro-frontends, serverless functions, etc.

### Scope

<div style={{textAlign: 'center'}}>
    <img src="https://storage.googleapis.com/static.bit.dev/harmony-docs/readme-single-scope.png" width="100" alt="Scope" />
</div>

A Scope is a product feature in the organization's "virtual" codebase. Scope hosts closely related and cross-dependent components that implement all cross-cutting concerns of a product aspect. For example, a **User** scope can have a `login-form` frontend component, `authentication` middleware, `user-settings` micro-frontend, and a `user-service` microservice.

All components of a Scope are available as services for other teams, apps, and components. Each scope is owned by a different product team responsible for that functionality.

Scopes allow for optimal reuse of components across multiple teams.

### Component Marketplace

<div style={{textAlign: 'center'}}>
    <img src="https://storage.googleapis.com/static.bit.dev/harmony-docs/readme-connected-scopes.png" width="280" alt="Component Marketplace" />
</div>

A component marketplace happens naturally when we grow the number of scopes and create dependency relationships between components. Each scope contains all its dependencies cached to improve the performance and reliability, making the process of depending on others' code more stable.

A centralized component marketplace helps with the discoverability of components. All developers know where they can find components and decide to create new scopes to publish new components.

A growing component marketplace reduces the amount of work on each new feature.

### Workspace

<div style={{textAlign: 'center'}}>
    <img src="https://storage.googleapis.com/static.bit.dev/harmony-docs/readme-workspace.png" width="100" alt="Workspace" />
</div>

A workspace is a place where we use to work with all our components. It gives us a “monolithic development experience” with full code navigation, debugging, and refactoring across components. It is a place where we can work on all our components as building blocks, create new ones, manage configurations and collaborate on components.

Workspaces are flexible and used to maintain components from many scopes.

We use Git repositories to collaborate in workspaces.

### Lane (coming soon)

A lane facilitates an overarching change across multiple components. Lane mirrors a software development swim lane where a change needs to happen for several components at once. Think about the capability of tying together Pull Requests from multiple Git repositories to a single "virtual" PR.

We use Lanes to manage cross-team changes and communicate over API changes for components.

## Benefits of Using Bit

- Components simplify the design of our tools and services by giving us building blocks at the required level of abstraction.
- Components maximize code reuse to the point of having zero code duplication across our entire codebase.
- Composing apps and services with components removes the need for architecture layers in our codebase and allows for a much smoother dev-experience of working in a service-oriented codebase where each component is a service that can be composed with other components to solve concrete problems.
- Bit's scopes implement feature ownership across the organization and host cross-cutting concern components that facilitate services.
- Workspaces are flexible and can be used to maintain components from many scopes, making it easier to reuse and collaborate on available components.
- Lanes helps distributed teams to communicate and collaborate on API changes by understanding the underline dependency graph of components and "bundling" together changes that affect many teams and should be synced.  

## We build Bit with Bit

Bit is 100% built with Bit! Every feature in Bit, from the [Bit Version Manager](https://bit.dev/teambit/bvm) to the workspace UI and even [supporting MDX](https://bit.dev/teambit/mdx), are just scopes of components developed with Bit.  

Explore [dozens of OSS scopes and hundreds of OSS components](https://bit.dev/teambit) on the Bit cloud platform.  

This also means you can customize and extend any part of Bit as you like! It's just a simple matter of importing and editing a component or adding a new one.  

## Contributing 🎗️

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

See [Contributing](CONTRIBUTING.md).

## License 💮

Apache License, Version 2.0
![Analytics](https://ga-beacon.appspot.com/UA-96032224-1/bit/readme)
