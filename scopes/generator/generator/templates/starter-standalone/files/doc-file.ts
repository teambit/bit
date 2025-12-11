import type { ComponentContext } from '../../../component-template';

export function docFile(context: ComponentContext) {
  const { name, componentId } = context;
  return `---
description: Starter for generating a ${name} workspace
labels: ['generator', 'templates', '${name}-workspace']
---

## Using the ${name} Workspace Starter

How to use this generator locally, essentially for development purposes:

\`\`\`js
bit new ${name} my-${name}-workspace --load-from /Users/me/path/to/this/dir --aspect ${componentId.toString()}
\`\`\`

How to use this generator after exporting to a remote scope:

\`\`\`js
bit new ${name} my-${name}-workspace --aspect ${componentId.toString()}
\`\`\`
`;
}
