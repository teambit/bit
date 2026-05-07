export { serializeComponentForDiff } from './snapshot';
export type { NormalizedSnapshot } from './snapshot';
export { diffSnapshots, diffResultSets, isResultDiffEmpty } from './diff';
export type { FieldDiff, SnapshotDiff, ResultDiff } from './diff';
export { LoaderDiffHarness } from './harness';
export type { LoaderFactory, LoaderDiffHarnessOptions } from './harness';

/**
 * Read the diff-harness configuration from `BIT_LOADER_DIFF`. One env var, one number:
 *
 *   unset / 0   → off
 *   1           → on, compare every loader call
 *   N (>1)      → on, compare every Nth call (use this on big workspaces; running
 *                 both loaders on every call doubles memory and can OOM Node's
 *                 default heap)
 *
 * Returns null when off, otherwise the sample rate.
 */
export function loaderDiffSampleEvery(): number | null {
  const raw = process.env.BIT_LOADER_DIFF;
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}
