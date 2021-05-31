---
title: Babel compiler
labels: ['compiler', 'babel', 'node']
description: Babel compiler wrapper.
---

import JSONFormatter from 'json-formatter-js';
import { transpileFileContent } from './babel-compiler';

The babel compiler enable transpile file content or file in the FS using babel compiler.
It also support helper method for getting the dist file name or path.

```js
import something from './my-module';

async function myFunc() {
  console.log('hello');
}
```

### transpileFileContent example

The compiler transpiles the content. It returns an object with the transpiled output content and output path (for the file and for the source map file).

```js live
() => {
  const input = `import something from './my-module';

  async function myFunc(){
    console.log('hello');
  }`;
  const result = transpileFileContent(input, {
    rootDir: '/tmp/root-dir',
    filePath: 'my-file.js',
  });
  const dataContent = new JSONFormatter(result, 2);
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
