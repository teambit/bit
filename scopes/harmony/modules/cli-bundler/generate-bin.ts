import fs from 'fs-extra';
import { join, relative } from 'path';
import type { BundlePaths } from './config';

/**
 * The launcher. bvm (and `npm i -g`) invoke `<bit-package>/bin/bit`, so the bundled distribution
 * must expose the same entry point.
 *
 * Note it *calls* `runBitApp()` rather than relying on an import side effect. The bundle is also
 * `require`d by every `@teambit/*` shim, and a bundle that starts the CLI on import would boot bit
 * whenever a user's code imports a core aspect.
 */
export async function generateBin(paths: BundlePaths) {
  // the package root's bin/, which is what package.json's `bin` field and bvm point at
  const binDir = join(paths.rootOutDir, 'bin');
  await fs.ensureDir(binDir);
  const relPath = relative(binDir, paths.appFilePath).split('\\').join('/');
  // V8 has to parse and compile the whole bundle on every invocation, which costs more than the
  // thousands of small `require`s it replaced (measured: 1.07s vs 0.70s for `bit --help`). Node's
  // on-disk compile cache turns that into a one-off - the same 1.07s drops to 0.62s. `try/catch`
  // because `enableCompileCache` only exists from node 22.1.
  //
  // The flush right after the require is what makes the cache dependable: node persists the cache
  // it accumulated only when the process tears down gracefully, and bit commands routinely end via
  // `process.exit()` (or get killed by a test-runner timeout) - leaving every invocation cold, which
  // is the ~2s `bit --help` measured on CI. The big compile happens during the `require`, so
  // flushing there captures it deterministically and is a no-op once the cache is warm.
  // `flushCompileCache` exists from node 22.10.
  const content = [
    `#!/usr/bin/env node`,
    `try { require('module').enableCompileCache(); } catch {}`,
    `const { runBitApp } = require(${JSON.stringify(relPath)});`,
    `try { require('module').flushCompileCache(); } catch {}`,
    `runBitApp();`,
    ``,
  ].join('\n');
  const binFile = join(binDir, 'bit');
  await fs.writeFile(binFile, content);
  await fs.chmod(binFile, 0o755);
  return binFile;
}
