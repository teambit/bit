// TODO: think about a better name?
/**
 * A concrete service such as concrete compiler (typescipr / babel) or concrete tester (like jest)
 *
 * @export
 * @interface ConcreteService
 */
export interface ConcreteService {
  /**
   * Add properties to the components' package.json
   *
   * @memberof Service
   */
  getPackageJsonProps?: () => Record<string, any>;
  // TODO: define this return type (dependency policy) - it's not defined since we have an
  // TODO: issue because it's defined in deps-resolver which use envs
  dependencies?: () => any;
}
