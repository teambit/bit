import { ComponentContext } from '@teambit/generator';

export const docsFile = (context: ComponentContext) => {
  const { name, nameCamelCase: Name } = context;

  return {
    relativePath: `${name}.docs.mdx`,
    content: `---
description: 'A React Hook that increments a count by 1 each time it is called.'
labels: ['hook', 'counter']
---

import { ${Name} } from './${name}';

## A React Hook to increment a count

Increments the state of \`count\` by 1 each time \`increment\` is called

### Component usage

In this example clicking the button calls \`increment\` which increments the \`count\` by 1

\`\`\`js
import { ${Name} } from './${name}';

const { count, increment } = ${Name}();

<h1>The count is {count}</h1>
<button onClick={increment}>increment</button>
\`\`\`
`,
  };
};
