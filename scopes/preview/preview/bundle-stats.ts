import { join } from 'path';
import { mkdirpSync, writeFileSync } from 'fs-extra';

/**
 * Same switch and output format as the UI bundle's `rspack/bundle-stats.ts`, so one build with
 * `BIT_UI_BUNDLE_STATS=1` produces stats for the ui and preview bundles together and
 * `scripts/analyze-bundle.mjs` reads them the same way.
 *
 * Deliberately a small copy rather than an import from `@teambit/ui`: that package's index is
 * imported by browser code, and pulling a node-only module through it drags `fs` polyfills into
 * the UI bundle.
 */
export const BUNDLE_STATS_ENV_VAR = 'BIT_UI_BUNDLE_STATS';

function bundleStatsDir(): string | undefined {
  const value = process.env[BUNDLE_STATS_ENV_VAR];
  if (!value) return undefined;
  if (value === '1' || value === 'true') return join(process.cwd(), 'bundle-stats');
  return value;
}

/**
 * Write an rspack stats file for a finished compilation. Written outside the output directory: the
 * build task's artifact glob matches everything under it, so a stats file placed there would ship.
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
  // sanitized for the same reason as the ui twin: a name carrying a path separator would point the
  // write at a directory that does not exist and fail with ENOENT.
  const filePath = join(dir, `${name.replace(/[^a-zA-Z0-9._-]+/g, '-')}.stats.json`);
  writeFileSync(filePath, JSON.stringify(json));
  return filePath;
}
