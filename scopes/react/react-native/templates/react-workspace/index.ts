import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
import { generateFiles as generateCommonFiles } from '../workspace-common';

export const reactWorkspaceTemplate: WorkspaceTemplate = {
  name: 'react-native',
  description: 'React workspace with demo components',
  generateFiles: async (context: WorkspaceContext) => {
    return generateCommonFiles(context);
  },
  fork: () => {
    return [
      {
        id: 'teambit.react/templates/react-native/envs/my-react-native',
        targetName: 'envs/my-react-native',
        path: 'demo/envs/my-react-native',
      },
      { id: 'teambit.react/templates/react-native/ui/text', targetName: 'ui/text', path: 'demo/ui/text' },
    ];
  },
};
