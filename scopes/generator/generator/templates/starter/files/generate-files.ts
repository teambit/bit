export function generateFiles() {
  return `import { WorkspaceContext, WorkspaceFile } from '@teambit/generator';
  import { workspaceConfig } from './workspace-config';
  import { gitIgnore } from './git-ignore';
  
  export async function generateFiles(
    context: WorkspaceContext,
  ): Promise<WorkspaceFile[]> {
    const files: WorkspaceFile[] = [
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
  }
  
`;
}
