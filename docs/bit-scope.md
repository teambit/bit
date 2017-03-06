
# What is a Bit Scope?
Bit's Scope is one of the fundamental entities of Bit. A Scope is a dynamic codebase responsible to end-to-end management of code components.
Scopes are where components are stored, tested, built and integrate with each other.
 
The Scope's distributed nature is meant to enable teams to create scopes for every different level of abstraction inside the organization.
For example, a team in an organization may want

Each component belongs in a scope (or multiple scopes). therefore, the scope's name appears in the component's ID path (which consists of owner/scope/box/component).

# Component Store
Bit stores all components with version in a content-addressable filesystem.
This enables Bit to...

// TODO

# Dependency Resolution and Management

Bit's dependency resolution and management was especially designed for the use code components.
Therefore, we designed its dependency management mechanism with few relevent and major constraints in mind:

1. **Installation (import) performance** - To make 
2. **Predictable and deterministic** - The same dependencies will be installed at the same exact version, anywhere and acoross every machine to avoid dependency hell and deep dependency debugging.
3. **Component availability** - components should be made always available 

When you build a new component, you can add as many dependencies as you need in the bit.json file.

The bit export command will ensure the component will be packaged with all its dependencies.

When bit push is issued, the new component, with all its dependencies, will all be uploaded to the scope.

Once a component is pushed to a scope, the receiving scope will try to build and test the component to ensure it is, in fact, isolated.
bit import will download the component with all of its dependencies in a single call.

#### The benefits of on-export dependency resolution.

1. Fast build time - When your application builds Bit does nothing but simply downloading a flat list of dependencies. That's it. Bit doesn’t have a dependency tree, so no need for recalculating and downloading more dependencies. This means a faster build time. 
2. Reliability - Since every component is stored with its dependencies, in a tested version to work with, you can be sure it will keep working in any new environment regardless of any changes made to its dependencies (even if deleted).
3. No duplications - Bit knows what are the exact dependencies it needs to grab, so if there are any duplications, it will simply download a single working copy. 

# Scope CI

Bit comes with a built-in slim CI mechanism.

// TODO

# Discoverability

One of the major issues with today’s package managers is that finding the right package is hard. Even if you've found the right package, you still need to figure out how to use it.

The journey from searching a certain package with an implemented functionality to finding and using it is long and full of uncertainty. This is exactly why developers end-up rewriting stuff and duplicating it.

Bit solves both these issues by design.

1. Finding the right component -
    Bit has an internal search engine capable of searching in all the scopes connected to your computer. This search engine can be accessed from your CLI so that you do not need to leave your development environment while still having access to external resources.
    The search engine works by indexing and querying over the documentation you write in the components themselves (there are no README.md files at all). That code itself is the most up-to-date place to point out the component’s functionality. Keeping the code and comments updated will make sure you can find the components you need.

2. Learning to use components -
    Normally, while writing and maintaining packages, you need to have a README.md file of sort that other developers can read and learn how to use your package.
    Maintaining it means more manual work, ending up in these files often not being up-to-date. They may even contain false information, and cause frustration when trying to use a new package.
    Keeping the component documentation right with the code itself means that it'll always be updated, approachable, and easy to use.

3. Combining search and documentation -
    By integrating the search engine to the code's documentation we can assure that you will find the most accurate result, which is sure to be maintained and working, with the latest version of the component.
