import { PathLinux } from 'utils/path';

/**
 * in-memory represnentation of the component configuration.
 */
export default class ComponentConfig {
  constructor(readonly main: PathLinux, readonly packageDependencies: PackageDependencies) {}

  /**
   * all extensions configured on the component current head.
   */
  get extensions() {}
}
