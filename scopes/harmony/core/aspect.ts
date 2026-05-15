// Aspect manifest. Pure declarative data — safe to import eagerly.
// The heavy code lives behind the `runtimes` and `commands` thunks,
// loaded on demand.

import { Aspect as HarmonyAspect, RuntimeDefinition } from '@teambit/harmony';
import type { SlotProvider } from '@teambit/harmony';

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
      // Synthesize declareRuntime from the runtimes thunk keys when the
      // caller didn't pass one. Without it, the legacy `Harmony.load(...)
      // + harmony.run(...)` path's `Runtimes.load` finds no runtime
      // declaration on this aspect and fails with
      // `runtime: '<name>' was not defined by any aspect`.
      opts.declareRuntime ?? deriveDeclareRuntime(opts.runtimes),
      opts.files || [],
    );
    this.runtimes = opts.runtimes || {};
    this.commands = opts.commands;
  }

  static create(opts: AspectOptions): Aspect {
    return new Aspect(opts);
  }
}

function deriveDeclareRuntime(
  runtimes: Record<string, RuntimeLoader> | undefined,
): RuntimeDefinition | undefined {
  if (!runtimes) return undefined;
  const names = Object.keys(runtimes);
  if (names.length === 0) return undefined;
  // The legacy `Runtimes.load` only needs the runtime *name* to register a
  // declaration; the actual RuntimeManifest is supplied later when the
  // runtime file is `require()`d and its top-level `Aspect.addRuntime(...)`
  // fires (see e.g. `clear-cache.main.runtime.ts`). One declaration is enough
  // to unblock the lookup path.
  return new RuntimeDefinition(names[0]);
}
