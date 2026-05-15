// Aspect manifest. Pure declarative data — safe to import eagerly.
// The heavy code lives behind the `runtimes` and `commands` thunks,
// loaded on demand.

import { Aspect as HarmonyAspect } from '@teambit/harmony';
import type { RuntimeDefinition, SlotProvider } from '@teambit/harmony';

export type RuntimeLoader = () => Promise<Record<string, unknown>>;

export type CommandsLoader = () => Promise<CommandDescriptor[]>;

export interface CommandDescriptor {
  name: string;
  aspectId: string;
  [key: string]: unknown;
}

export interface AspectOptions {
  id: string;
  dependencies?: Aspect[];
  slots?: SlotProvider<unknown>[];
  defaultConfig?: Record<string, unknown>;
  declareRuntime?: RuntimeDefinition;
  files?: string[];
  runtimes?: Record<string, RuntimeLoader>;
  commands?: CommandsLoader;
}

export class Aspect extends HarmonyAspect {
  readonly runtimes: Record<string, RuntimeLoader>;
  readonly commands?: CommandsLoader;

  constructor(opts: AspectOptions) {
    super(
      opts.id,
      opts.dependencies || [],
      opts.slots || [],
      opts.defaultConfig || {},
      opts.declareRuntime,
      opts.files || [],
    );
    this.runtimes = opts.runtimes || {};
    this.commands = opts.commands;
  }

  static create(opts: AspectOptions): Aspect {
    return new Aspect(opts);
  }
}
