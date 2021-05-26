import { ComponentContext } from '@teambit/generator';

export const docsFile = (context: ComponentContext) => {
  const { name } = context;

  return {
    relativePath: `${name}.docs.mdx`,
    content: `---
description: A standard React component development environment with configurable providers
labels: ['env', 'extension', 'example', 'providers', 'context']
---

## Overview

A standard React development environment for building and rendering modular and reusable MFEs.

### Environment config
To configure the config variables (which can be used, for instance, to configure your providers including api contexts and more) add them to the value object
of the environment when applying it for your components. See the usage instructions below for an example.

### Usage instructions

Create a **variant** in project's \`workspace.json\` file.
Set this extension as the variant's environment, for instance for the variant "any components in the 'ui' namespace":

\`\`\`json
{
   "teambit.workspace/variants": {
     "{ui/**}": { // applies this environment for all components with ui namespace and sub-namespaces
       "org-name.scope-name/namespace/s/${name}": {
         "configVar1": "value1",
         "configVar2": "value2"
       }
     }
   }
}
\`\`\`

### Theming
The environment template adds the design theme [Theme](https://bit.dev/teambit/use-case-examples/design/theme-context) to all compositions of the components that use this example env.
Apply your own theme instead to see your component compositions with your theme

### Other context providers
In the \`.preview.runtime.tsx\` file you will find a simple example of a provider, which applies a background style via a wrapping div.
This is an example for how to apply wrapping components which will surround all your components, e.g. for supplying contexts to your components as if
they were being consumed by an application.

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
