import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
import { parse } from 'comment-json';
import { generateFiles as generateCommonFiles } from '../workspace-common';

export const reactWorkspaceAppTemplate: WorkspaceTemplate = {
  name: 'react-app',
  description: 'EXPERIMENTAL. react workspace for an app',
  hidden: true,
  generateFiles: async (context: WorkspaceContext) => {
    if (context.defaultScope) {
      const extensions = {
        [`${context.defaultScope}/apps/my-app`]: parse(`{}`),
      };
      return generateCommonFiles(context, extensions);
    }
    return generateCommonFiles(context);
  },
  fork: () => {
    return [
      { id: 'teambit.react/templates/apps/my-app', targetName: 'apps/my-app' },
      // { id: 'teambit.react/templates/envs/my-react', targetName: 'envs/my-react' }, // TODO: uncomment when ready
      { id: 'teambit.react/templates/themes/theme', targetName: 'themes/theme' },
      { id: 'teambit.react/templates/pages/home', targetName: 'pages/home' },
    ];
  },
};
