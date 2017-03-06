
# Bit Scope

## What is a Bit Scope?
Bit's Scope is one of the fundamental entities of Bit. A Scope is a dynamic codebase responsible to end-to-end management of code components.
Scopes are where components are stored, tested, built and integrate with each other.
 
The Scope's distributed nature is meant to enable teams to create scopes for every different level of abstraction inside the organization.
For example, a team in an organization may want

Each component belongs in a scope (or multiple scopes). therefore, the scope's name appears in the component's ID path (which consists of owner/scope/box/component).

## Component Store
Bit stores all components with version in a content-addressable filesystem.
This enables Bit to...

// TODO

## Dependency Management

Bit's dependency resolution and management was especially designed for the use code components.
Therefore, we designed its dependency management mechanism with few relevent and major constraints in mind:

1. ***Installation (import) performance*** - To make 
2. ***Predictable and deterministic*** - The same dependencies will be installed at the same exact version, anywhere and acoross every machine to avoid dependency hell and deep dependency debugging.
3. ***Component availability*** - components should be made always available 

When you build a new component, you can add as many dependencies as you need in the bit.json file.

The bit export command will ensure the component will be packaged with all its dependencies.

When bit push is issued, the new component, with all its dependencies, will all be uploaded to the scope.

Once a component is pushed to a scope, the receiving scope will try to build and test the component to ensure it is, in fact, isolated.
bit import will download the component with all of its dependencies in a single call.

#### The benefits of on-export dependency resolution.

1. Fast build time - When your application builds Bit does nothing but simply downloading a flat list of dependencies. That's it. Bit doesn’t have a dependency tree, so no need for recalculating and downloading more dependencies. This means a faster build time. 
2. Reliability - Since every component is stored with its dependencies, in a tested version to work with, you can be sure it will keep working in any new environment regardless of any changes made to its dependencies (even if deleted).
3. No duplications - Bit knows what are the exact dependencies it needs to grab, so if there are any duplications, it will simply download a single working copy. 

## Scope CI

Bit comes with a built-in slim CI mechanism.

// TODO

## Discoverability

One of the biggest problems for developers today is being able to find and reuse existing code components. Bit was created with exactly this problem in mind, so we place high importance on component discoverability.

Bit has an internal search engine capable of searching all the scopes connected to your computer. This search engine can be accessed from your CLI so you can access external resources without leaving your development environment. The search engine works by indexing components along with their documentation and querying them using fuzzy search techniques like abbreviations and stemming. This allows more flexibility when searching components, because you don’t have to remember exactly how you called your component in order to easily retrieve it.

The paradigm of keeping your code components in small packages also facilitates discoverability. Normally, while writing and maintaining packages, you need to have a README file that explains the whole project to other developers. Maintaining it means more manual work, which in many cases ends up in out-of-date information. Keeping component documentation right with the code itself means that it will always be up-to-date, accessible and easy to use. Bit search also makes sure to provide you only with the most recent version of each component.
