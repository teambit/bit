---
description: Provides access to a Bit-flavoured MDX import references through React context.
labels: ["mdx", "bit-flavoured", "import", "references"]
---

The mdx-scope-context makes all modules used (and imported) by the MDX file, available to the live playground.

For example, the following MDX shows modules imported to the MDX file, used by the live playground without explicitly defining them in the playground's scope.

````md
// in my-component.docs.mdx
import {MyComponent} from './my-component'
import {Button} from '@my-org.design-system/button'

```jsx live=true
() => {
  <MyComponent>
    <Button>click</Button>
  </MyComponent>;
};
```
````
