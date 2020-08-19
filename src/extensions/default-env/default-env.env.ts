import { Environment } from '../environments';
import { BuildTask } from '../builder';
import { PkgMain } from '../pkg';

/**
 * default environment for components that don't belong to any other environment
 */
export class DefaultEnv implements Environment {
  constructor(
    /**
     * pkg extension.
     */
    private pkg: PkgMain
  ) {}
  /**
   * returns the component build pipeline.
   */
  getPipe(): BuildTask[] {
    return [this.pkg.dryRunTask];
  }
}
