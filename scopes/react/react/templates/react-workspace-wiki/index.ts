import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
import { generateFiles as generateCommonFiles } from '../workspace-common';

export const reactWorkspaceWikiTemplate: WorkspaceTemplate = {
  name: 'react-wiki',
  description: 'React workspace with components for a Wiki',
  hidden: true,
  generateFiles: async (context: WorkspaceContext) => {
    return generateCommonFiles(context);
  },
  fork: () => {
    return [
      {
        id: 'teambit.wiki/apps/wiki@1.90.13',
        targetName: 'apps/wiki',
        path: 'apps/wiki',
      },
      { id: 'teambit.wiki/sections/wiki@1.90.3', targetName: 'sections/wiki', path: 'sections/wiki' },
      { id: 'teambit.wiki/blocks/header@0.0.40', targetName: 'blocks/header', path: 'blocks/header@0.0.24' },
      { id: 'teambit.wiki/blocks/footer', targetName: 'blocks/footer', path: 'blocks/footer' },
      {
        id: 'teambit.wiki/content/welcome@0.0.40',
        targetName: 'content/welcome',
        path: 'content/welcome',
      },
    ];
  },
};
