import { ComponentContext } from '@teambit/generator';

export const docsFile = (context: ComponentContext) => {
  const { name } = context;

  return {
    relativePath: `${name}.docs.mdx`,
    content: `---
description: A customised React component development environment with configurable providers
labels: ['env', 'extension', 'example', 'providers', 'context']
---

## Overview

A customised React development environment for building and rendering modular and reusable MFEs. Using this customised environment you can override 
environment configs such as tsconfig or even build tasks, as well as add wrapping contexts for the compositions of components which use this environment.

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


### Environment config
To configure the config variables (which can be used, for instance, to configure your providers including api contexts and more) add your new environment at the ***workspace level*** and
add the configuration as below.  
Note - these configuration settings apply at the workspace level, so any component using this 
environment **in this workspace** will have this config applied to the environment. This config will not persist outside of the local workspace, e.g. on bit.dev.  
To use a non-default config on bit.dev please supply a config in your \`scope.jsonc\` file (coming soon) per scope that you wish to configure. 

\`\`\`json title="workspace.json"
{
  "org-name.scope-name/namespace/s/${name}": {
    "config1": "value1" // override the config1 default value in your custom env's config 
  },
  "teambit.workspace/variants": {
    "{ui/**}": { // applies this environment for all components with ui namespace and sub-namespaces, with custom config as set in the preceding lines
      "org-name.scope-name/namespace/s/${name}": {}
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
