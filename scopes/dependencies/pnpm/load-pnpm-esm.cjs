'use strict';

// Native CJS so Babel's modules-commonjs transform leaves the import() alone.
// @pnpm/deps.path is ESM-only and must go through Node's ESM loader. It stays
// a JS dependency deliberately: it is pure dep-path string parsing, and its
// helpers run once per graph edge — often millions of times per workspace —
// which is exactly the shape that does not belong behind an FFI call.
let esmPromise;
exports.loadEsm = async () => {
  esmPromise ??= import('@pnpm/deps.path').then((dp) => ({ dp }));
  return esmPromise;
};
