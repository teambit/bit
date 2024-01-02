import { gitIgnoreTemplate } from '@teambit/git.modules.git-ignore';
import { WorkspaceContext, Starter } from '../..';
import { workspaceConfig } from './template/files/workspace-config';

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
    ];
  },
};

export default BasicWorkspaceStarter;
