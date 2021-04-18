import { ComponentContext } from '@teambit/generator';

export const docsFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

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
() => {
  const [count, setCount] = useState(0);
  return (
    <>
      <h1>The number is {count}</h1>
      <button onClick={() => setCount(count + 1)}>increment</button>
    </>
  );
};
\`\`\`
`,
  };
};
