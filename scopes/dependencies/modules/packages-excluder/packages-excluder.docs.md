---
labels: ['typescript', 'utils', 'packages', 'node modules', 'node', 'regex', 'excluder']
description: 'Create node modules regex with packages.'
---

import { generateNodeModulesPattern } from './generate-node-modules-pattern';

A function that returns a pattern (string) of a regex that matches any `node_modules/package-name` except the ones that we want to exclude.

Options:

- `packages` - **string[]** - optional. A list of package names and package scopes that we want to exclude.
- `excludeComponents` - **boolean** - optional. If set to `true`, all component packages are excluded.

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

Exclude components:

```js live
() => {
  const pattern = generateNodeModulesPattern({ excludeComponents: true });
  const regex = new RegExp(pattern);
  return regex.test('node_modules/@myorg/scope.namespace.comp-name/something').toString();
};
```

Include packages:

```js live
() => {
  const pattern = generateNodeModulesPattern({ excludeComponents: true });
  const regex = new RegExp(pattern);
  return regex.test('node_modules/not-a-components/something').toString();
};
```
