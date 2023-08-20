export function generateFiles() {
  return `import { WorkspaceContext, WorkspaceFile } from '@teambit/generator';
  import { workspaceConfig } from './files/workspace-config';
  import { gitIgnore } from './files/git-ignore';
  import { launchJson } from './files/launch-json';
  
  export async function generateFiles(
    context: WorkspaceContext,
    extraConfig?: Record<string, any>
  ): Promise<WorkspaceFile[]> {
    const files: WorkspaceFile[] = [
      {
        relativePath: 'workspace.jsonc',
        content: await workspaceConfig(context, extraConfig),
      },
      {
        relativePath: '.vscode/launch.json',
        content: launchJson(context),
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
