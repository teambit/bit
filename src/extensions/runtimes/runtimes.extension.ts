import { Slot, SlotRegistry } from '@teambit/harmony';
import { RuntimeDefinition } from './runtime';

export type RuntimeSlot = SlotRegistry<RuntimeDefinition>;

export class RuntimeExtension {
  constructor(private runtimeSlot: RuntimeSlot) {}

  /**
   * register a new runtime.
   */
  register(runtime: RuntimeDefinition) {
    this.runtimeSlot.register(runtime);
  }

  static id = '@teambit/';

  static slots = [Slot.withType<RuntimeDefinition>()];

  static async provider(deps, config, [runtimeSlot]: [RuntimeSlot]) {
    return new RuntimeExtension(runtimeSlot);
  }
}
