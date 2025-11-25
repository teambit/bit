import type { EnvHandler } from '@teambit/envs';
import type { Linter } from './linter';

export interface LinterEnv {
  /**
   * return a Linter instance.
   */
  linter(): EnvHandler<Linter>;
}
