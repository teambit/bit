import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
import { generateFiles as generateCommonFiles } from '../workspace-common';

export const reactWorkspaceTemplate: WorkspaceTemplate = {
  name: 'react',
  description: 'React workspace with demo components',
  generateFiles: async (context: WorkspaceContext) => {
    return generateCommonFiles(context);
  },
  fork: () => {
    return [
      // {
      //   id: 'teambit.react/templates/envs/my-react',
      //   targetName: 'envs/my-react',
      //   path: 'demo/envs/my-react',
      // },
      // { id: 'teambit.react/templates/ui/text', targetName: 'ui/text', path: 'demo/ui/text' },
      // { id: 'teambit.react/templates/ui/heading', targetName: 'ui/heading', path: 'demo/ui/heading' },
      // { id: 'teambit.react/templates/ui/card', targetName: 'ui/card', path: 'demo/ui/card' },
      // {
      //   id: 'teambit.react/templates/pages/welcome',
      //   targetName: 'pages/welcome',
      //   path: 'demo/pages/welcome',
      // },
    ];
  },
};
