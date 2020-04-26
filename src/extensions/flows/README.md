**Flows**
==========
Run user flows on a graph of dependent component. Used as low level API for compile/test/watch.

- Provides a `bit run` command to execute flows over networks.
- Provides an API to create network and execute flows.

Usage
======
run: `bit run <flow-name> [component-name]`

examples:

```bash
# runs build flow on components
bit run build

# runs build in the logo capsule and all of logo's dependents.
bit run build logo

# same as before with verbose output
bit run build logo --verbose

# setting concurrency
bit run build logo --concurrency 4 --verbose
```

Configuration
=============
Use bit.jsonc configuration docs to understand how to configure bit.

```js
// workspace configuration

{
  "@teambit/flows": {
    // can be override with cli
    "concurrency": 4,
    "verbose": false,
    // workspace
    "tasks": {
      // the structure of a module task id: = `\`#${PackageName}:${PathToModule}\``
      "build": ["#@bit/bit.evangalist.extensions.react-ts:transpile"],
      "compileHack": ["ls -la", "mkdir dist;cp index.js dist/index.js"]
    }
  }
}

```
You may also use the variance configuring option to override the flow of specific component.
The structure allows only for the task entry in that use case.

```javascript
{
  "variance": {
    "ui/*":{
      "@teambit/flows": {
        "tasks": {
          "build": ["some_build_task"]
        }
      }
    }
  }
}
```

Consult with the docs to learn more about variance.

Flows  API
===========
Flows API is document in flows.ts module. Here are two examples:

```javascript
import {Flows, flattenReplaySubject} from '@teambit/flows'

const flows = new Flows(workspace)
const execution = flows.run(seeders)

// rxjs example
flattenReplaySubject(execution)
  .subscribe((result) => console.log('result is:', result))

// promise example
const result = await flows.runToPromise(seeders)
console.log('result is', result)
```

Recommended Work **Flows**
===========================
Prefer convention over configuration, if teams can agree on the kind of actions there teams supports
you can scale development by a lot. Helping developers to avoid the details of each component build and treat it as the "same" action.

For example
 - build - run all compilation/testing/lint
 - ci - flow to run bit CI system
 - dev - compiling with source map and what not.
 - personal - personal workflow team doesn't know of, to test things.

How to implement a task
========================
A task is a module inside a bit component which exports a default function with the following signature. This component should be defined as dev Dependency of the component consuming this task.

A task needs to expose a function on the default export or module.exports with the following signature

```typescript
export type Task = () => any | () => Promise<any>
```

Each task stdout, stderr is reported.
Each task return value (which is truthy) should be reported to bit main process.

Design
=======
The flows API solves the problem of reporting the execution of dynamic activities across a graph of isolated components. The problem becomes complex in use cases like typescript API where dependent/dependency components build order needs to be respected.

Flows solves this problem by providing - Unified UX, Aggressive caching and Topological execution order.

**Entities**

- Capsule - isolated representation of a component in filesystem.
- Network - A graph of component capsules.
- Flow - A collection of tasks to execute in component capsule.
- Task - a runnable activity in a capsule defined by bash or javascript task.

For each main term there is a module in the flows implementation.

Additional modules
===================
- Cache - Caches capsule execution in `~/Library/Caches/Bit/capsules`
- Run  - Holds run command as a component.
- util - fake-capsule creation, rxjs helper etc.
