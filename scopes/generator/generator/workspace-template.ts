import type { Component } from '@teambit/component';

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

  /**
   * default scope as entered by the user.
   * it will be set in the workspace.jsonc and be used for components
   */
  defaultScope?: string;

  /**
   * whether user entered `--empty` flag in `bit new` to avoid creating components.
   */
  empty?: boolean;

  /**
   * in case the "--aspect" flag used to import a remote aspect, this is populated with that aspect.
   * useful to get the aspect-id and other info.
   */
  aspectComponent?: Component;
}

export interface ComponentToImport {
  /**
   * full component id
   */
  id: string;

  /**
   * path where to write the component
   */
  path: string;

  /**
   * a new component name. if not specified, use the original id (without the scope)
   */
  targetName?: string;
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
  generateFiles(context: WorkspaceContext): Promise<WorkspaceFile[]>;

  /**
   * populate existing components into the new workspace and add them as new components
   */
  importComponents?: () => ComponentToImport[];
}
