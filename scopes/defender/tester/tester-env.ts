import type { EnvHandler } from '@teambit/envs';
import type { Tester } from './tester';

export interface TesterEnv {
  tester(): EnvHandler<Tester>;
}
