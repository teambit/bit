import type { EnvHandler } from '@teambit/envs';
import type { Compiler } from './types';

export interface CompilerEnv {
  /**
   * return a compiler instance.
   */
  compiler(): EnvHandler<Compiler>;
}
