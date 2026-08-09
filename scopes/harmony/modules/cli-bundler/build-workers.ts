import { build } from 'esbuild';
import { join } from 'path';
import type { BundlePaths } from './config';
import { WORKER_ENTRIES } from './worker-entries';
import { ignoreAssetsPlugin } from './plugins/ignore-assets-plugin';
import { teambitDistResolverPlugin } from './plugins/teambit-dist-resolver-plugin';

/**
 * Each worker is its own self-contained bundle - it runs in a child process that knows nothing
 * about the CLI bundle, so sharing code between them is not possible.
 */
export async function buildWorkers(paths: BundlePaths, externals: string[]) {
  const results = await Promise.all(
    WORKER_ENTRIES.map(async (entry) => {
      const entryPoint = join(paths.packagesRoot, 'node_modules', entry.packageName, entry.sourcePath);
      const outfile = join(paths.bundleDir, entry.outPath);
      const result = await build({
        entryPoints: [entryPoint],
        outfile,
        bundle: true,
        platform: 'node',
        target: 'node20',
        format: 'cjs',
        keepNames: true,
        logLevel: 'warning',
        mainFields: ['main', 'module'],
        external: externals,
        plugins: [teambitDistResolverPlugin(paths.packagesRoot), ignoreAssetsPlugin()],
      });
      return { outPath: entry.outPath, errors: result.errors.length };
    })
  );
  return results;
}
