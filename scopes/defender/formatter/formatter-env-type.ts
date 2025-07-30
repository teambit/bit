import type { EnvHandler } from '@teambit/envs';
import type { Formatter } from './formatter';

export interface FormatterEnv {
  /**
   * return a Formatter instance.
   */
  formatter(): EnvHandler<Formatter>;
}
