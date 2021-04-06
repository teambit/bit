import fs from 'fs-extra';
import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { workspaceConfig } from './files/workspace-config';

export const reactEnvTemplate: ComponentTemplate = {
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
        content: fs.readFileSync('./files/.gitignore', 'utf-8'),
      },
      {
        relativePath: `README.md`,
        content: fs.readFileSync('./files/README.md', 'utf-8'),
      },
    ];
  },
};
