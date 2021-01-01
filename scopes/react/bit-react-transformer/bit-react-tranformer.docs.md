---
description: A plugin to add metadata on React components for showcase and debugging.
labels: ['babel', 'react', 'component-id']
---

The Bit React MDX transformer adds selected component metadata from Bit on React components.
All metadata is added as static props on the Components.

This supports both function and class components.

input:
```ts
export function Button() {
  return <div></div>;
}
```

output:
```ts
export function Button() {
  return <div></div>;
}

Button.componentId = 'teambit.base-ui/button@1.0.0';
```

This plugin powers Bit's inline component navigation.
