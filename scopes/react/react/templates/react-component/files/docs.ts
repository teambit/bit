import { ComponentContext } from '@teambit/generator';

export const docsFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}.docs.mdx`,
    content: `---
description: A ${Name} component.
---

import { ${Name} } from './${name}';

A component that does something special and renders text in a div.

### Component usage
\`\`\`js
<${Name}>Hello world!</${Name}>
\`\`\`

### Render hello world!

\`\`\`js live
<${Name}>Hello world!</${Name}>
\`\`\`
`,
  };
};
