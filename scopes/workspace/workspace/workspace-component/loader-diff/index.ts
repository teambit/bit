export { serializeComponentForDiff } from './snapshot';
export type { NormalizedSnapshot } from './snapshot';
export { diffSnapshots, diffResultSets, isResultDiffEmpty } from './diff';
export type { FieldDiff, SnapshotDiff, ResultDiff } from './diff';
export { LoaderDiffHarness } from './harness';
export type { LoaderFactory, LoaderDiffHarnessOptions } from './harness';

/**
 * Returns the comparison label if the diff harness is enabled, otherwise null.
 * `BIT_LOADER_DIFF=1` (or `=v1-vs-v1`) → V1-vs-V1 baseline mode.
 * Any other truthy value is used as the label as-is.
 */
export function loaderDiffMode(): string | null {
  const raw = process.env.BIT_LOADER_DIFF;
  if (!raw || raw === '0' || raw.toLowerCase() === 'false') return null;
  if (raw === '1' || raw.toLowerCase() === 'true') return 'v1-vs-v1';
  return raw;
}
