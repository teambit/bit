import { GeneratorContext } from '@teambit/generator';

export const docsFile = (context: GeneratorContext) => {
  const { componentName: name, componentNameCamelCase: Name } = context;

  return {
    relativePath: `${name}.docs.mdx`,
    content: `---
labels: ['react', 'typescript', '${name}']
description: 'A ${Name} component.'
---

import { ${Name} } from './${name}';

${Name} example:

A simple ${Name} component with some text

// live component playground - if you remove the word live it turns into a code snippet
\`\`\`js live
<${Name}>click me</${Name}>
\`\`\`
`,
  };
};
