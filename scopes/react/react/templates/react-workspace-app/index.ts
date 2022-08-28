import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
import { parse } from 'comment-json';
import { generateFiles as generateCommonFiles } from '../workspace-common';
import { DEFAULT_SCOPE_NAME } from '../workspace-common/constants';

export const reactWorkspaceAppTemplate: WorkspaceTemplate = {
  name: 'react-app',
  description: 'EXPERIMENTAL. react workspace for an app',
  hidden: true,
  generateFiles: async (context: WorkspaceContext) => {
    const scope = context.defaultScope || DEFAULT_SCOPE_NAME;
    const extensions = {
      [`${scope}/apps/my-app`]: parse(`{}`),
    };
    return generateCommonFiles(context, extensions);
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
