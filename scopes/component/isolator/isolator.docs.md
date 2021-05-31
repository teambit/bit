---
description: Isolate components for build, debugging, development and testing.
labels: ['isolation', 'component']
---

## Isolate a component

```bash
bit create-capsule ui/button
```

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
  capsules: CapsuleList,
};
```

## API

The exact particularities of this API are beyond the scope of this readme. Instead, this document opts to
provide a general description of the methods of this API and their purpose.

### Isolator.isolateComponents

This method receives a list of components, create capsule for the components and write the components data into the capsule.
It returns a list of capsules.
