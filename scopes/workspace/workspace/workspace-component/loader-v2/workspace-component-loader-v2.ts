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
    const extensionResolver: ExtensionResolver = {
      getExtensions: async (id) => {
        try {
          return await this.workspaceSource.getExtensions(id);
        } catch {
          return null;
        }
      },
      getEnvId: async (id) => {
        try {
          const extensions = await extensionResolver.getExtensions(id);
          if (!extensions) return null;

          const envExt = extensions.find((ext) => ext.extensionId?.name === 'envs');
          return envExt?.data?.id || null;
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

      // Phase 3: Hydration - Load raw data from sources
      this.logger.profileTrace(`phase-3-hydration-${callId}`);
      const hydrationResult = await this.hydrationPhase.execute(loadPlan);
      this.logger.profileTrace(`phase-3-hydration-${callId}`);

      if (process.env.BIT_LOG) {
        this.logger.console(
          `[V2] Hydration: loaded ${hydrationResult.loaded.size}, failed ${hydrationResult.failed.size}, notFound ${hydrationResult.notFound.length}`
        );
        if (hydrationResult.failed.size > 0) {
          hydrationResult.failed.forEach((err, idStr) => {
            this.logger.console(`  Failed: ${idStr} - ${err.message}`);
          });
        }
        if (hydrationResult.notFound.length > 0) {
          this.logger.console(`  Not found: ${hydrationResult.notFound.map((id) => id.toString()).join(', ')}`);
        }
      }

      // Phase 4: Enrichment - Add env and dependency information
      this.logger.profileTrace(`phase-4-enrichment-${callId}`);
      const enrichmentResult = await this.enrichmentPhase.execute(hydrationResult.loaded);
      this.logger.profileTrace(`phase-4-enrichment-${callId}`);

      if (process.env.BIT_LOG) {
        this.logger.console(
          `[V2] Enrichment: enriched ${enrichmentResult.enriched.size}, failed ${enrichmentResult.failed.size}`
        );
        if (enrichmentResult.failed.size > 0) {
          enrichmentResult.failed.forEach((err, idStr) => {
            this.logger.console(`  Failed enrichment: ${idStr} - ${err.message}`);
            if (err.stack) {
              this.logger.console(`    Stack: ${err.stack.split('\n').slice(0, 5).join('\n    ')}`);
            }
          });
        }
      }

      // Phase 5: Assembly - Build Component objects
      this.logger.profileTrace(`phase-5-assembly-${callId}`);
      const assemblyResult = await this.assemblyPhase.execute(enrichmentResult.enriched);
      this.logger.profileTrace(`phase-5-assembly-${callId}`);

      if (process.env.BIT_LOG) {
        this.logger.console(
          `[V2] Assembly: components ${assemblyResult.components.size}, failed ${assemblyResult.failed.size}`
        );
        if (assemblyResult.failed.size > 0) {
          assemblyResult.failed.forEach((err, idStr) => {
            this.logger.console(`  Failed assembly: ${idStr} - ${err.message}`);
          });
        }
      }

      // Phase 6: Execution - Run onComponentLoad slots
      if (loadOpts.executeLoadSlot) {
        this.logger.profileTrace(`phase-6-execution-${callId}`);
        await this.executionPhase.execute(assemblyResult.components);
        this.logger.profileTrace(`phase-6-execution-${callId}`);
      }

      // Return components
      return { components: Array.from(assemblyResult.components.values()), invalidComponents };
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
