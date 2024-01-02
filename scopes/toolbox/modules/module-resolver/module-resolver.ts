import { sync as resolveSync } from 'resolve';

export function resolveFrom(fromDir: string, moduleIds: string[]) {
  if (moduleIds.length === 0) return fromDir;
  const [moduleId, ...rest] = moduleIds;
  // We use the "resolve" library because the native "require.resolve" method uses a cache.
  // So with the native resolve method we cannot check the same path twice.
  return resolveFrom(resolveSync(moduleId, { basedir: fromDir, preserveSymlinks: false }), rest);
}
