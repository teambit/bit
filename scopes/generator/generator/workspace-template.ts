export interface WorkspaceFile {
  /**
   * relative path of the file within the workspace.
   */
  relativePath: string;

  /**
   * file content
   */
  content: string;
}

export interface WorkspaceContext {
  /**
   * workspace-name as entered by the user, e.g. `react-app`.
   * it is used as the directory name for the workspace.
   */
  name: string;
}

export interface WorkspaceTemplate {
  /**
   * name of the workspace template. for example: `react-workspace`.
   */
  name: string;

  /**
   * short description of the template. shown in the `bit templates` command when outside of bit-workspace.
   */
  description?: string;

  /**
   * hide this template so that it is not listed with `bit templates`
   */
  hidden?: boolean;

  /**
   * template function for generating the template files,
   */
  generateFiles(context: WorkspaceContext): WorkspaceFile[];
}
