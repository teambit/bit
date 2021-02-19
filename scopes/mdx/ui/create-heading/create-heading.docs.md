---
labels: ['react', 'typescript', 'ui', 'title', 'heading']
description: 'A function that returns a heading component with a specific size'
---

import { createHeading } from './create-heading';

A function that returns [Documenter’s Heading component](https://bit.dev/teambit/documenter/ui/heading) with a specific one of these sizes:  
`"xxs" | "xs" | "sm" | "md" | "lg" | "xl" | "xxl"`

H1 size example:

```js live
() => {
  const Heading = createHeading('lg');
  return <Heading>H1 size</Heading>;
};
```

H2 size example:

```js live
() => {
  const Heading = createHeading('md');
  return <Heading>H2 size</Heading>;
};
```
