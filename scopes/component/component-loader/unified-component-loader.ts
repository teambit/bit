import type { Component } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import type { Logger } from '@teambit/logger';
import type { ComponentCache, InvalidateTarget } from './component-cache';
import { ComponentNotFound } from './component-not-found';
import { getHashInputs } from './hash-inputs';
import type { HashInputContext } from './hash-inputs';
import type { LoaderHost } from './loader-host';
import type { LoadEventEmitter } from './load-events';
import { DEFAULT_PHASE, isPhaseAtLeast, PHASES, phaseRank } from './phase';
import type { Phase } from './phase';

export type GetOptions = {
  /** Highest phase to load. Defaults to `'aspects'` (full hydration, today's behaviour). */
  phase?: Phase;
};

export type GetManyOptions = GetOptions & {
  /** Maximum number of components to process in parallel within each phase. */
  concurrency?: number;
};

export type GetManyResult = {
  components: Component[];
  /** IDs that were not found anywhere. Empty if `throwOnMissing: true` (the default). */
  missing: ComponentID[];
};

export type GetManyExtraOptions = {
  /** When true (default), throw `ComponentNotFound` if any ID is missing. When false, return them in `result.missing`. */
  throwOnMissing?: boolean;
};

const DEFAULT_CONCURRENCY = 16;

/**
 * Unified component loader.
 *
 * Provides the public `get`/`getMany`/`list`/`listIds`/`invalidate` API specified
 * in `openspec/changes/rewrite-component-loading/specs/component-loading/spec.md`.
 *
 * Owns:
 *   - phased lazy hydration (callers declare the phase they need)
 *   - the single `ComponentCache` (replaces the 11+ ad-hoc caches today)
 *   - the typed progress event stream
 *
 * Delegates to `LoaderHost`:
 *   - reading `.bitmap` and config hashes (cheap)
 *   - building the harmony `Component` and progressively hydrating its phases
 *
 * The host abstraction lets this package live in `@teambit/component-loader`
 * without depending on `@teambit/workspace` (which uses this loader).
 */
export class UnifiedComponentLoader {
  constructor(
    private readonly host: LoaderHost,
    public readonly cache: ComponentCache,
    public readonly events: LoadEventEmitter,
    private readonly logger: Logger
  ) {}

  /**
   * Loads a single component up to `opts.phase` (default: `'aspects'`).
   *
   * Throws `ComponentNotFound` if the component is not present locally.
   * Callers that need network resolution must call `scope.import([id])` first
   * (or use the workspace's `getOrImport` helper).
   */
  async get(id: ComponentID, opts: GetOptions = {}): Promise<Component> {
    const result = await this.getMany([id], opts, { throwOnMissing: true });
    return result.components[0]!;
  }

