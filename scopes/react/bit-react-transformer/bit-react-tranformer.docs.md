---
description: A Babel plugin that adds metadata to React components.
labels: ['babel', 'react', 'component-id']
---

The Bit React transformer is a Babel plugin thar adds the component id (as it determined by Bit) as a static property of the React component (both classes and functions).

Having the added metadata is useful for debbuging and [showcasing](/ui/component-highlighter).

### Example

#### Input
```ts
export function Button() {
  return <div></div>;
}
```

#### Output
```ts
export function Button() {
  return <div></div>;
}

// (assuming this is the component-id)
Button.componentId = 'teambit.base-ui/button@1.0.0';
```