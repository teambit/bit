interface VendorConfig {
  directory: string;
}

export interface WorkspaceExtConfig {
  /**
   * name of the workspace.
   */
  name: string;

  /**
   * path to icon.
   */
  icon: string;

  /**
   * set the default scope when there is no matching for the component in the components array.
   */
  defaultScope: string;

  /**
   * set the default directory when there is no matching for the component in the components array.
   */
  defaultDirectory: string;

  /**
   * sets the location of the root components directory.
   * The location is a relative path to the workspace root and should use linux path separators (/).
   */
  rootComponentsDirectory?: string;

  /**
   * set the default structure of components in your project
   */
  vendor: VendorConfig;

  /**
   * All component extensions applied by default on all components in the workspace (except vendor components)
   */
  extensions: { [extensionsId: string]: string };

  /**
   * If set to
   * `true`, it allows the workspace to resolve scope's aspects from node modules
   * installed in the workspace's `node_modules` directory. If not set or set to `false`, aspects will only be resolved
   * from the scope aspects capsule.
   */
  resolveAspectsFromNodeModules?: boolean;

  /**
   * If set to `true`, it allows the workspace to resolve envs from node modules
   * installed in the workspace's `node_modules` directory.
   * the envs will be resolved from the node_modules of the env's root (workspace/node_modules/.bit_roots/{envId})
   * and if not found (usually when the env was hoisted to the root node_modules) then from the node_modules of the
   * workspace.
   * If not set or set to `false`, envs will only be resolved from the scope envs capsule.
   */
  resolveEnvsFromRoots?: boolean;

  /**
   * If set to `true`, bit will try to load aspects dependencies automatically.
   * even if the aspects dependencies are not configured in the workspace.jsonc root config.
   * for example having the aspect
   * main aspect
   * export class MainAspectMain {
   *  ...
   *   static dependencies = [MyDepAspect];
   * }
   * and the in the workspace.jsonc file:
   * {
   *  ...
   *   main-aspect: {}
   * }
   * when set to true, bit will try to load MyDepAspect automatically.
   */
  autoLoadAspectsDeps?: boolean;

  /**
   * If set to `true`, enables external package manager mode. When enabled:
   * - resolveAspectsFromNodeModules will be set to false
   * - resolveEnvsFromRoots will be set to false
   * - enableWorkspaceConfigWrite will be set to false
   * - bit install will throw an error suggesting to use external package manager
   * - commands with -x flag will skip dependency installation by default
   */
  externalPackageManager?: boolean;
}
