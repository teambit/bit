import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
import { generateFiles as generateCommonFiles } from '../workspace-common';

export const reactWorkspaceLibTemplate: WorkspaceTemplate = {
  name: 'react-lib',
  description: 'EXPERIMENTAL. react workspace for a component library',
  hidden: true,
  generateFiles: async (context: WorkspaceContext) => {
    return generateCommonFiles(context);
  },
  fork: () => {
    return [
      { id: 'teambit.react/templates/envs/my-react', targetName: 'envs/my-react', path: 'demo/envs/my-react' },
      { id: 'teambit.react/templates/ui/text', targetName: 'ui/text', path: 'demo/ui/text' },
      { id: 'teambit.react/templates/ui/heading', targetName: 'ui/heading', path: 'demo/ui/heading' },
      { id: 'teambit.react/templates/ui/card', targetName: 'ui/card', path: 'demo/ui/card' },
      { id: 'teambit.react/templates/styles/colors', targetName: 'styles/colors', path: 'demo/styles/colors' },
      { id: 'teambit.react/templates/themes/theme', targetName: 'themes/theme', path: 'demo/themes/theme' },
    ];
  },
};
