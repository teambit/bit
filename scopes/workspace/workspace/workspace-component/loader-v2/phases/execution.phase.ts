import type { Component } from '@teambit/component';
import mapSeries from 'p-map-series';
import type { ComponentLoadOptions } from '../../workspace-component-loader';

/**
 * Callback type for onComponentLoad slot
 */
export type OnComponentLoadCallback = (component: Component, loadOpts?: ComponentLoadOptions) => Promise<any>;

/**
 * Result of the Execution phase
 */
export interface ExecutionResult {
  /** Components after execution (may have been modified by slots) */
  components: Map<string, Component>;

  /** Components that failed execution */
  failed: Map<string, Error>;
}

/**
 * Execution Phase
 *
 * Purpose: Run onComponentLoad slots to allow aspects to process components.
 *
 * Input: Map of Component objects
 * Output: Same components after slot execution
 *
 * This phase:
 * 1. Runs onComponentLoad slots for each component
 * 2. Allows aspects to add/modify extension data
 * 3. Updates aspect lists with new data
 * 4. Returns fully initialized components
 */
export class ExecutionPhase {
  constructor(
    private onComponentLoadSlot: Array<[string, OnComponentLoadCallback]>,
    private upsertExtensionData: (component: Component, extension: string, data: any) => Promise<void>,
    private resolveComponentId: (id: string) => Promise<any>
  ) {}

  /**
   * Execute onComponentLoad slots for all components.
   */
  async execute(components: Map<string, Component>, loadOpts?: ComponentLoadOptions): Promise<ExecutionResult> {
    const result: ExecutionResult = {
      components: new Map(),
      failed: new Map(),
    };

    for (const [idStr, component] of components) {
      try {
        // Skip if component was soft-removed
        if (component.state._consumer.removed) {
          result.components.set(idStr, component);
          continue;
        }

        await this.executeSlots(component, loadOpts);
        result.components.set(idStr, component);
      } catch (err: any) {
        result.failed.set(idStr, err);
      }
    }

    return result;
  }

  /**
   * Execute slots for a single component.
   */
  private async executeSlots(component: Component, loadOpts?: ComponentLoadOptions): Promise<void> {
    // Run each slot in series (order matters)
    await mapSeries(this.onComponentLoadSlot, async ([extensionId, onLoad]) => {
      const data = await onLoad(component, loadOpts);
      await this.upsertExtensionData(component, extensionId, data);

      // Update the aspect list with new data
      const resolvedId = await this.resolveComponentId(extensionId);
      component.state.aspects.upsertEntry(resolvedId, data);
    });
  }
}

/**
 * Factory function for creating an ExecutionPhase
 */
export function createExecutionPhase(
  onComponentLoadSlot: Array<[string, OnComponentLoadCallback]>,
  upsertExtensionData: (component: Component, extension: string, data: any) => Promise<void>,
  resolveComponentId: (id: string) => Promise<any>
): ExecutionPhase {
  return new ExecutionPhase(onComponentLoadSlot, upsertExtensionData, resolveComponentId);
}
