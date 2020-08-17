import { Environment } from '@teambit/environments';
import { BuildTask } from '@teambit/builder';
import { PkgExtension } from '@teambit/pkg';

/**
 * default environment for components that don't belong to any other environment
 */
export class DefaultEnv implements Environment {
  constructor(
    /**
     * pkg extension.
     */
    private pkg: PkgExtension
  ) {}
  /**
   * returns the component build pipeline.
   */
  getPipe(): BuildTask[] {
    return [this.pkg.dryRunTask];
  }
}
