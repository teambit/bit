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
      //            orgname scope
      "build": ["#@teambit/extensions/r
        :transpile"],
      "compileHack": ["ls -la", "mkdir dist;cp index.js dist/index.js"]
    }
  }
}

```
You may also use the variance configuring option to override the flow of specififc component.
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

Recommended Work **Flows**
======================
Agree on a common workflow name which will be respected in your team while configuring your componets.

For example
 - build - run all compilation/testing/lint
 - ci - flow to run bit CI system
 - debug - compiling with source map and what not.
 - personal - personal workflow team doesnt know of, to test things.

This will allow developers to scale according to convention rather then configuration.
Components from different teams are build with the same UX so users don't need to go in to the build details
of each componet.

How to implement a task
========================
When running a javascript task a container vanilla script call __bit_container.js is created which calles your task.
A task is a module inside a bit component which exports a defualt function with the following signature. This component
is defined as dev Dependency for each componnent and is isolated with it.

A task needs to expose a function on the default export or moduel.exports with  the following signature

```typescript
export type Task = () => any | () => Promise<any>
```

Each task stdout, stderr is reported.
Each task result which is truthy should be reported to bit main process.

Design
=======
The flows API solves the problem of reporting the execution of dynamic activies acrross a graph of isolated components.
The problem becomes complex in usecases like typescript API where dependent/dependency components build order needs to be respected.

Flows solves this problem by providing - Unified UX, Perfomance and Topological execution of flows for dependent components.

******** Entities **

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

Flows  API
===========
Flows API is document in flows.ts module. Here are two examples:


```javascript
import {Flows, flattenReplaySubject} from '@teambit/flows'

const flows = new Flows(workspace)
const execution = flows.run(seeders)

// rxjs example
flattenReplaySubject(execution)
  .subscribe(
    (x:any) => console.log(x)
  )

// promise example
await flows.runToPromise(seeders)
