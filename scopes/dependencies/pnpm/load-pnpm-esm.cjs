'use strict';

// Native CJS so Babel's modules-commonjs transform leaves the import() alone.
// @pnpm/deps.path and @pnpm/lockfile.fs are ESM-only and must go through
// Node's ESM loader.
exports.loadEsm = async () => {
  const [dp, lockfileFs] = await Promise.all([
    import('@pnpm/deps.path'),
    import('@pnpm/lockfile.fs'),
  ]);
  return { dp, getLockfileImporterId: lockfileFs.getLockfileImporterId };
};
