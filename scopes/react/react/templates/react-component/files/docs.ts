import { ComponentContext } from '@teambit/generator';

export const docsFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}.docs.mdx`,
    content: `---
description: 'A ${Name} component.'
labels: ['label1', 'label2', 'label3']
---

import { ${Name} } from './${name}';

## React Component for rendering text

A basic div that renders some text

### Component usage
\`\`\`js
<${Name} text="hello from ${Name}" />
\`\`\`

### Using props to customize the text

Modify the text to see it change live:
\`\`\`js live
<${Name} text="hello from ${Name}" />
\`\`\`
`,
  };
};
