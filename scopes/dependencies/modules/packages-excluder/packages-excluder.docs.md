---
labels: ['typescript', 'utils', 'packages', 'node modules', 'node', 'regex', 'excluder']
description: 'Create node modules regex with packages.'
---

import { generateNodeModulesPattern, PatternTarget } from './generate-node-modules-pattern';

A function that returns a pattern (string) of a regex that matches any `node_modules/package-name` except the ones that we want to exclude.

> **_NOTE:_** There are different cases of patterns that need to be generated. This depends on different capture groups that might need to be applied. At the moment matching patterns based on the target are supported. Check `target` option for details.

Options:

- `packages` - **string[]** - optional. A list of package names and package scopes that we want to exclude.
- `excludeComponents` - **boolean** - optional. If set to `true`, all component packages are excluded.
- `target` - **enum** - optional. Specifies the target for which patterns need to be generated for. Default target `PatternTarget.JEST`.
  - Available pattern targets through `PatternTarget` enum:
    - `JEST`: Used in Jest `transformIgnorePatterns` options
    - `WEBPACK`: Used in Webpack `snapshot.managedPaths` options

Basic example:

```js live
() => {
  const packagesToTransform = ['react', '@myorg', 'testing-library__dom'];
  return generateNodeModulesPattern({ packages: packagesToTransform });
};
```

Basic example for `PatternTarget.WEBPACK` target:

```js live
() => {
  const packagesToTransform = ['@my-scope/my-button-component'];
  return generateNodeModulesPattern({ packages: packagesToTransform, target: PatternTarget.WEBPACK });
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

Regex exclude the package for `PatternTarget.WEBPACK` target:

```js live
() => {
  const packagesToTransform = ['@my-scope/my-button-component'];
  const patterns = generateNodeModulesPattern({ packages: packagesToTransform, target: PatternTarget.WEBPACK });
  const regexps = patterns.map((pattern) => new RegExp(pattern));
  return regexps
    .every((regex) => regex.test('Users/aUser/dev/node_modules/@my-scope/my-button-component/package.json'))
    .toString();
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

Regex not exclude the package for `PatternTarget.WEBPACK` target:

```js live
() => {
  const packagesToTransform = ['@my-scope/my-button-component'];
  const patterns = generateNodeModulesPattern({ packages: packagesToTransform, target: PatternTarget.WEBPACK });
  const regexps = patterns.map((pattern) => new RegExp(pattern));
  return regexps
    .some((regex) => regex.test('Users/aUser/dev/node_modules/not-excluded-package/package.json'))
    .toString();
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
