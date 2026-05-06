'use strict';

// Native CJS so Babel's modules-commonjs transform leaves the import() alone;
// @pnpm/releasing.commands is ESM-only and must go through Node's ESM loader.
exports.loadPack = async () => {
  const mod = await import('@pnpm/releasing.commands');
  return mod.pack;
};
