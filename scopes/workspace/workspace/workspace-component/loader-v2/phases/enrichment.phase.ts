import type { EnvsMain } from '@teambit/envs';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { Dependencies } from '@teambit/legacy.consumer-component';
import type { ExtensionDataEntry } from '@teambit/legacy.extension-data';
import type { RawComponentData } from '../component-source';

/**
 * Enriched component data with env and dependency information
 */
export interface EnrichedComponentData {
  raw: RawComponentData;
  envsData: any;
  depResolverData: any;
}

/**
 * Result of the Enrichment phase
 */
export interface EnrichmentResult {
  /** Map of component ID string -> enriched data */
  enriched: Map<string, EnrichedComponentData>;

  /** Components that failed enrichment */
  failed: Map<string, Error>;
}

/**
 * Enrichment Phase
 *
 * Purpose: Add aspects, extensions, and env descriptors to raw component data.
 *
 * Input: Map of RawComponentData
 * Output: Map of EnrichedComponentData with env/deps information
 *
 * This phase:
 * 1. Calculates environment descriptors
 * 2. Merges variant policies
 * 3. Extracts dependencies
 * 4. Prepares data for aspect list creation
 */
export class EnrichmentPhase {
  constructor(
    private envs: EnvsMain,
    private dependencyResolver: DependencyResolverMain,
    private inInstallContext: boolean = false
  ) {}

  /**
   * Enrich all loaded components with env and dependency data.
   */
  async execute(loaded: Map<string, RawComponentData>): Promise<EnrichmentResult> {
    const result: EnrichmentResult = {
      enriched: new Map(),
      failed: new Map(),
    };

    // Process each component
    for (const [idStr, rawData] of loaded) {
      try {
        const enriched = await this.enrichComponent(rawData);
        result.enriched.set(idStr, enriched);
      } catch (err: any) {
        // For components that fail enrichment (e.g., scope components with incomplete metadata),
        // create a minimal enriched version with empty env/deps data
        // This allows the pipeline to continue and create the component
        result.enriched.set(idStr, {
          raw: rawData,
          envsData: {},
          depResolverData: {},
        });
        result.failed.set(idStr, err);
      }
    }

    return result;
  }

  /**
   * Enrich a single component.
   */
  private async enrichComponent(raw: RawComponentData): Promise<EnrichedComponentData> {
    // Create a minimal Component-like object to pass to envs/deps resolver
    // The envs aspect expects component.state.aspects to have a .get() method (AspectList)
    // For now, create a simple mock that delegates to raw.extensions
    const aspectsMock = {
      get: (id: string) => {
        if (!raw.extensions || !raw.extensions.findExtension) {
          return undefined;
        }
        const ext = raw.extensions.findExtension(id);
        return ext ? { config: ext.data } : undefined;
      },
    };

    const componentLike: any = {
      id: raw.id,
      state: {
        _consumer: raw.consumerComponent,
        aspects: aspectsMock,
        config: {
          extensions: raw.extensions,
        },
      },
      config: {
        extensions: raw.extensions,
      },
    };

    // Calculate environment descriptor
    const envsData = await this.envs.calcDescriptor(componentLike, {
      skipWarnings: this.inInstallContext,
    });

    // Merge dependencies from workspace and model
    // For scope components, dependencies might not be fully initialized
    let envExtendsDeps = [];
    try {
      const wsDeps = raw.consumerComponent.dependencies?.dependencies || [];
      const modelDeps = raw.consumerComponent.componentFromModel?.dependencies?.dependencies || [];
      if (wsDeps.length > 0 || modelDeps.length > 0) {
        const merged = Dependencies.merge([wsDeps, modelDeps]);
        envExtendsDeps = merged?.get() || [];
      }
    } catch {
      // If dependency merging fails, continue with empty deps
      envExtendsDeps = [];
    }

    // Merge variant policies
    const policy = await this.dependencyResolver.mergeVariantPolicies(
      componentLike.config.extensions,
      raw.id,
      raw.consumerComponent.files,
      envExtendsDeps
    );

    // Extract dependencies
    const dependenciesList = await this.dependencyResolver.extractDepsFromLegacy(componentLike, policy);

    // Calculate env manifest
    const resolvedEnvJsonc = await this.envs.calculateEnvManifest(
      componentLike,
      raw.consumerComponent.files,
      envExtendsDeps
    );
    if (resolvedEnvJsonc) {
      // @ts-ignore
      envsData.resolvedEnvJsonc = resolvedEnvJsonc;
    }

    // Build dependency resolver data
    const depResolverData = {
      packageName: this.dependencyResolver.calcPackageName(componentLike),
      dependencies: dependenciesList.serialize(),
      policy: policy.serialize(),
      componentRangePrefix: this.dependencyResolver.calcComponentRangePrefixByConsumerComponent(raw.consumerComponent),
    };

    return {
      raw,
      envsData,
      depResolverData,
    };
  }

  /**
   * Create an extension data entry (helper for upsert)
   */
  async createDataEntry(extension: string, data: { [key: string]: any }): Promise<ExtensionDataEntry> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ExtensionDataEntry } = require('@teambit/legacy.extension-data');
    return new ExtensionDataEntry(undefined, undefined, extension, undefined, data);
  }
}

/**
 * Factory function for creating an EnrichmentPhase
 */
export function createEnrichmentPhase(
  envs: EnvsMain,
  dependencyResolver: DependencyResolverMain,
  inInstallContext?: boolean
): EnrichmentPhase {
  return new EnrichmentPhase(envs, dependencyResolver, inInstallContext);
}
