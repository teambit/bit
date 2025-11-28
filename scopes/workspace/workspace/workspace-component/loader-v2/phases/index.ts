/**
 * Pipeline Phases for Component Loader V2
 *
 * Each phase has a clear input/output contract and can be tested independently.
 *
 * Pipeline flow:
 * 1. Discovery - Find all ComponentIDs to load
 * 2. Resolution - Build LoadPlan with dependency order
 * 3. Hydration - Load raw data from sources
 * 4. Enrichment - Add aspects, extensions, env descriptors
 * 5. Assembly - Build Component objects
 * 6. Execution - Run onComponentLoad slots
 */

export { DiscoveryPhase, DiscoveryResult } from './discovery.phase';
export { ResolutionPhase, ResolutionResult } from './resolution.phase';
export { HydrationPhase, HydrationResult } from './hydration.phase';
export { EnrichmentPhase, EnrichmentResult, EnrichedComponentData } from './enrichment.phase';
export { AssemblyPhase, AssemblyResult } from './assembly.phase';
export { ExecutionPhase, ExecutionResult, OnComponentLoadCallback } from './execution.phase';
