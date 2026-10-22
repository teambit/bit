'use strict';

// Native CJS so Babel's modules-commonjs transform leaves the import() alone.
// @pnpm/deps.path and @pnpm/config.parse-overrides are ESM-only and must go
// through Node's ESM loader. deps.path stays a JS dependency deliberately: it
// is pure dep-path string parsing, and its helpers run once per graph edge —
// often millions of times per workspace — which is exactly the shape that does
// not belong behind an FFI call.
let esmPromise;
exports.loadEsm = async () => {
  esmPromise ??= Promise.all([import('@pnpm/deps.path'), import('@pnpm/config.parse-overrides')]).then(
    ([dp, { parseOverrides }]) => ({ dp, parseOverrides })
  );
  return esmPromise;
};
