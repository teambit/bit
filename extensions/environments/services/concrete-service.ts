/**
 * please do not use this.
 * @deprecated
 */
export interface ConcreteService {
  getPackageJsonProps?: () => Record<string, any>;
  dependencies?: () => any;
}
