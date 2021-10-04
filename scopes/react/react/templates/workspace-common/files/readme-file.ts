export function readme() {
  return `# Welcome to your Bit Workspace

To get started straight away run \`bit start\` and open [localhost:3000](http://localhost:3000). It may take a while to build the first time you run this command as it is building the whole User Interface for your development environment.

\`\`\`bash
bit start
\`\`\`

## What's included

- **workspace.jsonc**

This is the main configuration file of your bit workspace. Here you can modify the workspace name and icon as well as default directory and scope. It is where dependencies are found when you install anything. It is also where you register aspects, bit extensions as well as apply the environments for your components. This workspace has been setup so that all components use the React env. However you can create other components and apply other envs to them such as node, html, angular and aspect envs.

- **.bitmap**

This is an auto-generated file and includes the mapping of your components. There is one component included here. In order to remove this component you can run the following command.


- **Demo Components**

A folder (unless the --empty flag was used) containing demo components are included in this workspace. These components are used to demonstrate the different features of Bit. If you would like to remove these components you can run the following command.

\`\`\`jsx
bit remove "ui/*" --delete files
\`\`\`

This removes the components from the bitmap as well as removes the files.


- **.gitignore**

Ignoring any files from version control
`;
}
