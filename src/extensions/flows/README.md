**Flows**
---------
Run user flows on a network of dependent component

**Product**
- Provides a `bit run` command to execute flows over networks.
- Provides an API to create network and execute user flows.

**Terms**
- Capsule - isolated representation of a component in filesystem.
- Network - A graph of isolated component dependents.
- Flow - A collection of tasks to execute in a component capsules.
- Task - a runnable activity in a capsule.

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
  createNetworkByFlowName(name:string, seeders?:BitID[]):NetworkCreationStream {}  // for Run in workspace
  createNetwork(seeders:ComponentCapsule[], get:(id:BitID) => Task[]) => NetworkCreationStream {} // for compile
}
```
EndTimeInfo = {duration:number, end:Date}
Start = Date

**Network Execution Messages**
- network:start
- network:end -> EndTimeInfo
- network:FlowStream
- flow:start
- flow:result -> DependencyError || Array<T | Error | PervTaskFailedError>, EndTimeInfo
- flow:TaskStream
- task:start,
- task:result -> T extends {status:number},
- task:stdout -> string messages.
- task:stderr -> string messages.


**Network Creation Messages**
- capsule:sync:start
- capsule:sync
- capsule:create:start
- capsule:create -> EndTimeInfo, Capsule
- capsule:install:stdout
- capsule:install:stderr
- capsule:install:start
- capsule:install -> EndTimeInfo, id, status
- network:start
- network:end -> Network, EndTimeInfo
- capsule:stream

**Open questions?**
1. How to buffer messages until subscribed ? or provide subscriber
2. stream of streams or messages ?
3. How to handle caching ?
4. How to handle version ?
5. Why did scripts need a registry ?

