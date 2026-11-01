#!/usr/bin/env node

// Enable node's built-in compile cache before requiring the app: bit compiles ~1,200 modules on
// every invocation, and reusing their V8 bytecode cuts startup measurably (0.87s -> 0.71s on a
// one-component workspace). Location follows NODE_COMPILE_CACHE, else a dir under os.tmpdir().
// This is node's own mechanism (>= 22.1), not the `v8-compile-cache` package dropped in 2024
// (7a159b374) which patched Module._compile and broke on ESM. BIT_NO_COMPILE_CACHE=1 opts out.
// libuv runs async fs calls on a thread-pool of 4 threads by default. on macOS (APFS), file create/rename calls are
// slow, and with 4 threads bit's concurrent object writes (import/export/tag) are effectively serialized: writing 12k
// object files took ~14s with 4 threads and ~2s with 16. on Linux (ext4), more threads made it slower (same-directory
// creates/renames serialize on the dir lock), so the libuv default is kept there. it must be set before the pool is
// first used. a user-provided value wins. child processes inherit it, which is intended (they hit the same APFS cost).
if (process.platform === 'darwin' && !process.env.UV_THREADPOOL_SIZE) process.env.UV_THREADPOOL_SIZE = '16';

if (!process.env.BIT_NO_COMPILE_CACHE) {
  try {
    require('module').enableCompileCache();
  } catch {
    // unsupported node, or an unwritable cache dir: startup simply stays uncached.
  }
}

require('../node_modules/@teambit/bit/dist/app');
