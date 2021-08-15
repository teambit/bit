---
labels: ['typescript', 'utils']
description: 'typescript config mutator.'
---

A small wrapper around the typescript config object.
This wrapper help you to mutate the typescript config in a chainable manner.
In general it is a sugar syntax to do common operation on the config like add options or types files.

You can also mutate the raw config itself by accessing `mutator.raw`.

import { TypescriptConfigMutator } from './ts-config-mutator';
import JSONFormatter from 'json-formatter-js';

```js live
() => {
  const config = new TypescriptConfigMutator({});
  class MyPlugin {
    apply(compiler) {}
  }

  config
    .addTypes(['path1/types.d.ts', 'path2/types.d.ts'])
    .setExperimentalDecorators(true)
    .setTarget('es2015')
    .addExclude(['dist']);

  const dataContent = new JSONFormatter(config.raw, 2);
  return (
    <div>
      <div
        ref={(nodeElement) => {
          nodeElement && nodeElement.replaceWith(dataContent.render());
        }}
      />
    </div>
  );
};
```
