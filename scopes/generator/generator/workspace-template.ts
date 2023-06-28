import type { Component } from '@teambit/component';
import { ComponentConfig } from './component-template';

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

  /**
   * the template the user selected to create the workspace.
   */
  template: WorkspaceTemplate;
}

export interface ForkComponentInfo {
  /**
   * full component id
   */
  id: string;

  /**
   * path where to write the component
   */
  path?: string;

  /**
   * a new component name. if not specified, use the original id (without the scope)
   */
  targetName?: string;

  /**
   * env to use for the component.
   */
  env?: string;

  /**
   * component config. gets saved in the .bitmap file and overrides the workspace.jsonc config.
   * for example, you can set the env that will be used for this component as follows:
   * "teambit.envs/envs": {
   *    "env": "teambit.harmony/aspect"
   * },
   */
  config?: ComponentConfig;
}

/**
 * @deprecated use ForkComponentInfo instead.
 */
export type ComponentToImport = ForkComponentInfo;

export interface ImportComponentInfo {
  /**
   * full component id
   */
  id: string;

  /**
   * path where to write the component
   */
  path: string;
}

export interface WorkspaceTemplate {
  /**
   * name of the workspace template. for example: `react-workspace`.
   */
  name: string;

  /**
   * name of an app created in the workspace. for example: `my-app`.
   * This will be used to instruct the user to run `bit run <appName>` in the new workspace.
   */
  appName?: string;

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
   * @deprecated use `fork()` or `import()` instead
   * this is working similarly to `fork()`
   */
  importComponents?: (context: WorkspaceContext) => ForkComponentInfo[];

  /**
   * import components into the new workspace, don't change their source code.
   */
  import?: (context: WorkspaceContext) => ImportComponentInfo[];

  /**
   * populate existing components into the new workspace and add them as new components.
   * change their source code and update the dependency names according to the new component names.
   */
  fork?: (context: WorkspaceContext) => ForkComponentInfo[];
}
