import { WorkspaceContext, Starter } from '../../';
import { workspaceConfig } from './template/files/workspace-config';
import { gitIgnore } from './template/files/git-ignore';

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
        content: gitIgnore(),
      },
    ];
  },
};

export default BasicWorkspaceStarter;
