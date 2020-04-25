**Flows**
==========
Run user flows on a graph of dependent component. Used as low level API for compile/test/watch etc..

- Provides a `bit run` command to execute flows over networks.
- Provides an API to create network and execute flows.

Usage
======

run: `bit run <flow-name> [component-name]`
examples:

```bash
# runs build flow on components
bit run build

# runs build on logo and all dependents.
bit run build logo
```

Configuration
=============


Design
=======
**Terms**
- Capsule - isolated representation of a component in filesystem.
- Network - A graph of isolated component dependents.
- Flow - A collection of tasks to execute in a component capsules.
- Task - a runnable activity in a capsule.


API
====

```ts
export class Network {
  constructor(ComponentFlow[])
  execute(): FlowStream {}

  // change type - new-node, remove nodes.
  // NewNode class has a ComponentFlow member
  // NetworkChange = ComponentFlow and change type.
  patch(changes: NetworkChange[]):NetworkCreationStream{}
}

export type ChangeType = 'new' | 'remove' | 'change'

export type CustomComponent = {
  component:ComponentCapsule
  change: ChangeType
}

export class NetworkChange {
  constructor(change:ChangeType, value: BitID | ComponentFlow )
  static createFromCustom(components:CustomComponent, get:(id:BitId)=> Task[]):NetworkChange[]
}

export class FlowStream() {
  flatten(){} // subscribe to all messages
}             // might prove easy to test

export class Flow {
  constructor(private component:ComponentCapsule, private tasks:Task[]) {}
  execute(): TaskStream{}
}

export class Task {
  execute(): ExecutionStream {}
  static parseTask(task:string):Task {}
}

export class Flows {
  // for Run in workspace
  createNetworkByFlowName(name:string, seeders?:BitID[]):NetworkCreationStream {}
  // for compile
  createNetwork(seeders:ComponentCapsule[], get:(id:BitID) => Task[]) => NetworkCreationStream {}
}
```
