'use strict';

// Loaded as native CJS so Babel's modules-commonjs transform never sees the
// `import()` call below. @pnpm/releasing.commands is ESM-only in pnpm v11
// and must go through Node's ESM loader.
exports.loadPack = async () => {
  const mod = await import('@pnpm/releasing.commands');
  return mod.pack;
};
