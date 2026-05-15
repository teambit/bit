// Minimal Harmony with lazy resolve().
// - `manifests` map holds Aspect declarations; tiny and cheap to register.
// - `instances` map holds resolved provider results.
// - `loading` map deduplicates concurrent resolves of the same aspect.

import { Aspect } from './aspect';
import { SLOT_INDEX } from './slot-index.generated';

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

export class Harmony {
  readonly runtimeName: string;
  readonly config: Record<string, unknown>;
  readonly manifests: Map<string, Aspect>;
  readonly instances: Map<string, any>;
  readonly loading: Map<string, Promise<any>>;
  readonly slots: Map<string, Slot<any>>;

  constructor(runtimeName: string, config?: Record<string, any>) {
    this.runtimeName = runtimeName;
    this.config = config || {};
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
    const loader = aspect.runtimes[this.runtimeName];
    if (!loader) throw new Error(`Aspect ${aspectId} has no ${this.runtimeName} runtime`);

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

    const slotInstances = await Promise.all(
      (runtimeClass.slots || []).map(async (slotDef: any) => {
        const type = slotDef.type; // This is a bit of a guess on the shape
        const producers = SLOT_INDEX[type] || [];
        await Promise.all(producers.map((id) => this.resolve(id)));
        return this.getSlot(type);
      }),
    );

    const t1 = Date.now();
    const instance = await runtimeClass.provider(deps, this.config[aspectId], slotInstances, this);
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
    if (typeof v === 'function' && typeof v.provider === 'function') {
      return v as unknown as RuntimeClass;
    }
  }
  return null;
}
