import { PathLinux } from '../utils/path';
import { PackageDependencies } from './types';

/**
 * in-memory represnentation of the component configuration.
 */
export default class ComponentConfig {
  constructor(readonly main: PathLinux, readonly packageDependencies: PackageDependencies) {}

  /**
   * all extensions configured on the component current head.
   */
  get extensions() {
    // TODO: implement. - it's returning undefined because of lint doesn't allow empty getters
    return undefined;
  }
}
