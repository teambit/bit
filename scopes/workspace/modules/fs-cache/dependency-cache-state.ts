import path from 'path';
import { BIT_MAP } from '@teambit/legacy.constants';
import { getLastModifiedPathsTimestampMs } from '@teambit/toolbox.fs.last-modified';
import type { FsCache } from './fs-cache';

/** Any workspace change newer than the oldest entry invalidates the entire dependency cache. */
export async function dependencyCacheNeedsInvalidation(
  cache: FsCache,
  root: string,
  workspaceConfig: string
): Promise<boolean> {
  const paths = ['node_modules', 'package.json', 'pnpm-lock.yaml', 'yarn.lock', BIT_MAP].map((name) =>
    path.join(root, name)
  );
  paths.push(workspaceConfig);
  const [lastModified, entries] = await Promise.all([
    getLastModifiedPathsTimestampMs(paths),
    cache.listDependenciesDataCache(),
  ]);
  const firstCacheEntered = Math.min(...Object.values(entries).map((entry) => entry.time));
  return lastModified > firstCacheEntered;
}
