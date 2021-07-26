import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
import { workspaceConfig } from './files/workspace-config';
import { readme } from './files/readme-file';
import { gitIgnore } from '../common-files/git-ignore';
import { assetTypes } from '../common-files/types/asset';
import { styleTypes } from '../common-files/types/style';

export const reactWorkspaceTemplate: WorkspaceTemplate = {
  name: 'react',
  description: 'EXPERIMENTAL. react workspace with sample components',
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
      { id: 'teambit.react/templates/envs/my-react', path: 'envs/my-react' },
      { id: 'teambit.react/templates/ui/text', path: 'ui/text' },
      { id: 'teambit.react/templates/ui/heading', path: 'ui/heading' },
      { id: 'teambit.react/templates/ui/card', path: 'ui/card' },
      { id: 'teambit.react/templates/pages/welcome', path: 'pages/welcome' },
    ];
  },
};
