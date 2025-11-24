import { compact, uniqBy } from 'lodash';
import type { Component, InvalidComponent } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import type { Logger } from '@teambit/logger';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import type { EnvsMain } from '@teambit/envs';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import { isFeatureEnabled, COMPONENT_LOADER_V2 } from '@teambit/harmony.modules.feature-toggle';
import type { Workspace } from '../workspace';
import type { ComponentLoadOptions } from './workspace-component-loader';
import { createLoaderCache } from './loader-cache';
import type { LoaderCache } from './loader-cache';
import { DiscoveryPhase } from './phases/discovery.phase';
import { ResolutionPhase } from './phases/resolution.phase';
import { HydrationPhase } from './phases/hydration.phase';
import { EnrichmentPhase } from './phases/enrichment.phase';
import { AssemblyPhase } from './phases/assembly.phase';
import { ExecutionPhase } from './phases/execution.phase';
import { createWorkspaceSource } from './sources/workspace-source';
import { createScopeSource } from './sources/scope-source';
import type { ComponentSource } from './component-source';

type GetManyRes = {
  components: Component[];
  invalidComponents: InvalidComponent[];
};

/**
 * WorkspaceComponentLoaderV2
 *
 * The V2 component loader with explicit pipeline phases and unified caching.
 *
 * Architecture:
 * 1. Discovery: Find all ComponentIDs to load
 * 2. Resolution: Build LoadPlan with dependency ordering
 * 3. Hydration: Load raw data from sources
 * 4. Enrichment: Add env and dependency information
 * 5. Assembly: Build Component objects
 * 6. Execution: Run onComponentLoad slots
 *
 * Feature flag: BIT_FEATURES=component-loader-v2
 */
export class WorkspaceComponentLoaderV2 {
  private cache: LoaderCache;
  private sources: ComponentSource[];

