import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { workspaceConfig } from './files/workspace-config';
import { readme } from './files/readme-file';
import { gitIgnore } from './files/git-ignore';

export const reactWorkspaceTemplate: ComponentTemplate = {
  name: 'react-workspace',
  description: 'create a new React project',
  generateFiles: (context: ComponentContext) => {
    return [
      {
        relativePath: 'workspace.jsonc',
        content: workspaceConfig(context),
      },
      {
        relativePath: `.gitignore`,
        content: gitIgnore(),
      },
      {
        relativePath: `README.md`,
        content: readme(),
      },
    ];
  },
};
