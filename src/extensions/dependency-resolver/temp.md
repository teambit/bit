## This issue is WIP

This issue describes the flow of calculating component dependencies.
This will be done by the dependency resolver extension.

**This is not the whole responsibility of the dependency resolver, but only a subset of its responsibility**

## relation to bit install (adding new dependencies)
The install extension and depdency-resolver extension are very related.
Actaully the install operation has 2 jobs:
1. verify the installed dependencies are in place (and install them if not)
2. tell the dependency resolver extension about potential dependencies and their versions.
In this scope, we will only talk about #2.
When running `bit install lodash 1.2.3` this will add the `lodash: 1.2.3` into the dependency resolver configuration of the workspace (proper flags for dev / peer will exist as well)
When running `bit install lodash 4.5.6 [component id glob pattern]` (exact syntax will be determined as part of the install extension). it will add the `lodash: 4.5.6` into the matching glob pattern (created if not exist), in the variants, under the dependency-resolver config.
(or in the matching components.json if exists)

## component configuration

## component data
The dependency-resolver extension will store in its data (part of the component model), the final dependencies after all the calculations, and also the dependencies calculated by the workspace configuration (and require detection) - without putting the component config rules and dependencies added by extensions (via the hooks)
(see calculation flow below)

## calculation flow
The dependency calculation will be triggered by external player (probably the workspace / scope extensions)
This player will pass to the dependency resolver
* "raw component" (exact type tbd), this will have in general the component files, the component config, and the component extensions at least.
* workspace config for the resolver (optional) - should be discussed, see the open question below
### dependencies by code analysis (import / require detection)
The dependency resolver will start by analyzing the imports / require statements of the source code and intersect them with the dependencies from the workspace configuration -
If it detects for example a `require('lodash');` it will search for lodash in the config. (if not found it will throw an error that the dependency is missing so it can't resolve its version)
(This part must be extendable by third part extensions, exact syntax TBD - see open question)
### add the extensions themself as dependencies
If a component has extension defined for it, this extension should be considered as a dev dependency.
### dependencies added by extensions
An extension might provide more dependencies / remove dependencies (uses the hook - see API below).
The dependency resolver will take this dependencies configuration added by all the hook subscribers and merge them with themself (2 extensions for the same component might add the same dependency in a different version) - exact strategy to be defined - see open question
Then it will merge the final result with the result of the previous steps (dependencies configured here are stronger than those from the code analysis)
### dependencies added by component config
The dependency resolver will read special rules configured in the component config and will merge them into the previous results.
Since these rules added explicitly by the user, they are the strongest ones.

## API
### hooks
The dependency resolver will provide a hook called @dependncies (name is open - see open question below) to enable 3rd party extension to add dependencies for a component.
here is an example:
```js
// my 3rd party extension
import { Extension } from '@teambit/bit';
import { DependencyResolver, Dependencies } from '@teambit/dependency-resolver';
@Extension()
export class MyExtension {
  constructor(
    private dependencyResolver: DependencyResolver,
  ) {}

  @Dependencies
  addDependencies() {
    return {
      "dependencies": {
        "underscore": "1.1.1"
      },
      "devDependencies": {
        "types/underscore": "1.1.1"
      }
    }
  }
}
```

## open decisions
* names of the workspace configuration fields
* syntax for complete override the dependencies for the component
* in the component config when specifying `"@teambit/my-awesome-component": "5.5.5"` is that means add my-awesome-component in version 5.5.5 to all components, or just in case there is require for my-awesome-component use version 5.5.5 instead of 1.1.1? (we should have both syntaxes in the component configuration)
* hooks syntax
* type that the calculation gets as input (the "raw component")
* how the dependency resolver gets it's workspace config? did the workspace read and pass it to the calc function, or the resolver read it himself (this might cause circular depdencies, since the resolver can't use the workspace for this since the workspace use the resolver himself)
* how we extend the import / require analysis to enable 3rd party extension to extend it?
* What is the strategy to merge dependencies added by hooks between themself (random / load order / alphabetically?)
* More methods that should be exposed via the API
