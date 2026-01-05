import type { ComponentID } from '@teambit/component-id';
import type { ExtensionDataList } from '@teambit/legacy.extension-data';
import type { EnvsMain } from '@teambit/envs';
import { LoadPlan, LoadPlanOptions, createEmptyPlan, createPhase } from '../load-plan';
import type { DiscoveryResult } from './discovery.phase';

/**
 * Result of the Resolution phase
 */
export interface ResolutionResult {
  /** The complete load plan */
  plan: LoadPlan;

  /** Any warnings generated during resolution */
  warnings: string[];
}

/**
 * Interface for getting extensions without fully loading a component
 */
export interface ExtensionResolver {
  getExtensions(id: ComponentID): Promise<ExtensionDataList | null>;
  getEnvId(id: ComponentID): Promise<string | null>;
}

/**
 * Resolution Phase
 *
 * Purpose: Build a LoadPlan that determines the order components should be loaded.
 *
 * Input: DiscoveryResult (categorized component IDs)
 * Output: LoadPlan with phases ordered by dependencies
 *
 * This phase:
 * 1. Identifies which components are envs, extensions, or regular components
 * 2. Discovers dependencies between components
 * 3. Builds a topologically sorted load order
 * 4. Groups components into phases for efficient loading
 */
export class ResolutionPhase {
  constructor(
    private envs: EnvsMain,
    private extensionResolver: ExtensionResolver
  ) {}

  /**
   * Build a LoadPlan from discovered components.
   *
   * Uses workspace.componentExtensions with loadExtensions: false to discover
   * env IDs without triggering recursive component loads. This allows building
   * proper load groups where envs are loaded before their dependent components.
   */
  async execute(discovery: DiscoveryResult, _options: LoadPlanOptions = {}): Promise<ResolutionResult> {
    const plan = createEmptyPlan(discovery.requestedIds);
    const warnings: string[] = [];

    const { workspaceIds, scopeIds } = discovery;
    const allIds = [...workspaceIds, ...scopeIds];

    if (allIds.length === 0) {
      return { plan, warnings };
    }

    // Step 1: Separate core envs from other components
    const { coreEnvs, nonCoreEnvs } = this.separateCoreEnvs(allIds);

    // Step 2: If there are core envs among the requested, add them first
    if (coreEnvs.length > 0) {
      const coreEnvPhase = createPhase('core-envs', 'core-envs', 'Core environments must load first', {
        workspaceIds: coreEnvs.filter((id) => this.isInList(id, workspaceIds)),
        scopeIds: coreEnvs.filter((id) => this.isInList(id, scopeIds)),
        loadAsAspects: true,
      });
      plan.phases.push(coreEnvPhase);
    }

    // Step 3: Discover env IDs for non-core components
    // Uses componentExtensions with loadExtensions: false to avoid recursion
    const envIdStrings = new Set<string>();

    for (const id of nonCoreEnvs) {
      try {
        const envId = await this.extensionResolver.getEnvId(id);
        if (envId && !this.envs.isCoreEnv(envId)) {
          envIdStrings.add(envId);
        }
      } catch (err: any) {
        warnings.push(`Failed to get env for ${id.toString()}: ${err.message}`);
      }
    }

    // Step 4: Check which envs are in the current load list
    // These need to be loaded first as aspects
    const envsInList: ComponentID[] = [];
    const nonEnvComponents: ComponentID[] = [];

    for (const id of nonCoreEnvs) {
      const idStr = id.toStringWithoutVersion();
      if (envIdStrings.has(idStr) || envIdStrings.has(id.toString())) {
        envsInList.push(id);
      } else {
        nonEnvComponents.push(id);
      }
    }

    // Step 5: Add envs phase (if any workspace components are envs of others)
    if (envsInList.length > 0) {
      const envsPhase = createPhase('envs', 'envs', 'Environments must load before their components', {
        workspaceIds: envsInList.filter((id) => this.isInList(id, workspaceIds)),
        scopeIds: envsInList.filter((id) => this.isInList(id, scopeIds)),
        loadAsAspects: true,
      });
      plan.phases.push(envsPhase);
    }

    // Step 6: Add main components phase
    if (nonEnvComponents.length > 0) {
      const componentsPhase = createPhase('components', 'components', 'Main requested components', {
        workspaceIds: nonEnvComponents.filter((id) => this.isInList(id, workspaceIds)),
        scopeIds: nonEnvComponents.filter((id) => this.isInList(id, scopeIds)),
        loadAsAspects: false,
      });
      plan.phases.push(componentsPhase);
    }

    // Update plan stats
    this.updateStats(plan);

    return { plan, warnings };
  }

