import type { Component } from '@teambit/component';
import { ComponentFS, Config, State } from '@teambit/component';
import type { ComponentID } from '@teambit/component-id';
import { EnvsAspect } from '@teambit/envs';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { EnrichedComponentData } from './enrichment.phase';

/**
 * Result of the Assembly phase
 */
export interface AssemblyResult {
  /** Successfully assembled Component objects */
  components: Map<string, Component>;

  /** Components that failed assembly */
  failed: Map<string, Error>;
}

/**
 * Assembly Phase
 *
 * Purpose: Build Component objects from enriched data.
 *
 * Input: Map of EnrichedComponentData
 * Output: Map of Component objects ready for execution
 *
 * This phase:
 * 1. Creates Component instances with State, Config, TagMap
 * 2. Sets up ComponentFS
 * 3. Upserts env and dependency resolver data into extensions
 * 4. Prepares components for the execution phase
 */
export class AssemblyPhase {
  constructor(
    private createComponent: (id: ComponentID, state: State) => Component,
    private createAspectList: (extensions: any) => Promise<any>
  ) {}

  /**
   * Assemble Component objects from enriched data.
   */
  async execute(enriched: Map<string, EnrichedComponentData>): Promise<AssemblyResult> {
    const result: AssemblyResult = {
      components: new Map(),
      failed: new Map(),
    };

    for (const [idStr, data] of enriched) {
      try {
        const component = await this.assembleComponent(data);
        result.components.set(idStr, component);
      } catch (err: any) {
        result.failed.set(idStr, err);
      }
    }

    return result;
  }

  /**
   * Assemble a single Component.
   */
  private async assembleComponent(data: EnrichedComponentData): Promise<Component> {
    const { raw, envsData, depResolverData } = data;

    // Build ComponentFS from legacy files
    const componentFS = ComponentFS.fromVinyls(raw.consumerComponent.files);

    // Build Config from consumer component
    const config = new Config(raw.consumerComponent);

    // Upsert env and dependency resolver data into config
    await this.upsertExtensionData(config, EnvsAspect.id, envsData);
    await this.upsertExtensionData(config, DependencyResolverAspect.id, depResolverData);

    // Create aspect list with updated extensions
    const aspectList = await this.createAspectList(config.extensions);

    // Build State
    const state = new State(config, aspectList, componentFS, raw.consumerComponent.dependencies, raw.consumerComponent);

    // Create Component
    const component = this.createComponent(raw.id, state);

    // Set tags if available
    if (raw.consumerComponent.log) {
      // TagMap would be built from log/versions
      // For now, we'll use an empty TagMap as this requires more complex logic
    }

    return component;
  }

  /**
   * Upsert extension data into config.
   */
  private async upsertExtensionData(config: Config, extensionId: string, data: any): Promise<void> {
    if (!data) return;

    const existingExtension = config.extensions.findExtension(extensionId);
    if (existingExtension) {
      // Only merge top level of extension data
      Object.assign(existingExtension.data, data);
      return;
    }

    // Add new extension
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ExtensionDataEntry } = require('@teambit/legacy.extension-data');
    const entry = new ExtensionDataEntry(undefined, undefined, extensionId, undefined, data);
    config.extensions.push(entry);
  }
}

/**
 * Factory function for creating an AssemblyPhase
 */
export function createAssemblyPhase(
  createComponent: (id: ComponentID, state: State) => Component,
  createAspectList: (extensions: any) => Promise<any>
): AssemblyPhase {
  return new AssemblyPhase(createComponent, createAspectList);
}
