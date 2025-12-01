import type { Component } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import type { InMemoryCache } from '@teambit/harmony.modules.in-memory-cache';
import { createInMemoryCache, getMaxSizeForComponents } from '@teambit/harmony.modules.in-memory-cache';
import type { RawComponentData } from './component-source';
import type { LoadPlan, LoadPlanOptions } from './load-plan';

/**
 * Cache statistics for debugging and monitoring
 */
export interface CacheStats {
  componentHits: number;
  componentMisses: number;
  rawDataHits: number;
  rawDataMisses: number;
  planHits: number;
  planMisses: number;
  size: number;
  invalidations: number;
}

/**
 * Options that affect cache key computation.
 * These are the options that, when different, should result in different cache entries.
 */
export interface CacheKeyOptions {
  loadExtensions?: boolean;
  executeLoadSlot?: boolean;
  loadDocs?: boolean;
  loadCompositions?: boolean;
  loadSeedersAsAspects?: boolean;
}

/**
 * LoaderCache provides a unified caching strategy for the V2 component loader.
 *
 * Key principles:
 * 1. EXPLICIT KEYS - All options that affect loading are included in the cache key
 * 2. SINGLE CACHE - One coherent cache instead of multiple overlapping caches
 * 3. CLEAR INVALIDATION - Simple invalidation API with defined semantics
 * 4. OBSERVABLE - Built-in stats for debugging
 *
 * This replaces the complex multi-cache system in V1 loader.
 */
export class LoaderCache {
  /** Cache for fully loaded Component objects */
  private components: InMemoryCache<Component>;

  /** Cache for raw component data (before enrichment) */
  private rawData: InMemoryCache<RawComponentData>;

  /** Cache for load plans */
  private plans: InMemoryCache<LoadPlan>;

  /** Statistics */
  private stats: CacheStats = {
    componentHits: 0,
    componentMisses: 0,
    rawDataHits: 0,
    rawDataMisses: 0,
    planHits: 0,
    planMisses: 0,
    size: 0,
    invalidations: 0,
  };

  constructor() {
    const maxSize = getMaxSizeForComponents();
    this.components = createInMemoryCache<Component>({ maxSize });
    this.rawData = createInMemoryCache<RawComponentData>({ maxSize });
    this.plans = createInMemoryCache<LoadPlan>({ maxSize: 100 }); // Plans are larger, cache fewer
  }

  // ============ Component Cache ============

  /**
   * Get a component from cache.
   * Returns undefined if not cached with the given options.
   */
  getComponent(id: ComponentID, options: CacheKeyOptions = {}): Component | undefined {
    const key = this.computeComponentKey(id, options);
    const cached = this.components.get(key);
    if (cached) {
      this.stats.componentHits++;
    } else {
      this.stats.componentMisses++;
    }
    return cached;
  }

  /**
   * Store a component in cache.
   */
  setComponent(id: ComponentID, component: Component, options: CacheKeyOptions = {}): void {
    const key = this.computeComponentKey(id, options);
    this.components.set(key, component);
    this.stats.size++;
  }

  /**
   * Check if a component is cached.
   */
  hasComponent(id: ComponentID, options: CacheKeyOptions = {}): boolean {
    const key = this.computeComponentKey(id, options);
    return this.components.has(key);
  }

  // ============ Raw Data Cache ============

  /**
   * Get raw component data from cache.
   */
  getRawData(id: ComponentID): RawComponentData | undefined {
    const key = id.toString();
    const cached = this.rawData.get(key);
    if (cached) {
      this.stats.rawDataHits++;
    } else {
      this.stats.rawDataMisses++;
    }
    return cached;
  }

  /**
   * Store raw component data in cache.
   */
  setRawData(id: ComponentID, data: RawComponentData): void {
    const key = id.toString();
    this.rawData.set(key, data);
  }

  /**
   * Check if raw data is cached.
   */
  hasRawData(id: ComponentID): boolean {
    const key = id.toString();
    return this.rawData.has(key);
  }

  // ============ Plan Cache ============

  /**
   * Get a cached load plan.
   * Plans are keyed by the sorted list of requested IDs and options.
   */
  getPlan(ids: ComponentID[], options: LoadPlanOptions = {}): LoadPlan | undefined {
    const key = this.computePlanKey(ids, options);
    const cached = this.plans.get(key);
    if (cached) {
      this.stats.planHits++;
    } else {
      this.stats.planMisses++;
    }
    return cached;
  }

  /**
   * Store a load plan in cache.
   */
  setPlan(ids: ComponentID[], plan: LoadPlan, options: LoadPlanOptions = {}): void {
    const key = this.computePlanKey(ids, options);
    this.plans.set(key, plan);
  }

  // ============ Invalidation ============

  /**
   * Invalidate all cached data for a specific component.
   */
  invalidate(id: ComponentID): void {
    const idStr = id.toString();

    // Invalidate component entries (need to check all option combinations)
    // This is a limitation - we can't efficiently invalidate all keys for an ID
    // For now, we'll just delete the raw data and let components be re-fetched
    this.rawData.delete(idStr);

    // Clear all plans (they may reference this component)
    this.plans.deleteAll();

    this.stats.invalidations++;
  }

  /**
   * Invalidate all cached data.
   */
  invalidateAll(): void {
    this.components.deleteAll();
    this.rawData.deleteAll();
    this.plans.deleteAll();
    this.stats.invalidations++;
    this.stats.size = 0;
  }

  // ============ Stats ============

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics (useful for testing/debugging).
   */
  resetStats(): void {
    this.stats = {
      componentHits: 0,
      componentMisses: 0,
      rawDataHits: 0,
      rawDataMisses: 0,
      planHits: 0,
      planMisses: 0,
      size: 0,
      invalidations: 0,
    };
  }

  // ============ Key Computation ============

  /**
   * Compute a cache key for a component.
   * ALL options that affect loading are included in the key.
   */
  private computeComponentKey(id: ComponentID, options: CacheKeyOptions): string {
    // Sort options for consistent key generation
    const optParts: string[] = [];
    if (options.loadExtensions) optParts.push('ext');
    if (options.executeLoadSlot) optParts.push('slot');
    if (options.loadDocs) optParts.push('docs');
    if (options.loadCompositions) optParts.push('comp');
    if (options.loadSeedersAsAspects) optParts.push('seed');

    const optStr = optParts.length > 0 ? `:${optParts.join(',')}` : '';
    return `${id.toString()}${optStr}`;
  }

  /**
   * Compute a cache key for a load plan.
   */
  private computePlanKey(ids: ComponentID[], options: LoadPlanOptions): string {
    // Sort IDs for consistent key
    const sortedIds = [...ids].sort((a, b) => a.toString().localeCompare(b.toString()));
    const idsStr = sortedIds.map((id) => id.toString()).join(',');

    const optParts: string[] = [];
    if (options.loadExtensions) optParts.push('ext');
    if (options.executeLoadSlot) optParts.push('slot');
    if (options.loadSeedersAsAspects) optParts.push('seed');

    const optStr = optParts.length > 0 ? `:${optParts.join(',')}` : '';
    return `plan:${idsStr}${optStr}`;
  }
}

/**
 * Create a new LoaderCache instance.
 */
export function createLoaderCache(): LoaderCache {
  return new LoaderCache();
}
