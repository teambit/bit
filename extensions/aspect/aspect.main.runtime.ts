import { MainRuntime } from '@teambit/cli';
import { EnvsAspect, EnvsMain } from '@teambit/environments';
import { ReactAspect, ReactMain } from '@teambit/react';

import { AspectAspect } from './aspect.aspect';
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
