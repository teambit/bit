import { GeneratorContext } from '@teambit/generator';

export const docsFile = (context: GeneratorContext) => {
  const { componentName: name, componentNameCamelCase: Name } = context;

  return {
    relativePath: `${name}.docs.mdx`,
    content: `---
labels: ['react', 'jsx', '${name}']
description: 'A ${Name} component.'
---

import { ${Name} } from './${name}';

${Name} example:

A simple ${Name} component with some text

Code Snippet:
\`\`\`js
<${Name}>click me</${Name}>
\`\`\`


Live Playground:
\`\`\`js live
<${Name}>click me</${Name}>
\`\`\`
`,
  };
};
