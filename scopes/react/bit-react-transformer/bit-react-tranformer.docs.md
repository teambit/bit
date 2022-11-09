---
description: A Babel plugin that adds metadata to React components.
labels: ['babel', 'react', 'component-id']
---

The Bit React transformer is a Babel plugin that adds the component id (as it determined by Bit) as a static property of the React component (both classes and functions).

Having the added metadata is useful for debbuging and [showcasing](/ui/component-highlighter).

### Example

Input:

```ts
export function Button() {
  return <div></div>;
}
```

Output:

```tsx
var __bit_component = {
  id: 'teambit.base-ui/button@1.0.0',
  homepage: 'https://bit.dev/teambit/base-ui/input/button',
  exported: true,
};

export function Button() {
  return <div></div>;
}

// attaches metadata:
Button.__bit_component = __bit_component;
```
