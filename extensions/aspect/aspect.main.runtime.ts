import { AspectAspect } from './aspect.aspect';
import { MainRuntime } from '@teambit/cli';
import { ReactAspect, ReactMain } from '@teambit/react';
import { EnvsMain, EnvsAspect } from '@teambit/environments';
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
