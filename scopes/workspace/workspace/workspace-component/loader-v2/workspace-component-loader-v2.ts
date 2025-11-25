import type { Component, InvalidComponent } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import type { Logger } from '@teambit/logger';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import type { EnvsMain } from '@teambit/envs';
import type { AspectLoaderMain } from '@teambit/aspect-loader';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { isFeatureEnabled, COMPONENT_LOADER_V2 } from '@teambit/harmony.modules.feature-toggle';
import type { Workspace } from '../../workspace';
import { WorkspaceComponentLoader } from '../workspace-component-loader';
import type { ComponentLoadOptions } from '../workspace-component-loader';

type GetManyRes = {
  components: Component[];
  invalidComponents: InvalidComponent[];
};

/**
 * WorkspaceComponentLoaderV2
 *
 * The V2 component loader with explicit pipeline phases and unified caching.
 *
 * NOTE: This is currently a pass-through to V1 loader while we develop the full V2 implementation.
 * The feature flag is active and can be tested, but the actual V2 pipeline is not yet complete.
 *
 * Feature flag: BIT_FEATURES=component-loader-v2
 */
export class WorkspaceComponentLoaderV2 {
  private v1Loader: WorkspaceComponentLoader;

  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private dependencyResolver: DependencyResolverMain,
    private envs: EnvsMain,
    private aspectLoader: AspectLoaderMain
  ) {
    // For now, delegate to V1 loader
    this.v1Loader = new WorkspaceComponentLoader(workspace, logger, dependencyResolver, envs, aspectLoader);

    if (process.env.BIT_LOG) {
      this.logger.console('[V2] WorkspaceComponentLoaderV2 initialized (delegating to V1)');
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
    // Delegate to V1 for now
    return this.v1Loader.getMany(ids, loadOpts, throwOnFailure);
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
    return this.v1Loader.get(componentId, legacyComponent, useCache, storeInCache, loadOpts);
  }

  /**
   * Try to get a component, return undefined if not found
   */
  async getIfExist(componentId: ComponentID): Promise<Component | undefined> {
    return this.v1Loader.getIfExist(componentId);
  }

  /**
   * Get invalid components (components that failed to load)
   */
  async getInvalid(ids: Array<ComponentID>): Promise<InvalidComponent[]> {
    return this.v1Loader.getInvalid(ids);
  }

  /**
   * Clear component from cache
   */
  clearComponentCache(id: ComponentID): void {
    this.v1Loader.clearComponentCache(id);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    // V1 doesn't have clearCache, so call clearComponentCache for each ID if needed
    // For now, this is a no-op
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      components: { size: 0, hits: 0, misses: 0 },
      rawData: { size: 0, hits: 0, misses: 0 },
      plans: { size: 0, hits: 0, misses: 0 },
    };
  }
}
