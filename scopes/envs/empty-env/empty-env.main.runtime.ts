import type { EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import { MainRuntime } from '@teambit/cli';
import { EmptyEnv } from './empty-env.env';
import { EmptyEnvAspect } from './empty-env.aspect';

export class EmptyEnvMain {
  static runtime = MainRuntime;
  static dependencies = [EnvsAspect];
  static async provider([envs]: [EnvsMain]) {
    const emptyEnv = new EmptyEnv();
    envs.registerEnv(emptyEnv);
    return new EmptyEnvMain();
  }
}

EmptyEnvAspect.addRuntime(EmptyEnvMain);
