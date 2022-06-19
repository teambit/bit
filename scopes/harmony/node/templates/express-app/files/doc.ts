import { ComponentContext } from '@teambit/generator';

export function docFile({ name, componentId }: ComponentContext) {
  return {
    relativePath: `${name}.docs.mdx`,
    content: `---
labels: ['express', 'node', 'service', 'app']
description: 'A general purpose bit express application'
---

Configure the app plugin on your workspace:

\`\`\`json
"${componentId.toString()}": {},
\`\`\`

### Run the application

You can run your application on a separate port to see it outside of the Bit workspace

\`\`\`bash
bit run ${name}
\`\`\`
`,
  };
}
