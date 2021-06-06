export const envUsageInstructions = (name) => `
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
`;
