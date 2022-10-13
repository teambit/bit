export function starterFile() {
  return `import { WorkspaceContext, Starter } from '@teambit/generator';
import { workspaceConfig } from './template/files/workspace-config';
import { readme } from './template/files/readme-file';
import { gitIgnore } from './template/files/git-ignore';

export const starter: Starter = {
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

export default starter;
`;
}
