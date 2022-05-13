---
labels: ['typescript', 'utils', 'string', 'match', 'pattern', 'glob']
description: 'Util functions to match paths against patterns.'
---

Uses Minimatch to match paths against a list of patterns.

Example:

```js live
import { matchPatterns, splitPatterns } from '@teambit/toolbox.path.match-patterns';

const sourceFilePatterns = ['**/*.ts$', '**/*.js$', '!**/*.d.ts$'];
const { includePatterns, excludePatterns } = splitPatterns(compositionFilePattern);
const isSupportedFile = matchPatterns('some/path/file.ts', includePatterns, excludePatterns);
```
