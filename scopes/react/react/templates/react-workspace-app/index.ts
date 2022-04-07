import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
import { generateFiles as generateCommonFiles } from '../workspace-common';

export const reactWorkspaceAppTemplate: WorkspaceTemplate = {
  name: 'react-app',
  description: 'EXPERIMENTAL. react workspace for an app',
  hidden: true,
  generateFiles: async (context: WorkspaceContext) => {
    return generateCommonFiles(context);
  },
  fork: () => {
    return [
      { id: 'teambit.react/templates/apps/my-app', path: 'apps/my-app' },
      { id: 'teambit.react/templates/envs/my-react', path: 'envs/my-react' },
      { id: 'teambit.react/templates/themes/theme', path: 'themes/theme' },
      { id: 'teambit.react/templates/styles/colors', path: 'styles/colors' },
      { id: 'teambit.react/templates/ui/heading', path: 'ui/heading' },
    ];
  },
};
