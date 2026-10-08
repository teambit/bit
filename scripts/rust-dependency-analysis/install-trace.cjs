// Install validation only: observe the real engine call without replacing it or logging credentials.
const { isTraceOwner } = require('./command-trace.cjs');
const fs = require('node:fs');
const path = require('node:path');
const calls = [];
let treeCalls = 0;
const Module = require('node:module');
const originalLoad = Module._load;
const wrappedTrees = new WeakSet();
const wrappedApis = new WeakSet();
function wrapApi(api) {
  if (wrappedApis.has(api)) return;
  wrappedApis.add(api);
  const install = api.install;
  api.install = function (options, ...rest) {
    for (const key of ['dir', 'storeDir', 'cacheDir']) {
      const root = process.env.BIT_INSTALL_VALIDATION_ROOT;
      if (
        !options[key] ||
        !(path.resolve(options[key]) === root || path.resolve(options[key]).startsWith(root + path.sep))
      )
        throw new Error(`install validation refuses external ${key}: ${options[key]}`);
    }
    for (const project of options.projects || []) {
      if (
        path.resolve(project.rootDir) !== process.env.BIT_INSTALL_VALIDATION_ROOT &&
        !path.resolve(project.rootDir).startsWith(process.env.BIT_INSTALL_VALIDATION_ROOT + path.sep)
      )
        throw new Error(`install validation refuses external project: ${project.rootDir}`);
    }
    // Registry/auth/proxy options are deliberately excluded from the report.
    calls.push({
      projects: JSON.parse(JSON.stringify(options.projects)),
      dir: options.dir,
      storeDir: options.storeDir,
      cacheDir: options.cacheDir,
      lockfileOnly: options.lockfileOnly,
      offline: options.offline ?? false,
    });
    return install.call(this, options, ...rest);
  };
}

Module._load = function (...args) {
  const exports = originalLoad.apply(this, args);
  if (args[0] === '@pnpm/napi' && typeof exports?.install === 'function') wrapApi(exports);
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
process.on('exit', () => {
  if (process.env.BIT_INSTALL_VALIDATION_TRACE && isTraceOwner)
    fs.writeFileSync(process.env.BIT_INSTALL_VALIDATION_TRACE, JSON.stringify({ calls, treeCalls }));
});
