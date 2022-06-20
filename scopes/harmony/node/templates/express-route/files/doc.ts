import { ComponentContext } from '@teambit/generator';

export function docFile(context: ComponentContext) {
  return {
    relativePath: `${context.name}.docs.mdx`,
    content: `---
labels: ['express', 'node', 'route']
description: 'An express route'
---

API:

\`\`\`ts
function get${context.namePascalCase}Route()
\`\`\`
`,
  };
}
