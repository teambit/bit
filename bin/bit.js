#!/usr/bin/env node

// Enable node's built-in compile cache before requiring the app: bit compiles ~1,200 modules on
// every invocation, and reusing their V8 bytecode cuts startup measurably (0.87s -> 0.71s on a
// one-component workspace). Location follows NODE_COMPILE_CACHE, else a dir under os.tmpdir().
// This is node's own mechanism (>= 22.1), not the `v8-compile-cache` package dropped in 2024
// (7a159b374) which patched Module._compile and broke on ESM. BIT_NO_COMPILE_CACHE=1 opts out.
if (!process.env.BIT_NO_COMPILE_CACHE) {
  try {
    require('module').enableCompileCache();
  } catch {
    // unsupported node, or an unwritable cache dir: startup simply stays uncached.
  }
}

require('../node_modules/@teambit/bit/dist/app');
