import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
import { generateFiles as generateCommonFiles } from '../workspace-common';

export const reactWorkspaceDataFetchingTemplate: WorkspaceTemplate = {
  name: 'react-data-fetching',
  description: 'React workspace with components to show data fetching',
  generateFiles: async (context: WorkspaceContext) => {
    return generateCommonFiles(context);
  },
  fork: () => {
    return [
      {
        id: 'learn-bit-react.data-fetching/pages/books-page',
        targetName: 'pages/books-page',
        path: 'pages/books-page',
      },
      {
        id: 'learn-bit-react.data-fetching/ui/hooks/use-books',
        targetName: 'ui/hooks/use-books',
        path: 'ui/hooks/use-books',
      },
      { id: 'learn-bit-react.data-fetching/ui/book', targetName: 'ui/book', path: 'ui/book' },
      {
        id: 'learn-bit-react.data-fetching/ui/book-list',
        targetName: 'ui/book-list',
        path: 'ui/book-list',
      },
      {
        id: 'learn-bit-react.data-fetching/models/book',
        targetName: 'models/book',
        path: 'models/book',
      },
    ];
  },
};
