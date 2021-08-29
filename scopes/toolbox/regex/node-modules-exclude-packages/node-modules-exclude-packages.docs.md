---
labels: ['typescript', 'utils', 'packages', 'node modules', 'node', 'regex']
description: 'Create node modules regex with packages.'
---

import { nodeModulesExcludePackages } from './node-modules-exclude-packages';

A function that receive an array of packages name to include with node modules regex.  
For example:

```js live
() => {
  const packagesToTransform = ['react', '@myorg', 'testing-library__dom'];
  return nodeModulesExcludePackages({ packages: packagesToTransform });
};
```
