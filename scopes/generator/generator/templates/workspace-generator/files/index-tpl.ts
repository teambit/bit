export function indexTemplate() {
  return `import { WorkspaceContext, WorkspaceTemplate } from '@teambit/generator';
import { workspaceConfig } from './files/workspace-config';
import { readme } from './files/readme-file';
import { gitIgnore } from './files/git-ignore';

export const workspaceTemplate: WorkspaceTemplate = {
  name: 'template-example',
  description: 'demonstration of a workspace template',
  generateFiles: async (context: WorkspaceContext) => [
    {
      relativePath: 'workspace.jsonc',
      content: await workspaceConfig(context),
    },
    {
      relativePath: '.gitignore',
      content: gitIgnore(),
    },
    {
      relativePath: 'README.md',
      content: readme(),
    },
  ],
  importComponents: () => [
    { id: 'teambit.react/templates/ui/text', path: 'ui/text' },
  ],
};
`;
}