  /**
   * Original execute implementation - kept for reference.
   * This version performs env/extension lookups which can trigger recursive loads.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute_ORIGINAL(discovery: DiscoveryResult, options: LoadPlanOptions = {}): Promise<ResolutionResult> {
    const plan = createEmptyPlan(discovery.requestedIds);
    const warnings: string[] = [];

    const { workspaceIds, scopeIds } = discovery;
    const allIds = [...workspaceIds, ...scopeIds];

    if (allIds.length === 0) {
      return { plan, warnings };
    }

    // Step 1: Separate core envs from other components
    const { coreEnvs, nonCoreEnvs } = this.separateCoreEnvs(allIds);

    // Step 2: If there are core envs, add them as first phase
    if (coreEnvs.length > 0) {
      const coreEnvPhase = createPhase('core-envs', 'core-envs', 'Core environments must load first', {
        workspaceIds: coreEnvs.filter((id) => this.isInList(id, workspaceIds)),
        scopeIds: coreEnvs.filter((id) => this.isInList(id, scopeIds)),
        loadAsAspects: true,
      });
      plan.phases.push(coreEnvPhase);
    }

    // Step 3: For non-core components, discover their envs and extensions
    const envIds = new Set<string>();
    const extensionIds = new Set<string>();

    for (const id of nonCoreEnvs) {
      try {
        // Get env for this component
        const envId = await this.extensionResolver.getEnvId(id);
        if (envId && !this.envs.isCoreEnv(envId)) {
          envIds.add(envId);
        }

        // Get extensions for this component
        if (options.loadExtensions) {
          const extensions = await this.extensionResolver.getExtensions(id);
          if (extensions) {
            for (const ext of extensions) {
              if (ext.stringId && ext.newExtensionId) {
                extensionIds.add(ext.stringId);
              }
            }
          }
        }
      } catch (err: any) {
        warnings.push(`Failed to resolve dependencies for ${id.toString()}: ${err.message}`);
      }
    }

    // Step 4: Add envs phase (if any non-core envs)
    const envIdsList = Array.from(envIds);
    if (envIdsList.length > 0) {
      const envsPhase = createPhase('envs', 'envs', 'Environments must load before their components', {
        // For now, assume envs are in scope (simplified - real implementation would check)
        scopeIds: [], // Will be populated by caller with actual ComponentID objects
        loadAsAspects: true,
      });
      plan.phases.push(envsPhase);
    }

    // Step 5: Add extensions phase (if loading extensions)
    const extensionIdsList = Array.from(extensionIds);
    if (options.loadExtensions && extensionIdsList.length > 0) {
      const extensionsPhase = createPhase(
        'extensions',
        'extensions',
        'Extensions must load before components that use them',
        {
          scopeIds: [], // Will be populated by caller with actual ComponentID objects
          loadAsAspects: true,
        }
      );
      plan.phases.push(extensionsPhase);
    }

    // Step 6: Add main components phase
    const componentsPhase = createPhase('components', 'components', 'Main requested components', {
      workspaceIds: nonCoreEnvs.filter((id) => this.isInList(id, workspaceIds)),
      scopeIds: nonCoreEnvs.filter((id) => this.isInList(id, scopeIds)),
      loadAsAspects: false,
    });
    plan.phases.push(componentsPhase);

    // Update plan stats
    this.updateStats(plan);

    return { plan, warnings };
  }

  /**
   * Separate core envs from other components
   */
  private separateCoreEnvs(ids: ComponentID[]): { coreEnvs: ComponentID[]; nonCoreEnvs: ComponentID[] } {
    const coreEnvs: ComponentID[] = [];
    const nonCoreEnvs: ComponentID[] = [];

    for (const id of ids) {
      if (this.envs.isCoreEnv(id.toStringWithoutVersion())) {
        coreEnvs.push(id);
      } else {
        nonCoreEnvs.push(id);
      }
    }

    return { coreEnvs, nonCoreEnvs };
  }

  /**
   * Check if an ID is in a list (by string comparison)
   */
  private isInList(id: ComponentID, list: ComponentID[]): boolean {
    const idStr = id.toString();
    return list.some((listId) => listId.toString() === idStr);
  }

  /**
   * Update plan statistics
   */
  private updateStats(plan: LoadPlan): void {
    let totalComponents = 0;
    let workspaceComponents = 0;
    let scopeComponents = 0;
    let envCount = 0;
    let extensionCount = 0;

    for (const phase of plan.phases) {
      const wsCount = phase.workspaceIds.length;
      const scopeCount = phase.scopeIds.length;

      totalComponents += wsCount + scopeCount;
      workspaceComponents += wsCount;
      scopeComponents += scopeCount;

      if (phase.type === 'core-envs' || phase.type === 'envs' || phase.type === 'env-of-envs') {
        envCount += wsCount + scopeCount;
      }
      if (phase.type === 'extensions') {
        extensionCount += wsCount + scopeCount;
      }
    }

    plan.stats = {
      totalComponents,
      workspaceComponents,
      scopeComponents,
      phaseCount: plan.phases.length,
      envCount,
      extensionCount,
    };

    // Build load order (flattened phases)
    plan.loadOrder = [];
    for (const phase of plan.phases) {
      plan.loadOrder.push(...phase.workspaceIds, ...phase.scopeIds);
    }
  }
}

/**
 * Factory function for creating a ResolutionPhase
 */
export function createResolutionPhase(envs: EnvsMain, extensionResolver: ExtensionResolver): ResolutionPhase {
  return new ResolutionPhase(envs, extensionResolver);
}
