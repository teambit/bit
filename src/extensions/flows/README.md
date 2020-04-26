**Flows**
==========

Run user flows (****) on a graph of dependent component. Used as low level API for compile/test/watch.

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
      "build": ["#@teambit/extensions:transpile"],
      "compileHack": ["ls -la", "mkdir dist;cp index.js dist/index.js"]

    }
  }
}
```

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


Design
=======
The flows API solves the problem of reporting the execution of dynamic activies acrross a graph of isolated components.
The problem becomes complex in usecases like typescript API where dependent/dependency components build order needs to be respected.

Flows solves this problem by providing - Unified UX, Perfomance and Topological execution of flows of dependent components.

********

- Capsule - isolated representation of a component in filesystem.
- Network - A graph of component capsules.
- Flow - A collection of tasks to execute in component capsule.
- Task - a runnable activity in a capsule defined by bash or javascript task.

For each main term there is am module in the flows API

How to implement a task
========================


API
====

