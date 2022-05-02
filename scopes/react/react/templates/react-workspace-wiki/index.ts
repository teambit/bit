import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
import { generateFiles as generateCommonFiles } from '../workspace-common';

export const reactWorkspaceWikiTemplate: WorkspaceTemplate = {
  name: 'react-wiki',
  description: 'React workspace with components for a Wiki',
  generateFiles: async (context: WorkspaceContext) => {
    return generateCommonFiles(context);
  },
  fork: () => {
    return [
      {
        id: 'teambit.wiki/apps/wiki',
        targetName: 'apps/wiki',
        path: 'apps/wiki',
      },
      { id: 'teambit.wiki/sections/wiki', targetName: 'sections/wiki', path: 'sections/wiki' },
      { id: 'teambit.wiki/blocks/header', targetName: 'blocks/header', path: 'blocks/header' },
      { id: 'teambit.wiki/blocks/footer', targetName: 'blocks/footer', path: 'blocks/footer' },
      {
        id: 'teambit.wiki/content/welcome',
        targetName: 'content/welcome',
        path: 'content/welcome',
      },
    ];
  },
};
