---
title: MDX Compiler
labels: ['compiler', 'mdx', 'node']
description: Bit MDX format compiler.
---

import JSONFormatter from 'json-formatter-js';
import { compileSync, compile } from './mdx-compiler';

The MDX compiler enables the compilation of Bit-flavoured MDX files. That includes parsing-out and removing Bit's frontmatter properties (which are part of the Bit flavored MDX) from the output code.
In addition to that, the MDX compiler creates a React context provider that wraps the entire JSX tree (produced by the MDX file) to make all imported modules available to be used by all instances of the live playground.
This is an example of Bit flavoured MDX:

```md
---
displayName: Simple component
description: This is a very simple component description.
labels: ['first', 'component']
---

import { compileSync } from './mdx-compiler';

# A markdown title

This is a Bit flavoured MDX file.
```

### compileSync example

The compiler transpiles the MDX to JSX. It returns an object with the transpiled output.
Set the `bitFlavour` to `true` to have the transpiled output wrapped with a React Provider that makes all imported modules available for the live playground components.

```js live
() => {
  const mdxInput = `
  ---
  title: MDX Compiler
  labels: ['compiler', 'mdx', 'node']
  description: Bit MDX format compiler.
  ---

  import { compileSync } from './mdx-compiler';

  The MDX compiler enables the compilation of Bit-flavoured MDX files. That includes parsing-out and removing Bit's frontmatter properties (which are part of the Bit flavored MDX) from the output code.
  In addition to that, the MDX compiler creates a React context provider that wraps the entire JSX tree (produced by the MDX file) to make all imported modules available to be used by all instances of the live playground.
  This is an example of Bit flavoured MDX:

  # A markdown title
  `;
  const result = compileSync(mdxInput, {
    bitFlavour: true,
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

### async compile example

The compile function can also be used asynchronously.

```js
async function foo() {
  const mdxInput = `
  ---
  title: MDX Compiler
  labels: ['compiler', 'mdx', 'node']
  description: Bit MDX format compiler.
  ---

  import { compile } from './mdx-compiler';

  The MDX compiler enables the compilation of Bit-flavoured MDX files. That includes parsing-out and removing Bit's frontmatter properties (which are part of the Bit flavored MDX) from the output code.
  In addition to that, the MDX compiler creates a React context provider that wraps the entire JSX tree (produced by the MDX file) to make all imported modules available to be used by all instances of the live playground.
  This is an example of Bit flavoured MDX:

  # A markdown title
  `;
  const result = await compile(mdxInput, {
    bitFlavour: true,
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
}
```