  // Pipeline phases
  private discoveryPhase: DiscoveryPhase;
  private resolutionPhase: ResolutionPhase;
  private hydrationPhase: HydrationPhase;
  private enrichmentPhase: EnrichmentPhase;
  private assemblyPhase: AssemblyPhase;
  private executionPhase: ExecutionPhase;

  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private dependencyResolver: DependencyResolverMain,
    private envs: EnvsMain,
    private aspectLoader: AspectLoaderMain
  ) {
    // Initialize unified cache
    this.cache = createLoaderCache();

    // Initialize sources (workspace has higher priority than scope)
    this.sources = [createWorkspaceSource(workspace), createScopeSource(workspace.scope)];

    // Initialize pipeline phases
    this.discoveryPhase = new DiscoveryPhase(workspace.consumer.bitMap, async (id) => {
      try {
        const component = await workspace.scope.get(id, undefined, false);
        return !!component;
      } catch {
        return false;
      }
    });

    this.resolutionPhase = new ResolutionPhase(workspace.consumer.bitMap, envs, this.cache);

    this.hydrationPhase = new HydrationPhase(this.sources, this.cache, logger);

    this.enrichmentPhase = new EnrichmentPhase(workspace, dependencyResolver, envs, logger);

    this.assemblyPhase = new AssemblyPhase(workspace, logger);

    this.executionPhase = new ExecutionPhase(workspace, logger);
  }

  /**
   * Check if V2 loader is enabled via feature flag
   */
  static isEnabled(): boolean {
    return isFeatureEnabled(COMPONENT_LOADER_V2);
  }

  /**
   * Load multiple components with all their dependencies.
   *
   * This is the main entry point for component loading, matching the interface
   * of the V1 loader's getMany() method.
   */
  async getMany(ids: Array<ComponentID>, loadOpts?: ComponentLoadOptions, throwOnFailure = true): Promise<GetManyRes> {
    const idsWithoutEmpty = compact(ids);
    if (!idsWithoutEmpty.length) {
      return { components: [], invalidComponents: [] };
    }

    const callId = Math.floor(Math.random() * 1000);
    this.logger.profileTrace(`getMany-v2-${callId}`);
    this.logger.setStatusLine(`loading ${ids.length} component(s) [V2]`);

    // Default load options
    const loadOptsWithDefaults: ComponentLoadOptions = Object.assign(
      {
        loadExtensions: false,
        executeLoadSlot: false,
        loadSeedersAsAspects: true,
        resolveExtensionsVersions: false,
      },
      loadOpts || {}
    );

    // Check cache first
    const loadOrCached: { idsToLoad: ComponentID[]; fromCache: Component[] } = {
      idsToLoad: [],
      fromCache: [],
    };

    idsWithoutEmpty.forEach((id) => {
      const componentFromCache = this.cache.getComponent(id, loadOptsWithDefaults);
      if (componentFromCache) {
        loadOrCached.fromCache.push(componentFromCache);
      } else {
        loadOrCached.idsToLoad.push(id);
      }
    });

    // Load components that weren't in cache
    const { components: loadedComponents, invalidComponents } = await this.loadComponents(
      loadOrCached.idsToLoad,
      loadOptsWithDefaults,
      callId
    );

    // Handle failures
    invalidComponents.forEach(({ err }) => {
      if (throwOnFailure) throw err;
    });

    // Combine loaded + cached, deduplicate
    const components = uniqBy([...loadedComponents, ...loadOrCached.fromCache], (comp) => comp.id.toString());

    // Cache all loaded components
    components.forEach((comp) => {
      this.cache.setComponent(comp.id, comp, { loadExtensions: true, executeLoadSlot: true });
    });

    // Filter to only requested components (not transitive dependencies)
    const idsWithEmptyStrs = ids.map((id) => id.toString());
    const requestedComponents = components.filter(
      (comp) =>
        idsWithEmptyStrs.includes(comp.id.toString()) || idsWithEmptyStrs.includes(comp.id.toStringWithoutVersion())
    );

    this.logger.profileTrace(`getMany-v2-${callId}`);
    this.logger.clearStatusLine();

    return { components: requestedComponents, invalidComponents };
  }

  /**
   * Execute the pipeline to load components
   */
  private async loadComponents(
    ids: ComponentID[],
    loadOpts: ComponentLoadOptions,
    callId: number
  ): Promise<GetManyRes> {
    if (!ids?.length) {
      return { components: [], invalidComponents: [] };
    }

    const invalidComponents: InvalidComponent[] = [];

    try {
      // Phase 1: Discovery - Find all ComponentIDs to load
      this.logger.profileTrace(`phase-1-discovery-${callId}`);
      const discoveryResult = await this.discoveryPhase.execute(ids);
      this.logger.profileTrace(`phase-1-discovery-${callId}`);

      if (process.env.BIT_LOG) {
        this.logger.console(`[V2] Discovery found ${discoveryResult.ids.length} components`);
        this.logger.console(`  Workspace: ${discoveryResult.workspaceIds.length}`);
        this.logger.console(`  Scope: ${discoveryResult.scopeIds.length}`);
      }

      // Phase 2: Resolution - Build LoadPlan with dependency ordering
      this.logger.profileTrace(`phase-2-resolution-${callId}`);
      const loadPlan = await this.resolutionPhase.execute(
        discoveryResult,
        loadOpts.idsToNotLoadAsAspects || [],
        loadOpts.loadSeedersAsAspects ?? true
      );
      this.logger.profileTrace(`phase-2-resolution-${callId}`);

      if (process.env.BIT_LOG) {
        this.logger.console(`[V2] LoadPlan has ${loadPlan.phases.length} phases`);
        loadPlan.phases.forEach((phase, i) => {
          this.logger.console(
            `  Phase ${i + 1}: ${phase.name} (${phase.type}) - ${phase.workspaceIds.length + phase.scopeIds.length} components`
          );
        });
      }

      // Phase 3: Hydration - Load raw data from sources
      this.logger.profileTrace(`phase-3-hydration-${callId}`);
      const rawDataMap = await this.hydrationPhase.execute(loadPlan, loadOpts);
      this.logger.profileTrace(`phase-3-hydration-${callId}`);

      // Phase 4: Enrichment - Add env and dependency information
      this.logger.profileTrace(`phase-4-enrichment-${callId}`);
      const enrichedDataMap = await this.enrichmentPhase.execute(rawDataMap, loadOpts);
      this.logger.profileTrace(`phase-4-enrichment-${callId}`);

      // Phase 5: Assembly - Build Component objects
      this.logger.profileTrace(`phase-5-assembly-${callId}`);
      const componentsMap = await this.assemblyPhase.execute(enrichedDataMap, loadOpts);
      this.logger.profileTrace(`phase-5-assembly-${callId}`);

      // Phase 6: Execution - Run onComponentLoad slots
      if (loadOpts.executeLoadSlot) {
        this.logger.profileTrace(`phase-6-execution-${callId}`);
        await this.executionPhase.execute(componentsMap);
        this.logger.profileTrace(`phase-6-execution-${callId}`);
      }

      // Convert map to array
      const components = Array.from(componentsMap.values());

      return { components, invalidComponents };
    } catch (err: any) {
      this.logger.error(`[V2] Component loading failed: ${err.message}`, err);

      // Create invalid components for all requested IDs
      ids.forEach((id) => {
        invalidComponents.push({
          id,
          err: err instanceof Error ? err : new Error(String(err)),
          isInvalid: true,
        });
      });

      return { components: [], invalidComponents };
    }
  }

  /**
   * Clear all caches (useful for testing or after workspace changes)
   */
  clearCache(): void {
    this.cache.invalidateAll();
  }

  /**
   * Get cache statistics (useful for debugging)
   */
  getCacheStats() {
    return this.cache.getStats();
  }
}
