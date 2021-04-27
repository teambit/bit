import { ComponentContext } from '@teambit/generator';

export const docsFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}.docs.mdx`,
    content: `---
labels: ['angular', 'typescript', '${name}']
description: 'A \`${name}\` component.'
---

import { ${Name}Component } from './${name}.component';

${Name} example:

A simple \`${name}\` component with some text

Code Snippet:
\`\`\`js
<${name} text="hello from ${Name}" />
\`\`\`


Live Playground:
\`\`\`js live
<${name} text="hello from ${Name}" />
\`\`\`
`,
  };
};
