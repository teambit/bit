
Run tasks on components and their dependents.

- Provides a `bit run` command to execute tasks on components in worksapce.
- Provides an API to create network of components and execute tasks.
- Used as a low-level API for other Bit commands like `compile`, `test` and `watch`.

## Description

Inside a Bit project all components are linked to each other in a **network** according to their dependency graph. When you make a change, you can see the downstream effets when running component tasks. This means that all tasks run in the right order and if several components don't directly depend on each other, Flows parallelizes their tasks (and shows live console output in a readable order).

## Usage

### Command sinopsys

```sh
bit run <flow-name> [components...] [-v | --verbose] [--concurrency]
```

#### Examples

```bash
# runs 'build' flow on all components that have 'build' task defined.
bit run build

# runs 'build' flow for a specific component.
bit run build logo

# same as before with verbose output
bit run build logo --verbose

# setting concurrency
bit run build logo --concurrency 4 --verbose
```

### Configuration

Use `bit.jsonc` configuration docs to understand how to configure bit.

```js
// workspace configuration with default values for 'concurrency' and 'verbose'

{
  "teambit.pipelines/flows": {
    "concurrency": 4,
    "verbose": false,
    "tasks": {
      // the structure of a module task id: = `\`#${PackageName}:${PathToModule}\``
      "build": ["@bit/bit.evangalist.extensions.react-ts:transpile"],
    }
  }
}

```

You may also use the `variants` configuring option to override `tasks` of a specific component(s).
The structure allows only for the task entry in that use case.

```javascript
{
  "variants": {
    "ui/*":{
      "teambit.pipelines/flows": {
        "tasks": {
          "build": ["some_build_task"]
        }
      }
    }
  }
}
```

Consult with the docs to learn more about variants.

## Flows  API

Flows API is document in [`flows.ts`](https://github.com/teambit/bit/blob/harmony/main/src/extensions/flows/flows.ts) module. Here are two examples:

```js
import {Flows, flattenReplaySubject} from 'teambit.pipelines/flows'

const flows = new Flows(workspace)
const execution = flows.run(seeders)

// rxjs example
flattenReplaySubject(execution)
  .subscribe((result) => console.log('result is:', result))

// promise example
const result = await flows.runToPromise(seeders)
console.log('result is', result)
```

## Recommended Work`Flows`

Flows prefers convention over configuration for managing team's workflow to scale their development. It's philosophy is that when teams agree on the kind of actions they support it's easier to onboard developers to various projects in the organization. This is mainly becasue it helps developers avoid the details of each component build and treat it as the "same" action.

For example:

 - `build` - run all compilation/testing/lint
 - `ci` - flow to run bit CI system
 - `dev` - compiling with source map and what not.
 - `personal` - personal workflow team doesn't know of, to test things.

## How to implement a task

A `task` is a module which exports a default function (or `module.exports`) with the following signature:

```ts
export type Task = () => any | () => Promise<any>
```

- Tasks should be tracked and exported as components to a remote Bit scope.
- Tasks defined as `devDependencies` for components consuming them.
- Each task `stdout`, `stderr` is reported.
- Each task should return a value (which is truthy) which will be reported to Bit's main process.

## Design

The Flows API solves the problem of reporting the execution of dynamic activities across a graph of isolated components. The problem becomes complex in use cases like TypeScript API where dependent/dependency components build order needs to be respected.

Flows solves this problem by providing:

- Unified UX
- Aggressive caching
- Topological execution order.

### Entities

- Capsule - Isolated representation of a component in filesystem.
- Network - A graph of component capsules.
- Flow - A collection of tasks to execute in a capsule.
- Task - a runnable activity in a capsule defined by bash or javascript task.

For each main term there is a module in the flows implementation.

### Additional modules

- Cache - Caches capsule execution in `~/Library/Caches/Bit/capsules`
- Run  - Holds run command as a component.
- util - fake-capsule creation, rxjs helper etc.

