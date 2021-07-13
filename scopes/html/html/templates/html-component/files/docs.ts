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

## Vanilla JS Component for rendering text

A basic div that renders some text

### Component usage
\`\`\`js
${Name}("Some basic composition text");
\`\`\`
This outputs html as a string, which you can convert to a dom fragment, which can then be placed directly on the dom,
using our helper function [RenderTemplate](https://bit.dev/teambit/html/modules/render-template)

### Using props to customize the text

Modify the text to see it change live:
\`\`\`js live
${Name}("Some basic composition text");
\`\`\`
`,
  };
};
