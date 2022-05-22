import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
import { generateFiles as generateCommonFiles } from '../workspace-common';

export const reactWorkspaceBlogTemplate: WorkspaceTemplate = {
  name: 'react-blog',
  description: 'React workspace with components for a Blog',
  generateFiles: async (context: WorkspaceContext) => {
    return generateCommonFiles(context);
  },
  fork: () => {
    return [
      {
        id: 'teambit.blog/starter/starter-blog',
        targetName: 'starter/starter-blog',
        path: 'starter/starter-blog',
      },
      { id: 'teambit.blog/blog', targetName: 'blog', path: 'blog' },
      {
        id: 'teambit.blog/starter/blog-posts/post-one',
        targetName: 'blog-posts/post-one',
        path: 'blog-posts/post-one',
      },
    ];
  },
};
