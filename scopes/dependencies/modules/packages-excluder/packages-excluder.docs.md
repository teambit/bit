---
labels: ['typescript', 'utils', 'packages', 'node modules', 'node', 'regex', 'excluder']
description: 'Create node modules regex with packages.'
---

import { generateNodeModulesPattern } from './generate-node-modules-pattern';

A function that receives an array of packages names and returns a pattern (string) of a regex that matches any node_modules/package-name except the provided package-names.  
The returned regex can be used in Jest `transformIgnorePatterns` to ignore specific packages.

Basic example:

```js live
() => {
  const packagesToTransform = ['react', '@myorg', 'testing-library__dom'];
  return generateNodeModulesPattern({ packages: packagesToTransform });
};
```

Regex exclude the package:

```js live
() => {
  const packagesToTransform = ['react', '@myorg', 'testing-library__dom'];
  const pattern = generateNodeModulesPattern({ packages: packagesToTransform });
  const regex = new RegExp(pattern);
  return regex.test('node_modules/@myorg/something').toString();
};
```

Regex not exclude the package:

```js live
() => {
  const packagesToTransform = ['react', '@myorg', 'testing-library__dom'];
  const pattern = generateNodeModulesPattern({ packages: packagesToTransform });
  const regex = new RegExp(pattern);
  return regex.test('node_modules/not-excluded-package/something').toString();
};
```
