import { EnvsMain, EnvsAspect } from '@teambit/environments';
import { MainRuntime } from '@teambit/cli';
import { ReactAspect, ReactMain } from '@teambit/react';
import { AspectEnv } from './aspect.env';
import { AspectAspect } from './aspect.aspect';

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
