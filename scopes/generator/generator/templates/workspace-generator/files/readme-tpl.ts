export function readmeTemplate() {
  return `export function readme() {
  return \`## Workspace Generator

Easily generate a new workspace with a single command.

## Registering your Workspace

Register your workspace template under the aspect environment in the variants section of the workspace.jsonc file.

\\\`\\\`\\\`json
"teambit.workspace/variants": {
    "{workspace-name}": {
      "teambit.harmony/aspect": {}
    }
  }
\\\`\\\`\\\`

## Customizing your Workspace

See the docs for more info on [Customizing your Generator](https://harmony-docs.bit.dev/extending-bit/creating-a-custom-workspace-generator)

## Using the Workspace Generator

How to use this generator locally, essentially for development purposes:

\\\`\\\`\\\`js
bit new <template-name> <workspace-name> --load-from /Users/me/path/to/this/dir --aspect <workspace-template-id>
\\\`\\\`\\\`

How to use this generator after exporting to a remote scope:

\\\`\\\`\\\`js
bit new <template-name> <workspace-name> --aspect <workspace-template-id>
\\\`\\\`\\\`
\`;
}
`;
}
