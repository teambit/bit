import { ComponentContext } from '@teambit/generator';

export const docsFile = (context: ComponentContext) => {
  const { name } = context;

  return {
    relativePath: `${name}.docs.mdx`,
    content: `---
description: A customised React component development environment 
labels: ['env', 'extension', 'example']
---

## Overview

A customised React development environment for building and rendering modular and reusable MFEs. Using this customised environment you can override 
environment configs such as tsconfig or even build tasks.

### Usage instructions

Create a **variant** in project's \`workspace.json\` file.
Set this extension as the variant's environment, for instance for the variant "any components in the 'ui' namespace":

\`\`\`json
{
   "teambit.workspace/variants": {
     "{ui/**}": { // applies this environment for all components with ui namespace and sub-namespaces
       "org-name.scope-name/namespace/s/${name}": {}
     }
   }
}
\`\`\`

### Read more about Bit Environments and their customisation

Please see the following docs entries for more details on Bit Environments and customisation:
1. https://harmony-docs.bit.dev/building-with-bit/environments
1. 

### Important reminder
As with all aspects that you create, make sure to apply the \`teambit.harmony/aspect\` environment in order for this component to be built as a bit environment.

\`\`\`json
{
   "teambit.workspace/variants": {
     ...
     "extensions/${name}": { // if you put your new env inside the extensions folder. Adjust as needed for your directory structure.
       "teambit.harmony/aspect": {}
     }
     ...
   }
}
\`\`\`
`,
  };
};
