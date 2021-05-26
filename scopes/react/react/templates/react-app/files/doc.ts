import { ComponentContext } from '@teambit/generator';

export function docFile({ name }: ComponentContext) {
  return `---
description: Application.
labels: ['env', 'app']
---

Application component.

To run the application use:

\`\`\`bash
bit run ${name}
\`\`\`
`;
}
