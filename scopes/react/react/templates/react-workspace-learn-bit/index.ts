import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
import { workspaceConfig } from './files/workspace-config';
import { readme } from './files/readme-file';
import { gitIgnore } from './files/git-ignore';

export const reactWorkspaceLearnBitTemplate: WorkspaceTemplate = {
  name: 'react-learn-bit',
  description: 'EXPERIMENTAL. react workspace with learn-bit components',
  hidden: true,
  generateFiles: (context: WorkspaceContext) => {
    return [
      {
        relativePath: 'workspace.jsonc',
        content: workspaceConfig(context),
      },
      {
        relativePath: `.gitignore`,
        content: gitIgnore(),
      },
      {
        relativePath: `README.md`,
        content: readme(),
      },
    ];
  },
  importComponents: () => {
    return [
      // todo: delete. this is for testing only. it should be the correct template components
      { id: 'learn-bit-react.base-ui/ui/img-grid', path: 'learn-bit/img-grid' },
      { id: 'learn-bit-react.base-ui/ui/img', path: 'learn-bit/img' },
      { id: 'learn-bit-react.ecommerce/entity/product', path: 'learn-bit/product' },
    ];
  },
};
