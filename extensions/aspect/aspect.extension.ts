import { ReactExtension } from '@teambit/react';
import { Environments } from '@teambit/environments';
import { AspectEnv } from './aspect.env';

export class AspectExtension {
  static id = '@teambit/aspect';

  static dependencies = [ReactExtension, Environments];

  static async provider([react, envs]: [ReactExtension, Environments]) {
    const env = envs.compose(new AspectEnv(react.reactEnv), react.reactEnv);
    envs.registerEnv(env);
    return new AspectExtension();
  }
}
