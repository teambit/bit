import { ComponentContext } from '@teambit/generator';

export function docFile(context: ComponentContext) {
  return {
    relativePath: `${context.name}.docs.mdx`,
    content: `---
labels: ['module']
description: 'A general purpose node module'
---

API:

\`\`\`ts
function ${context.nameCamelCase}(): string
\`\`\`
`,
  };
}
