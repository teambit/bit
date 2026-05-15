import type { Component } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import type { InMemoryCache } from '@teambit/harmony.modules.in-memory-cache';
import { createInMemoryCache, getMaxSizeForComponents } from '@teambit/harmony.modules.in-memory-cache';
import type { Phase } from './phase';
import { PHASES } from './phase';

interface CacheEntry {
  value: Component;
  hash: string;
}

export type InvalidateTarget = ComponentID | ComponentID[] | 'all' | { phase: Phase };

/**
 * Single, unified component cache for the loader.
 *
 * Replaces the 11+ ad-hoc caches enumerated in the rewrite proposal
 * (see openspec/changes/rewrite-component-loading/audit/03-caches.md).
 *
 * Key shape: `${componentId}::${phase}`. Each entry stores a content hash
 * composed of all inputs that affect the loaded value at that phase
 * (see `hash-inputs.ts`). On every lookup the cache compares the stored
 * hash to a hash supplied by the caller; a mismatch evicts the stale
 * entry and returns undefined so the loader recomputes.
 *
 * LRU eviction and size policy are delegated to the existing
 * `LRUCacheAdapter` infrastructure, mirroring today's
 * `createInMemoryCache(maxSize: getMaxSizeForComponents())`.
 */
export class ComponentCache {
  private readonly storage: InMemoryCache<CacheEntry>;

  constructor(maxSize: number = getMaxSizeForComponents()) {
    this.storage = createInMemoryCache<CacheEntry>({ maxSize });
  }

  /**
   * Returns the cached component if and only if the stored hash equals
   * `currentHash`. A stale entry is deleted as a side effect.
   */
  get(id: ComponentID, phase: Phase, currentHash: string): Component | undefined {
    const key = makeKey(id, phase);
    const entry = this.storage.get(key);
    if (!entry) return undefined;
    if (entry.hash !== currentHash) {
      this.storage.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * Stores `component` for `(id, phase)` with the given content `hash`.
   * Evicts the least-recently-used entry if the cache is at capacity.
   */
  set(id: ComponentID, phase: Phase, component: Component, hash: string): void {
    this.storage.set(makeKey(id, phase), { value: component, hash });
  }

  has(id: ComponentID, phase: Phase): boolean {
    return this.storage.has(makeKey(id, phase));
  }

  /**
   * Invalidates entries matching `target`:
   *   - `ComponentID`             — all phases for that component
   *   - `ComponentID[]`           — all phases for each component
   *   - `'all'`                   — clears the cache
   *   - `{ phase }`               — all components at that phase
   *
   * Returns the number of entries deleted.
   */
  invalidate(target: InvalidateTarget): number {
    if (target === 'all') return this.invalidateAll();
    if (Array.isArray(target)) {
      return target.reduce((n, id) => n + this.invalidateOne(id), 0);
    }
    if (isPhaseTarget(target)) return this.invalidateByPhase(target.phase);
    return this.invalidateOne(target);
  }

  /** Number of entries currently stored. */
  size(): number {
    return this.storage.keys().length;
  }

  private invalidateAll(): number {
    const n = this.storage.keys().length;
    this.storage.deleteAll();
    return n;
  }

  private invalidateOne(id: ComponentID): number {
    const prefix = `${id.toString()}::`;
    let deleted = 0;
    for (const key of this.storage.keys()) {
      if (key.startsWith(prefix)) {
        this.storage.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  private invalidateByPhase(phase: Phase): number {
    const suffix = `::${phase}`;
    let deleted = 0;
    for (const key of this.storage.keys()) {
      if (key.endsWith(suffix)) {
        this.storage.delete(key);
        deleted++;
      }
    }
    return deleted;
  }
}

function makeKey(id: ComponentID, phase: Phase): string {
  return `${id.toString()}::${phase}`;
}

function isPhaseTarget(target: ComponentID | { phase: Phase }): target is { phase: Phase } {
  return (
    typeof (target as { phase?: unknown }).phase === 'string' && PHASES.includes((target as { phase: Phase }).phase)
  );
}
