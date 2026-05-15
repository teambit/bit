// Minimal Harmony with lazy resolve().
// - `manifests` map holds Aspect declarations; tiny and cheap to register.
// - `instances` map holds resolved provider results.
// - `loading` map deduplicates concurrent resolves of the same aspect.

import { AsyncLocalStorage } from 'async_hooks';
import { Aspect } from './aspect';
import { SLOT_INDEX } from './slot-index.generated';

// Each provider invocation runs inside its own ALS context carrying the
// invoking aspect's id. Slot register-fns read this so concurrent
// `_doResolve` calls (Promise.all over deps) don't clobber each other's
// slot keys.
const currentAspectStore = new AsyncLocalStorage<string>();

export interface RuntimeClass {
  id: string;
  dependencies?: Aspect[];
  slots?: any[];
  provider: (
    deps: any[],
    config: any,
    slots: any[],
    harmony: Harmony,
  ) => Promise<any> | any;
}

export class Slot<T> {
  private values: Map<string, T> = new Map();
  register(value: T): void {
    // In a real implementation, we'd need to know which aspect is registering
    // to keep the map key. For now, we use a simple counter or similar.
    this.values.set(Math.random().toString(), value);
  }
  toArray(): [string, T][] {
    return Array.from(this.values.entries());
  }
  values_(): T[] {
    return Array.from(this.values.values());
  }
}

const traceEnabled = process.env.BIT_TRACE_ASPECT_LOAD === '1';
const traceStart = Date.now();
function trace(event: string): void {
  if (!traceEnabled) return;
  const dt = Date.now() - traceStart;
  process.stderr.write(`[trace +${dt}ms] ${event}\n`);
}

// Minimal shim matching @teambit/harmony/config/config.ts so providers that
// read `harmony.config.raw.get(...)` keep working under lazy resolve.
class LazyConfig {
  readonly raw: Map<string, any>;
  constructor(entries: Record<string, any> = {}) {
    this.raw = new Map(Object.entries(entries));
  }
  toObject(): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [k, v] of this.raw) out[k] = v;
    return out;
  }
  get(id: string): any {
    return this.raw.get(id);
  }
  set(id: string, value: any): void {
    this.raw.set(id, value);
  }
  static from(raw: Record<string, any>): LazyConfig {
    return new LazyConfig(raw);
  }
}

export class Harmony {
  readonly runtimeName: string;
  readonly config: LazyConfig;
  readonly manifests: Map<string, Aspect>;
  readonly instances: Map<string, any>;
  readonly loading: Map<string, Promise<any>>;
  readonly slots: Map<string, Slot<any>>;
  // The aspect id whose provider is currently being invoked. Read by
  // SlotRegistry.registerFn (built from legacy `Slot.withType<T>()`) to key
  // entries by aspect.
  current: string | null = null;

  constructor(runtimeName: string, config?: Record<string, any> | LazyConfig) {
    this.runtimeName = runtimeName;
    this.config = config instanceof LazyConfig ? config : new LazyConfig(config || {});
    this.manifests = new Map();
    this.instances = new Map();
    this.loading = new Map();
    this.slots = new Map();
  }

  // `roots` are resolved immediately. `manifests` are just registered (cheap)
  // so they can be discovered later by lazy dispatch.
  static async load(
    rootAspects: Aspect[],
    runtimeName: string = 'main',
    config: Record<string, unknown> = {},
    manifestOnly: Aspect[] = [],
  ): Promise<Harmony> {
    const h = new Harmony(runtimeName, config);
    for (const a of [...rootAspects, ...manifestOnly]) h.registerManifestTransitive(a);
    await Promise.all(rootAspects.map((a) => h.resolve(a.id)));
    return h;
  }

  registerManifestTransitive(aspect: Aspect): void {
    if (this.manifests.has(aspect.id)) return;
    this.manifests.set(aspect.id, aspect);
    for (const dep of aspect.dependencies as Aspect[]) this.registerManifestTransitive(dep);
  }

  // The hot path: dynamic-import the runtime module, register its declared deps,
  // resolve them in parallel, then run provider().
  async resolve(aspectId: string): Promise<unknown> {
    if (this.instances.has(aspectId)) return this.instances.get(aspectId);
    if (this.loading.has(aspectId)) return this.loading.get(aspectId);
    const p = this._doResolve(aspectId);
    this.loading.set(aspectId, p);
    return p;
  }

