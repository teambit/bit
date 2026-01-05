import { compact, uniqBy } from 'lodash';
import mapSeries from 'p-map-series';
import type { Component, InvalidComponent } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import type { Logger } from '@teambit/logger';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import type { EnvsMain } from '@teambit/envs';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { ComponentNotFound } from '@teambit/legacy.scope';
import { MissingBitMapComponent } from '@teambit/legacy.bit-map';
import { ComponentNotFoundInPath } from '@teambit/legacy.consumer-component';
import { isFeatureEnabled, COMPONENT_LOADER_V2 } from '@teambit/harmony.modules.feature-toggle';
import { TagMap } from '@teambit/component';
import type { Workspace } from '../../workspace';
import type { ComponentLoadOptions } from '../workspace-component-loader';
import { WorkspaceComponent } from '../workspace-component';
import { createLoaderCache } from './loader-cache';
import type { LoaderCache } from './loader-cache';
import { DiscoveryPhase } from './phases/discovery.phase';
import { ResolutionPhase } from './phases/resolution.phase';
import type { ExtensionResolver } from './phases/resolution.phase';
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
  private workspaceSource: ComponentSource;
  private scopeSource: ComponentSource;

  // Pipeline phases
  private discoveryPhase: DiscoveryPhase;
  private resolutionPhase: ResolutionPhase;
  private hydrationPhase: HydrationPhase;
  private enrichmentPhase: EnrichmentPhase;
  private assemblyPhase: AssemblyPhase;
  private executionPhase: ExecutionPhase;

  /**
   * Track components currently being loaded to prevent redundant concurrent loads.
   * Key is component ID string, value is the promise that resolves when loading completes.
   */
  private loadingComponents = new Map<string, Promise<Component | undefined>>();

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
    this.workspaceSource = createWorkspaceSource(workspace);
    this.scopeSource = createScopeSource(workspace.scope);

    // Create extension resolver for resolution phase
    // Uses workspace.componentExtensions with loadExtensions: false to avoid triggering
    // recursive component loads when discovering env IDs for load ordering
    const extensionResolver: ExtensionResolver = {
      getExtensions: async (id) => {
        try {
          // Use componentExtensions with loadExtensions: false to avoid recursion
          const result = await workspace.componentExtensions(id, undefined, [], {
            loadExtensions: false,
          });
          return result.extensions;
        } catch {
          return null;
        }
      },
      getEnvId: async (id) => {
        try {
          // Use componentExtensions with loadExtensions: false to avoid recursion
          const result = await workspace.componentExtensions(id, undefined, [], {
            loadExtensions: false,
          });
          // The envId is already extracted by componentExtensions
          return result.envId || null;
        } catch {
          return null;
        }
      },
    };

    // Initialize pipeline phases
    this.discoveryPhase = new DiscoveryPhase(workspace.consumer.bitMap, async (id) => {
      try {
        const component = await workspace.scope.get(id, undefined, false);
        return !!component;
      } catch {
        return false;
      }
    });

    this.resolutionPhase = new ResolutionPhase(envs, extensionResolver);

    this.hydrationPhase = new HydrationPhase(this.workspaceSource, this.scopeSource);

    this.enrichmentPhase = new EnrichmentPhase(envs, dependencyResolver, false);

    this.assemblyPhase = new AssemblyPhase(
      (id, state) => new WorkspaceComponent(id, null, state, new TagMap(), workspace),
      (extensions) => workspace.createAspectList(extensions)
    );

    this.executionPhase = new ExecutionPhase(
      workspace.onComponentLoadSlot.toArray(),
      async (comp, extId, data) => {
        // Upsert extension data into component's aspect list
        const aspectId = await workspace.resolveComponentId(extId);
        comp.state.aspects.upsertEntry(aspectId, data);
      },
      (id) => workspace.resolveComponentId(id)
    );

    if (process.env.BIT_LOG) {
      this.logger.console('[V2] WorkspaceComponentLoaderV2 initialized with full pipeline');
    }
  }

  /**
   * Check if V2 loader is enabled via feature flag
   */
  static isEnabled(): boolean {
    return isFeatureEnabled(COMPONENT_LOADER_V2);
  }

  /**
   * Load multiple components with all their dependencies.
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
    // Match V1 loader defaults: loadExtensions and executeLoadSlot default to true
    const loadOptsWithDefaults: ComponentLoadOptions = Object.assign(
      {
        loadExtensions: true,
        executeLoadSlot: true,
        loadSeedersAsAspects: true,
        resolveExtensionsVersions: false,
      },
      loadOpts || {}
    );

    // Check cache first
    // Similar to V1 loader, we check both the specific options and the "fully loaded" version
    // If a component was loaded with more options than requested, it's still usable
    const loadOrCached: { idsToLoad: ComponentID[]; fromCache: Component[] } = {
      idsToLoad: [],
      fromCache: [],
    };

    const fullyLoadedOpts = { loadExtensions: true, executeLoadSlot: true };

    idsWithoutEmpty.forEach((id) => {
      // First try with exact options, then try with fully loaded options
      const componentFromCache =
        this.cache.getComponent(id, loadOptsWithDefaults) || this.cache.getComponent(id, fullyLoadedOpts);
      if (componentFromCache) {
        loadOrCached.fromCache.push(componentFromCache);
      } else {
        loadOrCached.idsToLoad.push(id);
      }
    });

    if (process.env.BIT_LOG && idsWithoutEmpty.length === 1) {
      const stats = this.cache.getStats();
      this.logger.console(
        `[V2-CACHE] Single component load: ${idsWithoutEmpty[0].toString()}, fromCache: ${loadOrCached.fromCache.length}, toLoad: ${loadOrCached.idsToLoad.length}, hits: ${stats.componentHits}, misses: ${stats.componentMisses}`
      );
    }

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
   * Load a single component
   */
  async get(
    componentId: ComponentID,
    legacyComponent?: ConsumerComponent,
    useCache = true,
    storeInCache = true,
    loadOpts?: ComponentLoadOptions
  ): Promise<Component> {
    const { components } = await this.getMany([componentId], loadOpts, true);
    if (components.length === 0) {
      throw new ComponentNotFound(componentId.toString());
    }
    return components[0];
  }

  /**
   * Try to get a component, return undefined if not found
   */
  async getIfExist(componentId: ComponentID): Promise<Component | undefined> {
    try {
      return await this.get(componentId);
    } catch (err: any) {
      if (this.isComponentNotExistsError(err)) {
        return undefined;
      }
      throw err;
    }
  }

  /**
   * Get invalid components (components that failed to load)
   */
  async getInvalid(ids: Array<ComponentID>): Promise<InvalidComponent[]> {
    const idsWithoutEmpty = compact(ids);
    const errors: InvalidComponent[] = [];
    const longProcessLogger = this.logger.createLongProcessLogger('loading components', ids.length);
    await mapSeries(idsWithoutEmpty, async (id: ComponentID) => {
      longProcessLogger.logProgress(id.toString());
      try {
        await this.get(id);
      } catch (err: any) {
        errors.push({
          id,
          err,
        });
      }
    });
    return errors;
  }

  /**
   * Clear component from cache
   */
  clearComponentCache(id: ComponentID): void {
    this.cache.invalidate(id);
  }

  /**
   * Execute the pipeline to load components.
   *
   * The pipeline processes LoadPlan phases sequentially to ensure envs are
   * fully loaded and registered before their dependent components. Each phase
   * goes through the full pipeline (Hydration → Enrichment → Assembly → Execution)
   * before the next phase starts.
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
    const allComponents: Component[] = [];

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
      const resolutionResult = await this.resolutionPhase.execute(discoveryResult, {
        idsToNotLoadAsAspects: loadOpts.idsToNotLoadAsAspects || [],
        loadSeedersAsAspects: loadOpts.loadSeedersAsAspects ?? true,
      });
      const loadPlan = resolutionResult.plan;
      this.logger.profileTrace(`phase-2-resolution-${callId}`);

      if (process.env.BIT_LOG) {
        this.logger.console(`[V2] LoadPlan has ${loadPlan.phases.length} phases`);
        loadPlan.phases.forEach((phase, i) => {
          this.logger.console(
            `  Phase ${i + 1}: ${phase.name} (${phase.type}) - ${phase.workspaceIds.length + phase.scopeIds.length} components`
          );
        });
      }

      // Process each LoadPlan phase through the full pipeline
      // This ensures envs are registered before dependent components
      for (let i = 0; i < loadPlan.phases.length; i++) {
        const phase = loadPlan.phases[i];
        const phaseIds = [...phase.workspaceIds, ...phase.scopeIds];

        if (phaseIds.length === 0) continue;

        if (process.env.BIT_LOG) {
          this.logger.console(`[V2] Processing phase ${i + 1}: ${phase.name} (${phaseIds.length} components)`);
        }

        // Create a mini-plan with just this phase
        const miniPlan = { ...loadPlan, phases: [phase] };

        // Hydration - Load raw data for this phase
        this.logger.profileTrace(`phase-3-hydration-${callId}-${i}`);
        const hydrationResult = await this.hydrationPhase.execute(miniPlan);
        this.logger.profileTrace(`phase-3-hydration-${callId}-${i}`);

        if (process.env.BIT_LOG && hydrationResult.failed.size > 0) {
          hydrationResult.failed.forEach((err, idStr) => {
            this.logger.console(`  Failed hydration: ${idStr} - ${err.message}`);
          });
        }

        // Enrichment - Add env and dependency information for this phase
        this.logger.profileTrace(`phase-4-enrichment-${callId}-${i}`);
        const enrichmentResult = await this.enrichmentPhase.execute(hydrationResult.loaded);
        this.logger.profileTrace(`phase-4-enrichment-${callId}-${i}`);

        if (process.env.BIT_LOG && enrichmentResult.failed.size > 0) {
          enrichmentResult.failed.forEach((err, idStr) => {
            this.logger.console(`  Failed enrichment: ${idStr} - ${err.message}`);
          });
        }

        // Assembly - Build Component objects for this phase
        this.logger.profileTrace(`phase-5-assembly-${callId}-${i}`);
        const assemblyResult = await this.assemblyPhase.execute(enrichmentResult.enriched);
        this.logger.profileTrace(`phase-5-assembly-${callId}-${i}`);

        if (process.env.BIT_LOG && assemblyResult.failed.size > 0) {
          assemblyResult.failed.forEach((err, idStr) => {
            this.logger.console(`  Failed assembly: ${idStr} - ${err.message}`);
          });
        }

        // Execution - Run onComponentLoad slots for this phase
        // This registers envs so they're available for subsequent phases
        if (loadOpts.executeLoadSlot || phase.loadAsAspects) {
          this.logger.profileTrace(`phase-6-execution-${callId}-${i}`);
          await this.executionPhase.execute(assemblyResult.components);
          this.logger.profileTrace(`phase-6-execution-${callId}-${i}`);
        }

        // Load extensions as aspects for workspace components
        // This is critical for loading external envs (like teambit.harmony/envs/core-aspect-env)
        // that aren't in the workspace but are used by workspace components
        if (loadOpts.loadExtensions !== false && phase.workspaceIds.length > 0) {
          this.logger.profileTrace(`phase-7-load-extensions-${callId}-${i}`);
          const componentsArray = Array.from(assemblyResult.components.values());
          // Filter to only workspace components and collect their extensions
          const workspaceIdStrs = new Set(phase.workspaceIds.map((id) => id.toString()));
          const workspaceComps = componentsArray.filter((comp) => workspaceIdStrs.has(comp.id.toString()));

          const allExtensions = workspaceComps.flatMap((comp) => {
            const consumer = comp.state._consumer;
            // Get extensions from consumer - extensions is an ExtensionDataList
            return consumer?.extensions?.toArray?.() || consumer?.extensions || [];
          });

          if (allExtensions.length > 0) {
            try {
              // Create an ExtensionDataList from the collected extensions
              const { ExtensionDataList } = await import('@teambit/legacy.extension-data');
              const extensionsList = ExtensionDataList.fromArray(allExtensions);
              await this.workspace.loadComponentsExtensions(extensionsList);
            } catch (err: any) {
              // Log but don't fail - extensions loading can fail for various reasons
              this.logger.warn(`[V2] Failed to load extensions for phase: ${err.message}`);
            }
          }
          this.logger.profileTrace(`phase-7-load-extensions-${callId}-${i}`);
        }

        // Collect components from this phase
        allComponents.push(...assemblyResult.components.values());
      }

      // Return all components
      return { components: allComponents, invalidComponents };
    } catch (err: any) {
      this.logger.error(`[V2] Component loading failed: ${err.message}`, err);

      // Create invalid components for all requested IDs
      ids.forEach((id) => {
        invalidComponents.push({
          id,
          err: err instanceof Error ? err : new Error(String(err)),
        });
      });

      return { components: [], invalidComponents };
    }
  }

  /**
   * Check if error indicates component doesn't exist
   */
  private isComponentNotExistsError(err: Error): boolean {
    return (
      err instanceof ComponentNotFound ||
      err instanceof MissingBitMapComponent ||
      err instanceof ComponentNotFoundInPath
    );
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.invalidateAll();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }
}
