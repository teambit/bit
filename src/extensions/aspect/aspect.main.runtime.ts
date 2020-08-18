import { SlotRegistry, Harmony } from '@teambit/harmony';
import { ReactExtension } from '../react';
import { Environments } from '../environments';
import { AspectEnv } from './aspect.env';

export type RuntimeSlot = SlotRegistry<RuntimeDefinition>;

export class AspectExtension {
  static id = '@teambit/aspect';

  constructor(private runtimeSlot: RuntimeSlot, private harmony: Harmony, private runtimes: Runtimes) {}

  static dependencies = [ReactExtension, Environments];

  static async provider(
    [react, envs]: [ReactExtension, Environments],
    config,
    [runtimeSlot]: [RuntimeSlot],
    context: Harmony
  ) {
    const env = envs.compose(new AspectEnv(react.reactEnv), react.reactEnv);
    envs.registerEnv(env);
    return new AspectExtension(runtimeSlot, context);
  }
}
