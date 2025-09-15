import type { EnvHandler } from '@teambit/envs';
import type { PackageGenerator } from './package-generator';

export interface PackageEnv {
  /**
   * return a PackageGenerator instance.
   */
  package(): EnvHandler<PackageGenerator>;
}
