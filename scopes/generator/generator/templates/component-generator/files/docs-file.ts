export function docsFile() {
  return `### Configuring your Generator

Edit your \`workspace.jsonc\` file and set this component to use the \`teambit.harmony/aspect\` env under the variants object.

\`\`\`json
"teambit.workspace/variants": {
  "{my-components}": {
    "teambit.harmony/aspect": {}
  },
}
\`\`\`

To check if your component is using the correct env you can run \`bit envs\` or \`bit show my-components\`

Edit your \`workspace.jsonc\` file and add the component id, (scope name / component name) to teambit generator. This should go at root level. The component id can be found in the \`aspect.ts\` file:

\`\`\`json
{
  "teambit.generator/generator": {
    "aspects": ["my-scope-name/my-components"]
  },
}
\`\`\`

This registers the component aspect so that your templates will appear in the CLI when you run \`bit templates\`.

### Modifying your Generator

The \`my-components.main.runtime.ts\` file contains an array of templates that you can modify and add to to create different templates and numerous files to be generated.

### Using your Generator

Use your generator to create the component files

\`\`\`bash
bit create my-components component1
\`\`\`

### Exporting your Generator

Tag and export your generator component so you can use it in any other workspace. Make sure the scope name is set correctly in the \`aspect.ts\` file before tagging and exporting. Once you have tagged and exported the component you can add it to the \`workspace.jsonc\` file in the workspace where you want to use this generator.

\`\`\`json
{
  "teambit.generator/generator": {
    "aspects": ["my-scope-name/my-components"]
  },
}
\`\`\`

Run \`bit templates\` to see your generator and then use it to generate you components.
`;
}
