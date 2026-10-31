// The released Bit reference predates the upstream pnpm dependency update. Resolve
// that one dependency to the published upstream version without changing Bit's
// installed files or replacing any installer behavior. Remove this bridge when
// the pinned Bit release includes @pnpm/napi 12.16.0.
const Module = require('node:module');
const engine = require.resolve('@pnpm/napi');
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  return request === '@pnpm/napi' ? engine : resolveFilename.call(this, request, ...args);
};
