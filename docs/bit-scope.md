
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

## Component Dependencies

As shows in the [configurating bit](configurating-bit.md) section, you can list as many code components as dependencies to your own component. Also, the versions of the dependencies will be locked, until you decide to update them. This means that wherever the component is being used, it will have the same dependencies.

## Package Dependencies

Just as you can use other Bit components as dependencies, we also understand that there's a lot of previous work that have been developed and deployed to other package managers, and code components should be able to depend on them. Bit does it by integrating to other known package source (for example - NPM). However, bit does not handle these dependencies, and will not manage them. If a code component has a package dependency defined, it will tell the user what needs to be installed. So unlike code component dependencies, you will be required to manage your external dependencies by youself. Bit will help you with letting you know what's missing, but will not interfere with your dependency resulotion process. 

## Scope CI

Bit comes with a built-in slim CI mechanism.

The CI mechanism uses Bit's [environment boilerplating](bit-component.md#component-environment) to create an ad-hock CI process for each code component. This process happens while a component is being committed to the local scope, and exported to a remote scope. 

By utilizing each component's build and test environments, Bit has the instructions for building and testing components. Also, if a component has a dependency (or even requires an external package from a known source - NPM for example), Bit will retrieve the dependencies when starting the process. This way Bit makes sure that each component is indeed isolated and encapsulated.

The reason Bit has this built-in CI engine, is that figuring out a proper CI process for packages is a hassle. It requires setting up a build server, figuring out the right scripts and maintaining everything alongside with your package itself. For large packages this makes sense, but when using micro-packages - this is a lot of work. On top of that - it's very hard to update and debug these processes, and even update, if the package itself changes the underline technology it uses (for example - changing the library used to run tests). Bit makes it to be a simple process, which is based of the fact that the environments it uses for build and test are actual code components (which Bit is desinged to manage), with a specific API (to run and get results) and an internal dependency management for other components as well as external packages. All are parts of the eco-system, which together form a CI engine for code components.

Bit forces strict rules when it get to building and testing code. If a component needs to be build to run (for example - transpile from TypeStrict to ES), and the build process fails when exporting, Bit will fail the exporting process. The same thing happens if a component has a set of tests that failed to run. This is to make sure that no breaking changes are being exported (this behavior can be overriden by using the `--force` flag when exporting components).

## Discoverability

One of the biggest problems for developers today is being able to find and reuse existing code components. Bit was created with exactly this problem in mind, so we place high importance on component discoverability.

Bit has an internal search engine capable of searching all the scopes connected to your computer. This search engine can be accessed from your CLI so you can access external resources without leaving your development environment. The search engine works by indexing components along with their documentation and querying them using fuzzy search techniques like abbreviations and stemming. This allows more flexibility when searching components, because you don’t have to remember exactly how you called your component in order to easily retrieve it. Our long-term aim is to introduce a semantic search that will allow developers to describe a component’s functionality in natural language and get the most relevant results regardless of the specific phrasing used when naming and documenting components. When we introduce semantic search, you’ll be able to use the query ‘is str’ for example, and get results where the name and documentation use different phrasings, like ‘validate string’ or ‘check string’. Another example would be 'convert string to int' which will return components like 'parse-int'.

Finally, the paradigm of keeping your code components in small packages also facilitates discoverability. Normally, while writing and maintaining packages, you need to have a README file that explains the whole project to other developers. Maintaining it means more manual work, which in many cases ends up in out-of-date information. Keeping component documentation right with the code itself means that it will always be up-to-date, accessible and easy to use. Bit search also makes sure to provide you only with the most recent version of each component.
