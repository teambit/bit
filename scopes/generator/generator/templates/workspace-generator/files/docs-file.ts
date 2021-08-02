export function docsFile() {
  return `---
description: Generator for generating a workspace
labels: ['generator', 'templates', 'workspace']
---

# Customize your workspace

See the tutorial for more info on [Customizing your Generator](https://harmony-docs.bit.dev/extending-bit/creating-a-custom-workspace-generator)

How to use this generator:

\`\`\`js
bit new <template-name> <workspace-name> --aspect <workspace-template-id>
\`\`\`
`;
}
