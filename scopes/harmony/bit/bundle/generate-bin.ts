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
  const binDir = join(paths.rootOutDir, 'node_modules', '@teambit', 'bit', 'bin');
  await fs.ensureDir(binDir);
  const relPath = relative(binDir, paths.appFilePath).split('\\').join('/');
  // V8 has to parse and compile the whole bundle on every invocation, which costs more than the
  // thousands of small `require`s it replaced (measured: 1.07s vs 0.70s for `bit --help`). Node's
  // on-disk compile cache turns that into a one-off - the same 1.07s drops to 0.62s. `try/catch`
  // because `enableCompileCache` only exists from node 22.1.
  const content = [
    `#!/usr/bin/env node`,
    `try { require('module').enableCompileCache(); } catch {}`,
    `require(${JSON.stringify(relPath)}).runBitApp();`,
    ``,
  ].join('\n');
  const binFile = join(binDir, 'bit');
  await fs.writeFile(binFile, content);
  await fs.chmod(binFile, 0o755);
  return binFile;
}
