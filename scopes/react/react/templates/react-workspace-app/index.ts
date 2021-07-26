import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
import { workspaceConfig } from './files/workspace-config';
import { readme } from './files/readme-file';
import { gitIgnore } from './files/git-ignore';
import { assetTypes } from '../common-files/types/asset';
import { styleTypes } from '../common-files/types/style';

export const reactWorkspaceTemplate: WorkspaceTemplate = {
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
      { id: 'teambit.react/templates/apps/my-app', path: 'apps/my-app' },
      { id: 'teambit.react/templates/envs/my-react', path: 'envs/my-react' },
      { id: 'teambit.react/templates/themes/theme', path: 'themes/theme' },
      { id: 'teambit.react/templates/styles/colors', path: 'styles/colors' },
      { id: 'teambit.react/templates/ui/heading', path: 'ui/heading' },
    ];
  },
};