  /**
   * Loads many components up to `opts.phase`. Components already in the cache
   * are returned without invoking the host. Misses are loaded in parallel
   * (bounded by `opts.concurrency`, default 16) bracketed by a single
   * `load:phase:start`/`load:phase:end` pair.
   */
  async getMany(
    ids: ComponentID[],
    opts: GetManyOptions = {},
    extra: GetManyExtraOptions = {}
  ): Promise<GetManyResult> {
    const phase = opts.phase ?? DEFAULT_PHASE;
    const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
    const throwOnMissing = extra.throwOnMissing ?? true;
    const callId = newCallId();
    const callStart = Date.now();
    this.events.emit({ kind: 'load:start', callId, ids, phase });

    const components: Component[] = [];
    const missing: ComponentID[] = [];

    try {
      // Pass 1: cache lookups. Cached components emit a `load:component`
      // event with `cached: true` immediately and skip the phase work.
      const needsLoad: ComponentID[] = [];
      for (const id of ids) {
        const lookupStart = Date.now();
        const hash = this.computeHash(id, phase);
        const cached = this.cache.get(id, phase, hash);
        if (cached) {
          components.push(cached);
          this.events.emit({
            kind: 'load:component',
            callId,
            id,
            phase,
            durationMs: Date.now() - lookupStart,
            cached: true,
          });
        } else {
          needsLoad.push(id);
        }
      }

      // Pass 2: only if any component needs work, emit phase events around
      // the load. This guarantees one phase:start/end per phase *actually
      // executed* — a fully cached call emits no phase events.
      //
      // For multi-ID batches, prefer the host's batched `loadManyAtPhase`
      // (when available) so the host can apply its own batching/concurrency
      // policy (e.g. the legacy loader's `shouldRunInParallel` gate that
      // prevents OOM during cold-cache loads).
      //
      // For single-ID loads we always go through the per-ID `loadAtPhase`.
      // Routing a 1-ID call through `loadManyAtPhase` would force the host
      // through its batch machinery, which in the workspace adapter case is
      // the legacy `componentLoader.getMany` → `getAndLoadSlotOrdered` path
      // — far heavier than the per-component `componentLoader.get` and a
      // memory-blowup risk when called recursively (e.g. aspect loading
      // calling `workspace.get` from inside a batch load).
      if (needsLoad.length) {
        const phaseStart = Date.now();
        this.events.emit({ kind: 'load:phase:start', callId, phase, ids: needsLoad });
        if (this.host.loadManyAtPhase && needsLoad.length > 1) {
          await this.loadBatchAndCache(needsLoad, phase, callId, components, missing);
        } else {
          await runWithConcurrency(needsLoad, concurrency, async (id) => {
            const component = await this.loadAndCache(id, phase, callId);
            if (component) components.push(component);
            else missing.push(id);
          });
        }
        this.events.emit({
          kind: 'load:phase:end',
          callId,
          phase,
          durationMs: Date.now() - phaseStart,
        });
      }

      if (missing.length && throwOnMissing) throw new ComponentNotFound(missing);
      return { components, missing };
    } finally {
      this.events.emit({
        kind: 'load:end',
        callId,
        durationMs: Date.now() - callStart,
        failures: missing,
      });
    }
  }

  /**
   * Loads every component in `.bitmap` up to `opts.phase`.
   * Equivalent to `getMany(this.listIds(), opts, { throwOnMissing: false })`.
   */
  async list(opts: GetManyOptions = {}): Promise<GetManyResult> {
    return this.getMany(this.listIds(), opts, { throwOnMissing: false });
  }

  /**
   * Returns the IDs of every component in `.bitmap`. Reads only the bitmap —
   * no `Component` instances are constructed and no source files are read.
   */
  listIds(): ComponentID[] {
    return this.host.listBitmapIds();
  }

  /**
   * Invalidates entries matching `target`. See `ComponentCache.invalidate`.
   * Returns the count of entries removed.
   */
  invalidate(target: InvalidateTarget): number {
    const removed = this.cache.invalidate(target);
    this.logger.debug(`UnifiedComponentLoader.invalidate: removed ${removed} entries`);
    return removed;
  }

  /**
   * Pre-populate the cache with an already-built component, used by hosts
   * that build a batch internally and need recursive lookups against the same
   * batch to short-circuit on cache hits.
   *
   * Without this, a host whose load path calls back into the workspace (e.g.
   * `workspace.loadComponentsExtensions` -> `workspace.getMany`) would
   * trigger another full host call for components the outer pass already
   * built — at minimum redundant work, at worst a recursion deadlock.
   *
   * The host calls this for each component as soon as it's safe to share
   * (typically at the end of pass 1, before any code path that might recurse
   * back through `workspace.getMany`). The component must be at or above
   * `phase` already; passing a lower-phase component will be cached and
   * served to subsequent callers, breaking the phase contract.
   */
  publish(id: ComponentID, phase: Phase, component: Component): void {
    const hash = this.computeHash(id, phase);
    this.cache.set(id, phase, component, hash);
  }

  /**
   * Phase-upgrade-on-access: ensures `component` is loaded at least up to
   * `phase`, upgrading it in place if needed. Idempotent when the component
   * is already at or above the requested phase.
   *
   * Logged at debug level when an upgrade actually fires — these logs let us
   * tune default phases per command (an unexpected upgrade indicates a
   * caller chose too low a default).
   */
  async ensurePhase(component: Component, phase: Phase): Promise<Component> {
    if (isPhaseAtLeast(component.loadedPhase as Phase, phase)) return component;
    this.logger.debug(
      `UnifiedComponentLoader.ensurePhase: upgrading ${component.id.toString()} from ${component.loadedPhase} to ${phase}`
    );
    return this.get(component.id, { phase });
  }

