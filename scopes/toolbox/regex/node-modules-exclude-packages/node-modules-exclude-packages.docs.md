---
labels: ['typescript', 'utils', 'packages', 'node modules']
description: 'Exclude packages from node modules.'
---

import { nodeModulesExcludePackages } from './node-modules-exclude-packages';

A function that receive an array of packages name to exclude from node modules and return a regex of it.  
For example:

```js live
() => {
  const packagesToTransform = [
    'lit',
    '@lit',
    'testing-library__dom',
    '@open-wc',
    'lit-html',
    'lit-element',
    'pure-lit',
    'lit-element-state-decoupler',
  ];
  return nodeModulesExcludePackages({ packages: packagesToTransform });
};
```
