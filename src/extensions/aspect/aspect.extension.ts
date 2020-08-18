import { Slot, SlotRegistry, Harmony } from '@teambit/harmony';
import { ReactExtension } from '../react';
import { Environments } from '../environments';
import { AspectEnv } from './aspect.env';
import { RuntimeDefinition, Runtimes } from './runtimes';
import { RuntimeNotDefined } from './runtimes/exceptions';

export type RuntimeSlot = SlotRegistry<RuntimeDefinition>;

export class AspectExtension {
  static id = '@teambit/aspect';

  constructor(private runtimeSlot: RuntimeSlot, private harmony: Harmony, private runtimes: Runtimes) {}

  static dependencies = [ReactExtension, Environments];

  registerRuntime(runtimeSlot: RuntimeDefinition) {
    this.runtimeSlot.register(runtimeSlot);
    return this;
  }

  applyRuntime(runtimeName: string) {
    const runtime = this.runtimes.get(runtimeName);
    if (!runtime) throw new RuntimeNotDefined(runtimeName);
    runtime.aspects;
    this.harmony.set(runtime.getAspects());
    runtime.requireAll(this.harmony.graph);
  }

  static slots = [Slot.withType<RuntimeDefinition>()];

  static async provider(
    [react, envs]: [ReactExtension, Environments],
    config,
    [runtimeSlot]: [RuntimeSlot],
    context: Harmony
  ) {
    const runtimes = await Runtimes.load(context.graph);
    const env = envs.compose(new AspectEnv(react.reactEnv), react.reactEnv);
    envs.registerEnv(env);
    return new AspectExtension(runtimeSlot, context, runtimes);
  }
}
