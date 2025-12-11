import { gitIgnoreTemplate } from '@teambit/git.modules.git-ignore';
import type { WorkspaceContext, WorkspaceTemplate as Starter } from '../../workspace-template';
import { workspaceConfig } from './template/files/workspace-config';
import { packageJson } from './template/files/package-json';

export const BasicWorkspaceStarter: Starter = {
  name: 'basic',
  description: 'a basic workspace',
  generateFiles: async (context: WorkspaceContext) => {
    return [
      {
        relativePath: 'workspace.jsonc',
        content: await workspaceConfig(context),
      },
      {
        relativePath: '.gitignore',
        content: gitIgnoreTemplate(),
      },
      {
        relativePath: 'package.json',
        content: packageJson(),
      },
    ];
  },
};

export default BasicWorkspaceStarter;
