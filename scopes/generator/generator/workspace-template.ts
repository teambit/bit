import type { Component } from '@teambit/component';
import { ComponentConfig } from './component-template';

/**
 * WorkspaceOptions describes the shared properties between command and context
 * related to workspace initialization and configuration.
 *
 * @template TAspect - Represents the data type for the aspect property.
 * @template TTemplate - Represents the data type for the template property.
 */
export interface WorkspaceOptions<TAspect = string, TTemplate = string> {
  /**
   * The name of the workspace as provided by the user (e.g., `react-app`).
   * This is also used as the directory name for the workspace.
   */
  name: string;

  /**
   * The default scope provided by the user.
   * This is set in the workspace.jsonc and is utilized for components within the workspace.
   */
  defaultScope?: string;

  /**
   * Indicates whether the user has opted to avoid creating components (typically with a `--empty` flag).
   */
  empty?: boolean;

  /**
   * Represents the aspect in the context where a remote aspect is imported (often via the `--aspect` flag).
   * This is useful for obtaining the aspect-id and other related information.
   */
  aspect?: TAspect;

  /**
   * Represents the selected template to initialize or create the workspace.
   */
  template: TTemplate;
  /**
   * Flag to check if Git repository generation should be skipped.
   */
  skipGit?: boolean;

  /**
   * Local path to the workspace template.
   * Useful during the development of a workspace-template.
   */
  loadFrom?: string;
}

export type WorkspaceContext = Omit<WorkspaceOptions<Component, WorkspaceTemplate>, 'loadFrom'>;

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

export interface ForkComponentInfo extends ImportComponentInfo {
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
  path?: string;
}

export interface WorkspaceTemplate {
  /**
   * name of the workspace starter. for example: `react-workspace`.
   */
  name: string;

  /**
   * name of an app created in the workspace. for example: `my-app`.
   * This will be used to instruct the user to run `bit run <appName>` in the new workspace.
   */
  appName?: string;

  /**
   * short description of the starter. shown in the `bit starter` command when outside of bit-workspace.
   */
  description?: string;

  /**
   * hide this starter so that it is not listed with `bit starter`
   */
  hidden?: boolean;

  /**
   * starter function for generating the template files,
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
