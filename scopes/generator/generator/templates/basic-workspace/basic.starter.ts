import { WorkspaceContext, Starter } from '@teambit/generator';
import { workspaceConfig } from './template/files/workspace-config';
import { gitIgnore } from './template/files/git-ignore';

export const BasicWorkspaceStarter: Starter = {
  name: 'basic-workspace',
  description: 'a basic workspace',
  generateFiles: async (context: WorkspaceContext) => {
    const files = [
      {
        relativePath: 'workspace.jsonc',
        content: await workspaceConfig(context),
      },
    ];

    if (!context.skipGit) {
      files.push({
        relativePath: '.gitignore',
        content: gitIgnore(),
      });
    }

    return files;
  },
  import: () => [{ id: 'teambit.community/component-showcase' }],
};

export default BasicWorkspaceStarter;
