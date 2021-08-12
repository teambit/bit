import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
import { workspaceConfig } from './files/workspace-config';
import { readme } from './files/readme-file';
import { gitIgnore } from '../common-files/git-ignore';
import { assetTypes } from '../common-files/types/asset';
import { styleTypes } from '../common-files/types/style';

export const reactWorkspaceAppTemplate: WorkspaceTemplate = {
  name: 'react-app',
  description: 'EXPERIMENTAL. react workspace for an app',
  hidden: true,
  generateFiles: async (context: WorkspaceContext) => {
    return [
      {
        relativePath: 'workspace.jsonc',
        content: await workspaceConfig(context),
      },
      {
        relativePath: `.gitignore`,
        content: gitIgnore(),
      },
      {
        relativePath: `README.md`,
        content: readme(),
      },
      {
        relativePath: `types/asset.d.ts`,
        content: assetTypes,
      },
      {
        relativePath: `types/style.d.ts`,
        content: styleTypes,
      },
    ];
  },
  importComponents: () => {
    return [
      { id: 'teambit.react/templates/apps/my-app', path: 'demo/apps/my-app', targetName: 'demo/apps/my-app' },
      { id: 'teambit.react/templates/envs/my-react', path: 'demo/envs/my-react', targetName: 'demo/envs/my-react' },
      { id: 'teambit.react/templates/themes/theme', path: 'demo/themes/theme', targetName: 'demo/themes/theme' },
      { id: 'teambit.react/templates/styles/colors', path: 'demo/styles/colors', targetName: 'demo/styles/colors' },
      { id: 'teambit.react/templates/ui/heading', path: 'demo/ui/heading', targetName: 'demo/ui/heading' },
    ];
  },
};