  private async _doResolve(aspectId: string): Promise<unknown> {
    const aspect = this.manifests.get(aspectId);
    if (!aspect) throw new Error(`Unknown aspect: ${aspectId}`);
    // Some aspects only declare e.g. a `ui` runtime and appear in main-runtime
    // dependency lists purely as manifests. Treat the absence of a runtime
    // loader for the current runtime as "no instance" rather than an error —
    // the same way the legacy harmony loader silently skipped such aspects.
    const loader = aspect.runtimes?.[this.runtimeName];
    if (!loader) {
      this.instances.set(aspectId, undefined);
      return undefined;
    }

    const t0 = Date.now();
    const mod = await loader();
    const importMs = Date.now() - t0;

    const runtimeClass = pickRuntimeExport(mod);
    if (!runtimeClass) throw new Error(`No runtime export with .provider in ${aspectId}`);

    // Lazy manifest discovery: runtime classes can reference aspects whose manifests
    // weren't registered via the root closure.
    for (const depAspect of runtimeClass.dependencies || []) {
      this.registerManifestTransitive(depAspect);
    }

    const deps = await Promise.all(
      (runtimeClass.dependencies || []).map((d) => this.resolve(d.id)),
    );

    // `runtimeClass.slots` is a list of legacy `Slot.withType<T>()` providers —
    // each is a function `(registerFn) => SlotRegistry<T>`. The registerFn
    // reads `currentAspectStore` so writes from inside any aspect's provider
    // get keyed by THAT aspect, not by this slot's owner.
    const slotInstances = (runtimeClass.slots || []).map((slotProvider: any) => {
      if (typeof slotProvider === 'function') {
        return slotProvider(() => currentAspectStore.getStore() ?? this.current ?? aspectId);
      }
      // Fallback for the previous experimental shape (slot defs with a `.type`).
      const type = slotProvider?.type;
      return type ? this.getSlot(type) : undefined;
    });

    const t1 = Date.now();
    const instance = await currentAspectStore.run(aspectId, async () => {
      // Also keep `this.current` updated for legacy callers (e.g. graph code
      // that reads `harmony.current` synchronously). ALS is the source of
      // truth for concurrent provider isolation.
      const prev = this.current;
      this.current = aspectId;
      try {
        return await runtimeClass.provider(deps, this.config.get(aspectId) ?? {}, slotInstances, this);
      } finally {
        this.current = prev;
      }
    });
    const providerMs = Date.now() - t1;

    trace(`load ${aspectId} (import: ${importMs}ms, provider: ${providerMs}ms)`);
    this.instances.set(aspectId, instance);
    return instance;
  }

  get<T = unknown>(aspectId: string): T {
    if (!this.instances.has(aspectId)) {
      throw new Error(`Aspect ${aspectId} not resolved. Use await harmony.resolve(id).`);
    }
    return this.instances.get(aspectId) as T;
  }

  getSlot<T>(type: string): Slot<T> {
    if (!this.slots.has(type)) {
      this.slots.set(type, new Slot<T>());
    }
    return this.slots.get(type) as Slot<T>;
  }

  // ── Legacy @teambit/harmony compatibility shims ─────────────────────────
  // Older callers (aspect-loader, workspace-aspects-loader, load-aspect)
  // expect the eager Harmony API. Keep these thin so the surface stays the
  // same while the underlying model is lazy.

  // Legacy `harmony.extensionsIds` — list of registered aspect ids.
  get extensionsIds(): string[] {
    return Array.from(this.manifests.keys());
  }

  // Legacy `harmony.extensions.get(id)?.loaded` lookup.
  get extensions(): { get(id: string): { loaded: boolean } | undefined } {
    const instances = this.instances;
    const manifests = this.manifests;
    return {
      get(id: string) {
        if (!manifests.has(id)) return undefined;
        return { loaded: instances.has(id) };
      },
    };
  }

  // Legacy `harmony.load(manifests)` — register more aspects at runtime and
  // resolve them (the legacy variant ran their providers immediately).
  async load(aspects: Aspect[]): Promise<void> {
    for (const a of aspects) this.registerManifestTransitive(a);
    await Promise.all(aspects.map((a) => this.resolve(a.id)));
  }

  // Legacy `harmony.run(requireFn?)` — eagerly drove the full graph load
  // through a user-supplied require callback. With native `import()` thunks
  // on each aspect, there's nothing to drive — `load(roots)` already resolved
  // them transitively. Kept as a no-op so existing call sites keep working.
  async run(_requireFn?: unknown): Promise<void> {
    // intentionally empty — lazy resolve handles this on demand
  }

  async loadExternalAspect(manifestPath: string): Promise<unknown> {
    trace(`loading external aspect from ${manifestPath}`);
    const aspectMod = await import(manifestPath);
    const aspect = pickAspectExport(aspectMod);
    if (!aspect) throw new Error(`No Aspect export found in ${manifestPath}`);

    this.registerManifestTransitive(aspect);
    return this.resolve(aspect.id);
  }
}

export function pickAspectExport(mod: any): Aspect | null {
  if (mod.default instanceof Aspect) return mod.default;
  for (const key of Object.keys(mod)) {
    if (mod[key] instanceof Aspect) return mod[key];
  }
  return null;
}

export function pickRuntimeExport(mod: Record<string, unknown>): RuntimeClass | null {
  for (const key of Object.keys(mod)) {
    const v = mod[key] as { provider?: unknown } | undefined;
    if (!v) continue;
    // Accept either a class with a static `provider` (the common form,
    // e.g. `StatusMain`) or a plain object with a `provider` (e.g. `BitMain`).
    if ((typeof v === 'function' || typeof v === 'object') && typeof v.provider === 'function') {
      return v as unknown as RuntimeClass;
    }
  }
  return null;
}
