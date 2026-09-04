import { join } from 'path';
import { mkdirpSync, writeFileSync } from 'fs-extra';

/**
 * Set to a directory to write a stats file per compilation, or to `1`/`true` to write them under
 * `<cwd>/bundle-stats`. Off by default: collecting the module graph is not free, and the stats file
 * is far larger than the bundle it describes.
 */
export const BUNDLE_STATS_ENV_VAR = 'BIT_UI_BUNDLE_STATS';

export function bundleStatsDir(): string | undefined {
  const value = process.env[BUNDLE_STATS_ENV_VAR];
  if (!value) return undefined;
  if (value === '1' || value === 'true') return join(process.cwd(), 'bundle-stats');
  return value;
}

/**
 * Write an rspack stats file for a finished compilation, for `scripts/analyze-bundle.mjs` to read.
 *
 * Deliberately written outside the output directory: everything under an output dir is matched by
 * the build task's artifact glob, so a stats file placed there would ship inside the package.
 */
export function writeBundleStats(stats: any, name: string): string | undefined {
  const dir = bundleStatsDir();
  if (!dir || !stats) return undefined;
  const json = stats.toJson({
    all: false,
    assets: true,
    chunks: true,
    chunkModules: true,
    modules: true,
    reasons: false,
    source: false,
    // rspack otherwise collapses assets and modules into summary rows ("assets by status", …) that
    // carry a size but no name, which reads as one large unattributable bucket in any analysis.
    cachedAssets: true,
    cachedModules: true,
    orphanModules: true,
    nestedModules: true,
    groupAssetsByStatus: false,
    groupAssetsByEmitStatus: false,
    groupAssetsByInfo: false,
    groupAssetsByPath: false,
    groupAssetsByExtension: false,
    groupAssetsByChunk: false,
    groupModulesByStatus: false,
    groupModulesByAttributes: false,
    groupModulesByPath: false,
    groupModulesByExtension: false,
    groupModulesByType: false,
    groupModulesByCacheStatus: false,
    groupModulesByLayer: false,
  });
  mkdirpSync(dir);
  // `name` comes from a ui root's name, which can contain a path separator; left as-is it would
  // point the write at a directory that does not exist and fail with ENOENT.
  const filePath = join(dir, `${name.replace(/[^a-zA-Z0-9._-]+/g, '-')}.stats.json`);
  writeFileSync(filePath, JSON.stringify(json));
  return filePath;
}
