import { SlotRegistry, Harmony } from '@teambit/harmony';
import { AspectAspect } from './aspect.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { ReactExtension } from '../react';
import { EnvsMain, EnvsAspect } from '../environments';
import { AspectEnv } from './aspect.env';

export type RuntimeSlot = SlotRegistry<RuntimeDefinition>;

export class AspectMain {
  static id = '@teambit/aspect';

  constructor(private runtimeSlot: RuntimeSlot, private harmony: Harmony, private runtimes: Runtimes) {}

  static runtime = MainRuntime;
  static dependencies = [ReactExtension, EnvsAspect];

  static async provider(
    [react, envs]: [ReactExtension, EnvsMain],
    config,
    [runtimeSlot]: [RuntimeSlot],
    context: Harmony
  ) {
    const env = envs.compose(new AspectEnv(react.reactEnv), react.reactEnv);
    envs.registerEnv(env);
    return new AspectMain(runtimeSlot, context);
  }
}

AspectAspect.addRuntime(AspectMain);
