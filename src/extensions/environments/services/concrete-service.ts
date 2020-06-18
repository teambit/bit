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
}
