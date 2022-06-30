import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
import { generateFiles as generateCommonFiles } from '../workspace-common';

export const reactWorkspaceDesignSystemTemplate: WorkspaceTemplate = {
  name: 'react-design-system',
  description: 'React workspace with components for a Design System',
  generateFiles: async (context: WorkspaceContext) => {
    return generateCommonFiles(context);
  },
  fork: () => {
    return [
      {
        id: 'teambit.design/examples/sample-app',
        targetName: 'app/sample-app',
        path: 'app/sample-app',
      },
      { id: 'teambit.design/ui/cards/card', targetName: 'ui/cards/card', path: 'ui/cards/card' },
      { id: 'teambit.design/ui/heading', targetName: 'ui/heading', path: 'ui/heading' },
      { id: 'teambit.design/themes/theme-toggler', targetName: 'themes/theme-toggler', path: 'themes/theme-toggler' },
      {
        id: 'teambit.design/themes/base-theme',
        targetName: 'themes/base-theme',
        path: 'themes/base-theme',
      },
      {
        id: 'teambit.design/themes/light-theme',
        targetName: 'themes/light-theme',
        path: 'themes/light-theme',
      },
      {
        id: 'teambit.design/themes/dark-theme',
        targetName: 'themes/dark-theme',
        path: 'themes/dark-theme',
      },
    ];
  },
};
