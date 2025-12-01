import type { ComponentID } from '@teambit/component-id';
import type { LoadPlan, LoadPhase } from '../load-plan';
import type { ComponentSource, RawComponentData } from '../component-source';

/**
 * Result of the Hydration phase
 */
export interface HydrationResult {
  /** Successfully loaded raw component data */
  loaded: Map<string, RawComponentData>;

  /** Components that failed to load */
  failed: Map<string, Error>;

  /** Components that weren't found */
  notFound: ComponentID[];
}

/**
 * Hydration Phase
 *
 * Purpose: Load raw component data from sources (workspace/scope).
 *
 * Input: LoadPlan with phases and IDs
 * Output: Map of component ID -> RawComponentData
 *
 * This phase:
 * 1. Iterates through phases in order
 * 2. Loads components from appropriate sources
 * 3. Does NOT enrich or transform data - just raw loading
 */
export class HydrationPhase {
  constructor(
    private workspaceSource: ComponentSource,
    private scopeSource: ComponentSource
  ) {}

  /**
   * Execute hydration for all phases in the plan.
   */
  async execute(plan: LoadPlan): Promise<HydrationResult> {
    const result: HydrationResult = {
      loaded: new Map(),
      failed: new Map(),
      notFound: [],
    };

    for (const phase of plan.phases) {
      await this.hydratePhase(phase, result);
    }

    return result;
  }

  /**
   * Hydrate a single phase.
   */
  private async hydratePhase(phase: LoadPhase, result: HydrationResult): Promise<void> {
    // Load workspace components
    if (phase.workspaceIds.length > 0) {
      await this.loadFromSource(phase.workspaceIds, this.workspaceSource, result);
    }

    // Load scope components
    if (phase.scopeIds.length > 0) {
      await this.loadFromSource(phase.scopeIds, this.scopeSource, result);
    }
  }

  /**
   * Load components from a specific source.
   */
  private async loadFromSource(ids: ComponentID[], source: ComponentSource, result: HydrationResult): Promise<void> {
    // Try batch loading first
    try {
      const loaded = await source.loadRawMany(ids);
      for (const [idStr, data] of loaded) {
        result.loaded.set(idStr, data);
      }

      // Check for any IDs that weren't returned
      const loadedIds = new Set(loaded.keys());
      for (const id of ids) {
        const idStr = id.toString();
        if (!loadedIds.has(idStr) && !result.failed.has(idStr)) {
          result.notFound.push(id);
        }
      }
    } catch {
      // If batch loading fails, try individually
      for (const id of ids) {
        const idStr = id.toString();
        try {
          const data = await source.loadRaw(id);
          result.loaded.set(idStr, data);
        } catch (err: any) {
          result.failed.set(idStr, err);
        }
      }
    }
  }

  /**
   * Load a single component.
   */
  async loadOne(id: ComponentID, source: 'workspace' | 'scope'): Promise<RawComponentData> {
    const sourceToUse = source === 'workspace' ? this.workspaceSource : this.scopeSource;
    return sourceToUse.loadRaw(id);
  }
}

/**
 * Factory function for creating a HydrationPhase
 */
export function createHydrationPhase(workspaceSource: ComponentSource, scopeSource: ComponentSource): HydrationPhase {
  return new HydrationPhase(workspaceSource, scopeSource);
}
