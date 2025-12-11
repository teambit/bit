import type { ComponentContext } from '../../../component-template';

export function starterFile({ namePascalCase, name }: ComponentContext) {
  return `import { WorkspaceContext, Starter } from '@teambit/generator';
  import { workspaceConfig } from './template/files/workspace-config';
  import { gitIgnore } from './template/files/git-ignore';

  export const ${namePascalCase}WorkspaceStarter: Starter = {
    name: '${name}-workspace',
    description: 'a ${name} workspace',
    generateFiles: async (context: WorkspaceContext) => {
      const files = [
        {
          relativePath: 'workspace.jsonc',
          content: await workspaceConfig(context),
        },
      ];

      if (!context.skipGit) {
        files.push({
          relativePath: '.gitignore',
          content: gitIgnore(),
        });
      }

      return files;
    },
    import: () => [
      { id: 'teambit.community/component-showcase' },
    ]
  };

  export default ${namePascalCase}WorkspaceStarter;
`;
}
