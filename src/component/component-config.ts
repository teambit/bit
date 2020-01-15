import { PathLinux } from '../utils/path';

export type PackageDependencies = {};

/**
 * in-memory represnentation of the component configuration.
 */
export default class ComponentConfig {
  constructor(
    /**
     * version main file
     */
    readonly main: PathLinux,

    /**
     * version package dependencies.
     */
    readonly packageDependencies: PackageDependencies
  ) {}

  /**
   * all extensions configured on the component current head.
   */
  get extensions() {
    return [];
  }
}
