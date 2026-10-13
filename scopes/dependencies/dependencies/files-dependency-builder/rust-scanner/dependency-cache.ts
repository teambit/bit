import { createRequire } from 'module';
import path from 'path';
import type { FsCache } from '@teambit/workspace.modules.fs-cache';
import { nativeDependencyCacheDirectory } from '@teambit/workspace.modules.fs-cache';
import { canReadModificationTimestampsNatively } from '@teambit/toolbox.fs.last-modified';
import { resolveRustDependencyScannerRuntime } from './runtime';
import { acquireRustDependencyScannerSession } from './scope';
import type { RustDependencyScannerSession } from './session';

const cacheRequire = createRequire(require.resolve('@teambit/workspace.modules.fs-cache'));
const cacache = cacheRequire('cacache');
const canonicalGet = createRequire(cacheRequire.resolve('cacache'))('./get');
const cacheVersion = cacheRequire('cacache/package.json').version;
const memo = createRequire(cacheRequire.resolve('cacache'))('./memoization');
const memoGet = memo.get;
const timestampRequire = createRequire(require.resolve('@teambit/toolbox.fs.last-modified'));
const timestampFs = timestampRequire('fs-extra');
const originalTimestampFs = createRequire(timestampRequire.resolve('fs-extra'))('./fs');
const timestampVersion = timestampRequire('globby/package.json').version;
async function request<T>(
  run: (session: RustDependencyScannerSession) => Promise<T | undefined>
): Promise<T | undefined> {
  const runtime = resolveRustDependencyScannerRuntime();
  if (!runtime?.workspaceAddon) return undefined;
  const lease = acquireRustDependencyScannerSession(runtime.executable, runtime.workspaceAddon);
  if (!lease) return undefined;
  try {
    return await run(lease.session);
  } finally {
    lease.release();
  }
}

/** Cache misses are authoritative; unsupported readers retain canonical errors and eviction. */
export async function readNativeDependencyCache(
  cache: FsCache,
  key: string
): Promise<{ timestamp: number; data: string } | null | undefined> {
  if (process.env.BIT_RUST_CLIENT_VCS !== 'on') return undefined;
  if (cacheVersion !== '20.0.3' || cacache.get !== canonicalGet || memo.get !== memoGet) return undefined;
  const directory = nativeDependencyCacheDirectory(cache);
  if (!directory || memo.get(directory, key)) return undefined;
  return request((session) => session.readDependencyCache(directory, key));
}

/** No snapshots survive this call; directory changes and file deletions are rechecked. */
export async function nativeDependencyCacheStale(
  root: string,
  files: string[],
  timestamp: number
): Promise<boolean | undefined> {
  if (
    process.env.BIT_RUST_CLIENT_VCS !== 'on' ||
    // Globby treats backslashes as pattern escapes, even on Windows. Resolving
    // that spelling as a filesystem path would change its directory selection.
    root.includes('\\') ||
    timestampVersion !== '11.0.1' ||
    timestampFs.stat !== originalTimestampFs.stat ||
    !canReadModificationTimestampsNatively() ||
    !Number.isSafeInteger(timestamp)
  )
    return undefined;
  return request((session) =>
    session.dependencyCacheStale(
      path.resolve(root),
      files.map((file) => path.resolve(file)),
      timestamp
    )
  );
}
