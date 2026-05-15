/**
 * The five monotonic phases of a component load.
 *
 * Phases are strictly ordered: `identity` < `files` < `dependencies` < `extensions` < `aspects`.
 * Loading a component at phase N implies all phases <= N have been computed and memoized.
 * A `Component` carries a `loadedPhase` field; calling a method that requires a higher phase
 * upgrades the component in place under the loader's control.
 *
 * | Phase          | Contains                                                          | Used by                                |
 * | -------------- | ----------------------------------------------------------------- | -------------------------------------- |
 * | `identity`     | ComponentID, current version, on-disk presence flag               | bit list, bit list --ids-only          |
 * | `files`        | source files, package.json, config from .bitmap and component.json| bit show, simple inspection            |
 * | `dependencies` | resolved dependencies (runtime/dev/peer), modification status     | bit status (default), bit graph        |
 * | `extensions`   | merged extensions/variants, env binding                           | aspect-aware commands (bit envs)       |
 * | `aspects`      | components loaded as aspects, full slot execution                 | bit compile, bit tag, bit start        |
 */
export type Phase = 'identity' | 'files' | 'dependencies' | 'extensions' | 'aspects';

export const PHASES: readonly Phase[] = ['identity', 'files', 'dependencies', 'extensions', 'aspects'] as const;

const PHASE_RANK: Record<Phase, number> = {
  identity: 0,
  files: 1,
  dependencies: 2,
  extensions: 3,
  aspects: 4,
};

export function phaseRank(phase: Phase): number {
  return PHASE_RANK[phase];
}

/** Returns true if `a` is at least as hydrated as `b` (i.e. rank(a) >= rank(b)). */
export function isPhaseAtLeast(a: Phase, b: Phase): boolean {
  return phaseRank(a) >= phaseRank(b);
}

/** The default phase used when a caller does not specify one. Matches today's full-hydration behaviour. */
export const DEFAULT_PHASE: Phase = 'aspects';
