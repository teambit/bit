/**
 * Component Loader V2
 *
 * A rewritten component loading mechanism with:
 * - Explicit LoadPlan for inspectable load ordering
 * - Unified caching strategy
 * - Clear pipeline phases
 *
 * See docs/rfcs/component-loading-rewrite/ for the full RFC.
 */

// Core types
export {
  LoadPlan,
  LoadPhase,
  LoadPlanOptions,
  LoadPlanStats,
  createEmptyPlan,
  createPhase,
  formatPlan,
  validatePlan,
} from './load-plan';

export { ComponentSource, RawComponentData, MultiSourceLoader, MultiSourceLoadResult } from './component-source';

export { LoaderCache, CacheStats, CacheKeyOptions, createLoaderCache } from './loader-cache';

// Sources
export { WorkspaceSource, createWorkspaceSource, ScopeSource, createScopeSource } from './sources';

// Orchestrator
export { WorkspaceComponentLoaderV2 } from './workspace-component-loader-v2';

// Feature flag
export { COMPONENT_LOADER_V2 } from '@teambit/harmony.modules.feature-toggle';
