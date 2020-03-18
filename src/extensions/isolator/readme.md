# Isolator
The component isolator manages networks of capsules, which are isolated component environments.

## Entities

### Capsule
Bit implements a filesystem capsule, which is an isolated folder containing the component files.
Capsules include the component files and links to other capsules that include the component's dependencies.

### Network
A network is a group of capsules, related to one another by their dependencies.
A network includes a graph of all seed components given to it, as well as a list of the capsules.

Example:
```javascript
const Network = {
  graph: Graph,
  capsules: CapsuleList
}
```

## API
The exact particularities of this API are beyond the scope of this readme. Instead, this document opts to
provide a general description of the methods of this API and their purpose.

### Isolator.createNetworkFromConsumer
This method receives a list of seeder component IDs and a consumer including them.
It returns a Network including the seeder components as well as any of their dependencies.

### Isolator.createNetworkFromScope
Like createNetworkFromConsumer but receives a Scope instead.

### Isolator.createNetwork
Like createNetworkFromConsumer and createNetworkFromScope, only this method receives a graph directly. This method is also used internally by the above two methods, but is provided in the API as a convenience.
