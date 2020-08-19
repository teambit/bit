import { SlotRegistry, Harmony } from '@teambit/harmony';
import { AspectAspect } from './aspect.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { ReactAspect, ReactMain } from '../react';
import { EnvsMain, EnvsAspect } from '../environments';
import { AspectEnv } from './aspect.env';

export class AspectMain {
  static runtime = MainRuntime;
  static dependencies = [ReactAspect, EnvsAspect];

  static async provider([react, envs]: [ReactMain, EnvsMain]) {
    const env = envs.compose(new AspectEnv(react.reactEnv), react.reactEnv);
    envs.registerEnv(env);
    return new AspectMain();
  }
}

AspectAspect.addRuntime(AspectMain);
