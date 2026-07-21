'use strict';

// Native CJS so Babel's modules-commonjs transform leaves the import() alone.
// @pnpm/deps.path, @pnpm/lockfile.fs, and @pnpm/installing.modules-yaml are
// ESM-only and must go through Node's ESM loader.
let esmPromise;
exports.loadEsm = async () => {
  esmPromise ??= Promise.all([
    import('@pnpm/deps.path'),
    import('@pnpm/lockfile.fs'),
    import('@pnpm/installing.modules-yaml'),
  ]).then(([dp, lockfileFs, modulesYaml]) => ({
    dp,
    lockfileFs,
    modulesYaml,
    getLockfileImporterId: lockfileFs.getLockfileImporterId,
  }));
  return esmPromise;
};
