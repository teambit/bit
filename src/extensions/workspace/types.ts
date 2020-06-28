interface ComponentScopeDir {
  defaultScope: string;
  directory: string;
}

export interface WorkspaceExtConfig {
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
  components: ComponentScopeDir[];

  /**
   * name of the workspace.
   */
  name: string;
}
