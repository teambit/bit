import type { ComponentID } from '@teambit/component-id';

/**
 * Represents a single phase in the component loading pipeline.
 * Components are grouped into phases based on their role (env, extension, regular component)
 * and must be loaded in the correct order to satisfy dependencies.
 */
export interface LoadPhase {
  /** Human-readable name for debugging */
  name: string;

  /** Type of components in this phase */
  type: 'core-envs' | 'env-of-envs' | 'envs' | 'extensions' | 'components';

  /** Component IDs to load from workspace */
  workspaceIds: ComponentID[];

  /** Component IDs to load from scope */
  scopeIds: ComponentID[];

  /** Whether to load these components as aspects */
  loadAsAspects: boolean;

  /** Explanation of why this phase exists (for debugging) */
  reason: string;
}

/**
 * LoadPlan represents the complete strategy for loading a set of components.
 *
 * Key principles:
 * 1. INSPECTABLE - The plan can be logged and debugged before execution
 * 2. DETERMINISTIC - Same inputs produce same plan
 * 3. EXPLICIT - No hidden recursive loads; everything is in the plan
 *
 * The plan is built during the Resolution phase and executed during subsequent phases.
 */
export interface LoadPlan {
  /** Ordered list of phases to execute */
  phases: LoadPhase[];

  /**
   * Dependency graph for debugging/visualization.
   * Maps component ID string to its dependency ID strings.
   */
  dependencyGraph: Map<string, string[]>;

  /**
   * All component IDs in topological order (dependencies before dependents).
   * This is the flattened version of phases for simple iteration.
   */
  loadOrder: ComponentID[];

  /** Original IDs that were requested to be loaded */
  requestedIds: ComponentID[];

  /** Statistics about the plan */
  stats: LoadPlanStats;

  /** Timestamp when the plan was created */
  createdAt: number;
}

export interface LoadPlanStats {
  totalComponents: number;
  workspaceComponents: number;
  scopeComponents: number;
  phaseCount: number;
  envCount: number;
  extensionCount: number;
}

/**
 * Options for building a LoadPlan
 */
export interface LoadPlanOptions {
  /** Whether to load extensions for components */
  loadExtensions?: boolean;

  /** Whether to execute load slots after loading */
  executeLoadSlot?: boolean;

  /** Whether to load seeders (envs/aspects that components depend on) */
  loadSeedersAsAspects?: boolean;

  /** Component IDs to skip loading as aspects */
  idsToNotLoadAsAspects?: string[];
}

/**
 * Creates an empty LoadPlan
 */
export function createEmptyPlan(requestedIds: ComponentID[]): LoadPlan {
  return {
    phases: [],
    dependencyGraph: new Map(),
    loadOrder: [],
    requestedIds,
    stats: {
      totalComponents: 0,
      workspaceComponents: 0,
      scopeComponents: 0,
      phaseCount: 0,
      envCount: 0,
      extensionCount: 0,
    },
    createdAt: Date.now(),
  };
}

/**
 * Creates a new LoadPhase
 */
export function createPhase(
  name: string,
  type: LoadPhase['type'],
  reason: string,
  options: {
    workspaceIds?: ComponentID[];
    scopeIds?: ComponentID[];
    loadAsAspects?: boolean;
  } = {}
): LoadPhase {
  return {
    name,
    type,
    workspaceIds: options.workspaceIds || [],
    scopeIds: options.scopeIds || [],
    loadAsAspects: options.loadAsAspects ?? false,
    reason,
  };
}

/**
 * Formats a LoadPlan for logging/debugging
 */
export function formatPlan(plan: LoadPlan): string {
  const lines: string[] = [
    `=== LoadPlan ===`,
    `Requested: ${plan.requestedIds.map((id) => id.toString()).join(', ')}`,
    `Total components: ${plan.stats.totalComponents}`,
    `  - Workspace: ${plan.stats.workspaceComponents}`,
    `  - Scope: ${plan.stats.scopeComponents}`,
    `  - Envs: ${plan.stats.envCount}`,
    `  - Extensions: ${plan.stats.extensionCount}`,
    ``,
    `Phases (${plan.phases.length}):`,
  ];

  plan.phases.forEach((phase, index) => {
    const wsCount = phase.workspaceIds.length;
    const scopeCount = phase.scopeIds.length;
    lines.push(`  ${index + 1}. ${phase.name} (${phase.type})`);
    lines.push(`     Reason: ${phase.reason}`);
    lines.push(`     Workspace IDs: ${wsCount} | Scope IDs: ${scopeCount}`);
    lines.push(`     Load as aspects: ${phase.loadAsAspects}`);
    if (wsCount > 0 && wsCount <= 5) {
      lines.push(`     WS: ${phase.workspaceIds.map((id) => id.toString()).join(', ')}`);
    }
    if (scopeCount > 0 && scopeCount <= 5) {
      lines.push(`     Scope: ${phase.scopeIds.map((id) => id.toString()).join(', ')}`);
    }
  });

  return lines.join('\n');
}

/**
 * Validates a LoadPlan for common issues
 */
export function validatePlan(plan: LoadPlan): string[] {
  const errors: string[] = [];

  if (plan.phases.length === 0 && plan.requestedIds.length > 0) {
    errors.push('Plan has no phases but has requested IDs');
  }

  // Check for duplicate IDs across phases
  const seenIds = new Set<string>();
  for (const phase of plan.phases) {
    for (const id of [...phase.workspaceIds, ...phase.scopeIds]) {
      const idStr = id.toString();
      if (seenIds.has(idStr)) {
        errors.push(`Duplicate ID in plan: ${idStr}`);
      }
      seenIds.add(idStr);
    }
  }

  return errors;
}
