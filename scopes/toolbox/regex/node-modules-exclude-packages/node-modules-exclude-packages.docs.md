---
labels: ['typescript', 'utils', 'packages', 'node modules', 'node', 'regex']
description: 'Create node modules regex with packages.'
---

import { nodeModulesExcludePackages } from './node-modules-exclude-packages';

A function that receive an array of packages name to catch in node modules and return a regex of it.  
The returned regex can be used in Jest `transformIgnorePatterns` to ignore specific packages.

For example:

```js live
() => {
  const packagesToTransform = ['react', '@myorg', 'testing-library__dom'];
  return nodeModulesExcludePackages({ packages: packagesToTransform });
};
```
