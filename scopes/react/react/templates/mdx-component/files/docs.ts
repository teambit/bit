import { ComponentContext } from '@teambit/generator';

export const docsFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}.docs.mdx`,
    content: `---
labels: ['react', 'MDX', '${Name}']
description: 'An MDX component.'
---

import { ${Name} } from './index';

${Name}:

An MDX component rendering some markdown

Code Snippet:
\`\`\`js
<${Name} />
\`\`\`
`,
  };
};
