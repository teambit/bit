export interface Environment {
  [key: string]: any; // :TODO need to define an abstract type for service handlers (now using any)
  /**
   * Add properties to the components' package.json
   *
   * @memberof Environment
   */
  getPackageJsonProps?: () => Record<string, any>;
}