  // ---- internals ----

  private async loadBatchAndCache(
    ids: ComponentID[],
    phase: Phase,
    callId: string,
    components: Component[],
    missing: ComponentID[]
  ): Promise<void> {
    // We've already checked the precondition in getMany, but keep this guard
    // so refactors don't accidentally call us without a host implementation.
    if (!this.host.loadManyAtPhase) {
      throw new Error('UnifiedComponentLoader.loadBatchAndCache called but host has no loadManyAtPhase');
    }
    const batchStart = Date.now();
    const loaded = await this.host.loadManyAtPhase(ids, phase);
    // Distribute the batch's wall-clock duration evenly across components for
    // observability; per-component timing is not available from the batched
    // host call.
    const perCompDuration = Math.round((Date.now() - batchStart) / Math.max(ids.length, 1));
    for (const id of ids) {
      const component = loaded.get(id.toString());
      if (!component) {
        missing.push(id);
        continue;
      }
      if (phaseRank(component.loadedPhase as Phase) < phaseRank(phase)) {
        this.logger.warn(
          `UnifiedComponentLoader: host returned ${id.toString()} at phase "${component.loadedPhase}" but caller requested "${phase}". Treating as "${phase}".`
        );
        component.loadedPhase = phase;
      }
      const hash = this.computeHash(id, phase);
      this.cache.set(id, phase, component, hash);
      components.push(component);
      this.events.emit({
        kind: 'load:component',
        callId,
        id,
        phase,
        durationMs: perCompDuration,
        cached: false,
      });
    }
  }

  private async loadAndCache(id: ComponentID, phase: Phase, callId: string): Promise<Component | undefined> {
    const start = Date.now();
    const component = await this.host.loadAtPhase(id, phase);
    if (!component) return undefined;

    // Trust the host to set component.loadedPhase to >= phase. If the host
    // left it lower, log a warning and bump it ourselves so subsequent
    // ensurePhase() calls don't loop.
    if (phaseRank(component.loadedPhase as Phase) < phaseRank(phase)) {
      this.logger.warn(
        `UnifiedComponentLoader: host returned ${id.toString()} at phase "${component.loadedPhase}" but caller requested "${phase}". Treating as "${phase}".`
      );
      component.loadedPhase = phase;
    }

    const hash = this.computeHash(id, phase);
    this.cache.set(id, phase, component, hash);
    this.events.emit({
      kind: 'load:component',
      callId,
      id,
      phase,
      durationMs: Date.now() - start,
      cached: false,
    });
    return component;
  }

  private computeHash(id: ComponentID, phase: Phase): string {
    const ctx: HashInputContext = {
      idStr: id.toString(),
      bitmapHash: this.host.bitmapHash(),
    };
    if (phaseRank(phase) >= phaseRank('files')) {
      ctx.fileSignature = this.host.fileSignature(id);
    }
    if (phaseRank(phase) >= phaseRank('dependencies')) {
      ctx.componentConfigHash = this.host.componentConfigHash(id);
    }
    if (phaseRank(phase) >= phaseRank('extensions')) {
      ctx.workspaceConfigHash = this.host.workspaceConfigHash();
    }
    if (phaseRank(phase) >= phaseRank('aspects')) {
      ctx.aspectStateHash = this.host.aspectStateHash();
    }
    return getHashInputs(phase, ctx);
  }
}

let callIdCounter = 0;
function newCallId(): string {
  callIdCounter += 1;
  return `${Date.now().toString(36)}-${callIdCounter.toString(36)}`;
}

async function runWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  if (items.length === 0) return;
  const queue = [...items];
  const workers: Promise<void>[] = [];
  const workerCount = Math.min(concurrency, queue.length);
  for (let i = 0; i < workerCount; i += 1) {
    workers.push(
      (async () => {
        while (queue.length) {
          const item = queue.shift();
          if (item === undefined) return;
          await fn(item);
        }
      })()
    );
  }
  await Promise.all(workers);
}

// Re-exported for convenience so callers don't need to import from two places.
export { PHASES, DEFAULT_PHASE };
