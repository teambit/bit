import { GeneratorContext } from '@teambit/generator';

export const docsFile = (context: GeneratorContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}.docs.mdx`,
    content: `---
labels: ['react', 'typescript', '${name}']
description: 'A ${Name} component.'
---

import { ${Name} } from './${name}';

${Name} example:

A simple ${Name} component with some text

Code Snippet:
\`\`\`js
<${Name} text="hello from ${Name}" />
\`\`\`


Live Playground:
\`\`\`js live
<${Name} text="hello from ${Name}" />
\`\`\`
`,
  };
};
