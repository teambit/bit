refactoring to do in Bit:

- config api is far too concete and causes coupling, we need to delegate configuration to harmony.
  - start by standardizing seralization and deserialization of types.
- refactor all implmentations of the api file to or Bit extensions for now.
- chanage the name of the debug environment variable from BLUEBIRD_DEBUG to DEBUG.
- refactor filesystem to be given to Bit so it could be reaplced from the outside.
- consolidate and refactor file system and path selection outside of Bit through workspace.
- rewrite and replace cli infraturcture
  - React components for UI using Ink or anything else.
  - support stdout streaming through extensions.
  - extensions 
  - add progress api to promises and report everything to an observable.
  - support json for everything
- refactor and narrow `Scope` public api.
- gradually refactor and narrow consumer api into the new `Workspace` api.
- redesign bit's api in the "Bit" module and expose it as our api. 
- prettier totally breaks how consturctors should look like (define and apply same prettier on all of our projects).
- refactor bit id to the component id module.
- why i don't get a component representation after import? leads to a confusing user experience
- graph access to scope.
- which extensions to load? lazy loading of extensions could get really complicated. we will install everything the user directly configured and lazy install what not and use scoping to do that.
- long-sustaining capsules and capsule cli. understand product here and connect to CI.
- create a new facade for component and slowly refactor it to be the sole component model of bit.
- build capsule worker for in memory usage using process distribution and v8 isolation (in process v8:isolate).
- refactor all paths in bit to be absolute.
- refactor "bit-id" to be called "component-id", better be on top of the `Component` new API.
- replace commander with something proper (amit).
- consider inclduing the extension in the container to avoid conflicts in runtime.

- refactor a component outside of a component.

things done:
- 

