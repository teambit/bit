import { ComponentContext } from '@teambit/generator';

export const docsFile = (context: ComponentContext) => {
  const { name, nameCamelCase: Name } = context;

  return {
    relativePath: `${name}.docs.mdx`,
    content: `---
labels: ['react', 'hooks', 'typescript', '${name}']
description: 'A ${Name} Hook component.'
---

import { ${Name} } from './${name}';
import useState from 'react';

${Name} example:

A simple ${Name} Hook to increment a count by 1



Code Snippet:

\`\`\`js
import { ${Name} } from './${name}';
...
const { count, increment } = ${Name}();

\`\`\`

Live Playground:

\`\`\`js live
() => {
  const { count, increment } = ${Name}();

  return (
    <>
      <h1>The count is {count}</h1>
      <button onClick={increment}>increment</button>
    </>
  );
};
\`\`\`
`,
  };
};
