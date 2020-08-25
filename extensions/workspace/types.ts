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
}
