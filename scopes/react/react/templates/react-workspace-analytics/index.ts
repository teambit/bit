import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
import { generateFiles as generateCommonFiles } from '../workspace-common';

export const reactWorkspaceAnalyticsTemplate: WorkspaceTemplate = {
  name: 'react-analytics',
  description: 'React workspace with components for an Analytics Application',
  generateFiles: async (context: WorkspaceContext) => {
    return generateCommonFiles(context);
  },
  fork: () => {
    return [
      {
        id: 'teambit.analytics/examples/dashboard',
        targetName: 'examples/dashboard',
        path: 'examples/dashboard',
      },
      { id: 'teambit.analytics/examples/new-users', targetName: 'examples/new-users', path: 'examples/new-users' },
      { id: 'teambit.analytics/examples/revenues', targetName: 'examples/revenues', path: 'examples/revenues' },
      {
        id: 'teambit.analytics/examples/top-frameworks',
        targetName: 'examples/top-frameworks',
        path: 'examples/top-frameworks',
      },
      {
        id: 'teambit.analytics/examples/top-members',
        targetName: 'examples/top-members',
        path: 'examples/top-members',
      },
    ];
  },
};
