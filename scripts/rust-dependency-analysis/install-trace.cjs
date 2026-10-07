// Install validation only: observe the real engine call without replacing it or logging credentials.
const { isTraceOwner } = require('./command-trace.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const load = createRequire(path.join(process.cwd(), 'package.json'));
const api = load('@pnpm/napi');
const install = api.install;
const calls = [];
let treeCalls = 0;
const Module = require('node:module');
const originalLoad = Module._load;
const wrappedTrees = new WeakSet();
Module._load = function (...args) {
  const exports = originalLoad.apply(this, args);
  if (
    typeof args[0] === 'string' &&
    args[0].endsWith('/generate-tree-madge') &&
    typeof exports?.default === 'function' &&
    !wrappedTrees.has(exports)
  ) {
    const generateTree = exports.default;
    exports.default = function (...parameters) {
      treeCalls++;
      return generateTree.apply(this, parameters);
    };
    wrappedTrees.add(exports);
  }
  return exports;
};
api.install = function (options, ...rest) {
  for (const key of ['storeDir', 'cacheDir']) {
    const root = process.env.BIT_INSTALL_VALIDATION_ROOT;
    if (!options[key] || !path.resolve(options[key]).startsWith(root + path.sep))
      throw new Error(`install validation refuses external ${key}: ${options[key]}`);
  }
  // Registry/auth/proxy options are deliberately excluded from the report.
  calls.push({
    projects: JSON.parse(JSON.stringify(options.projects)),
    storeDir: options.storeDir,
    cacheDir: options.cacheDir,
    lockfileOnly: options.lockfileOnly,
    offline: options.offline ?? false,
  });
  return install.call(this, options, ...rest);
};
process.on('exit', () => {
  if (process.env.BIT_INSTALL_VALIDATION_TRACE && isTraceOwner)
    fs.writeFileSync(process.env.BIT_INSTALL_VALIDATION_TRACE, JSON.stringify({ calls, treeCalls }));
});
