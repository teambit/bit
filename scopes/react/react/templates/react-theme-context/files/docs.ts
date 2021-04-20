import { ComponentContext } from '@teambit/generator';

export const docsFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}-context.docs.mdx`,
    content: `---
description: ${Name} context.
labels: ['context']
---

import { ${Name}Context } from './${name}-context';
import { ${Name}Provider } from './${name}-context-provider';
import { MockComponent } from './${name}-context.composition';

A ${name} context.

Live Playground:

\`\`\`tsx live
() => {
  return (
    <${Name}Provider color="red">
      <MockComponent />
    </${Name}Provider>
  );
};
\`\`\`
`,
  };
};
