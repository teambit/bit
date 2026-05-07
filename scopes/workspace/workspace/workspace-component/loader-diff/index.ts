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

/**
 * Returns the sample rate from `BIT_LOADER_DIFF_SAMPLE`. Default 1 (every call).
 * Use larger values on workspaces big enough that running both loaders for every
 * call would OOM, e.g. `BIT_LOADER_DIFF_SAMPLE=10`.
 */
export function loaderDiffSampleEvery(): number {
  const raw = process.env.BIT_LOADER_DIFF_SAMPLE;
  if (!raw) return 1;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}
