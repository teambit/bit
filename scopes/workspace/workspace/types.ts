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
   * applies only on bit.dev. configure the main owner of your workspace
   */
  defaultOwner: string;

  /**
   * set the default scope when there is no matching for the component in the components array.
   */
  defaultScope: string;

  /**
   * set the default directory when there is no matching for the component in the components array.
   */
  defaultDirectory: string;

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
}
