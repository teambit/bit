import { AspectAspect, AspectMain } from '@teambit/aspect';
import { MainRuntime } from '@teambit/cli';
import { EnvsAspect, Environment, EnvsMain, EnvTransformer } from '@teambit/envs';
import { AspectLoaderAspect, AspectLoaderMain } from '@teambit/aspect-loader';
import { EnvAspect } from './env.aspect';
import { EnvEnv } from './env.env';

export class EnvMain {
  constructor(readonly envEnv: EnvEnv, private envs: EnvsMain) {}

  /**
   * compose your own aspect environment.
   */
  compose(transformers: EnvTransformer[] = [], targetEnv: Environment = {}) {
    return this.envs.compose(this.envs.merge(targetEnv, this.envEnv), transformers);
  }

  static slots = [];
  static dependencies = [AspectAspect, EnvsAspect, AspectLoaderAspect];
  static runtime = MainRuntime;
  static async provider([aspectAspect, envs, aspectLoader]: [AspectMain, EnvsMain, AspectLoaderMain]) {
    const envEnv = aspectAspect.compose([], new EnvEnv(aspectAspect.aspectEnv, aspectLoader));

    envs.registerEnv(envEnv);
    return new EnvMain(envEnv as EnvEnv, envs);
  }
}

EnvAspect.addRuntime(EnvMain);
