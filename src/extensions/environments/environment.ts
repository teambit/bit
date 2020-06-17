export interface Environment {
  [key: string]: any; // :TODO need to define an abstract type for service handlers (now using any)
  /**
   * Add properties to the components' package.json
   *
   * @memberof Environment
   */
  getPackageJsonProps?: () => Record<string, any>;
  // TODO: define this return type (dependency policy) - it's not defined since we have an
  // TODO: issue because it's defined in deps-resolver which use envs
  dependencies?: () => any;
}
