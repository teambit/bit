import { ComponentContext } from '@teambit/generator';

export function docFile({ name, componentId, nameCamelCase }: ComponentContext) {
  return `---
description: ${nameCamelCase} application component.
labels: ['${name}', 'app']
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
`;
}
