---
labels: ['typescript', 'utils', 'webpack']
description: 'webpack config mutator.'
---

A small wrapper around webpack config object.
This wrapper help you to mutate the webpack config in a chainable way.
In general it is a sugar syntax to do commong operation on the config like add a plugin or and entry.
It also give you different options like append and prepend for arrays and override, ignore, throw (for conflict) for objects;

You can also mutate the raw config itself by accessing `mutator.raw`.

import { WebpackConfigMutator } from './config-mutator';
import JSONFormatter from 'json-formatter-js';

```js live
() => {
  const config = new WebpackConfigMutator({});
  class MyPlugin {
    apply(compiler) {}
  }

  const cssRule = {
    test: /\.css$/,
    exclude: /\.module\.css$/,
    use: ['style-loader', 'css-loader'],
  };

  config
    .addEntry('./entry1.js')
    .addEntry('./entry2.js', { position: 'prepend' })
    .addPlugin(new MyPlugin())
    .addAliases({ react: 'custom-react-path' })
    .addTopLevel('output', { publicPath: { publicPath: 'my-public-path' } })
    .addModuleRule(cssRule);

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
