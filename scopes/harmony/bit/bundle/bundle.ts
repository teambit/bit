/* eslint-disable no-console */
import fs from 'fs-extra';
import { join } from 'path';
import { getBundlePaths, DEFAULT_OUT_DIR, BUNDLE_DIR_NAME } from './config';
import { getCoreAspectsInfo } from './core-aspects-info';
import { getExternals } from './externals';
import { generateEntry } from './generate-entry';
import { runEsbuild } from './run-esbuild';
import { generateShimPackages } from './generate-shim-packages';
import { generatePackageJson } from './create-package-json';
import { generateNpmrc } from './generate-npmrc';
import { copyAssets } from './copy-assets';
import { generateBin } from './generate-bin';
import { buildWorkers } from './build-workers';
import { generateEsmBridges } from './generate-esm-bridges';
import { buildSea } from './build-sea';

type Argv = { outDir: string; minify: boolean; sourcemap: boolean; clean: boolean; sea: boolean; uiBundling: boolean };

function parseArgv(argv: string[]): Argv {
  const get = (flag: string) => {
    const idx = argv.indexOf(flag);
    return idx === -1 ? undefined : argv[idx + 1];
  };
  return {
    outDir: get('--out-dir') || process.env.BIT_BUNDLE_OUT_DIR || DEFAULT_OUT_DIR,
    minify: argv.includes('--minify'),
    sourcemap: argv.includes('--sourcemap'),
    clean: !argv.includes('--no-clean'),
    sea: argv.includes('--sea'),
    uiBundling: argv.includes('--ui-bundling'),
  };
}

async function runBundle() {
  const argv = parseArgv(process.argv.slice(2));
  const repoRoot = process.cwd();
  const paths = getBundlePaths(repoRoot, argv.outDir);
  console.log(`[bundle] repo:   ${paths.repoRoot}`);
  console.log(`[bundle] output: ${paths.rootOutDir}`);

  if (argv.clean) await cleanOutDir(paths);
  await fs.ensureDir(paths.bundleDir);

  const aspects = await getCoreAspectsInfo();
  const withoutRuntime = aspects.filter((a) => !a.mainRuntimeImport).map((a) => a.id);
  console.log(`[bundle] core aspects: ${aspects.length} (${withoutRuntime.length} without a main runtime)`);

  const { entryFilePath, seaEntryFilePath, exportsByPackage } = await generateEntry(paths.generatedDir, aspects);
  const externals = getExternals({ uiBundling: argv.uiBundling });

  const result = await runEsbuild({
    entryFilePath,
    outFilePath: paths.appFilePath,
    repoRoot,
    externals,
    minify: argv.minify,
    sourcemap: argv.sourcemap,
  });

  const workers = await buildWorkers(paths, externals);
  const bitVersion = await getBitVersionFromRepo(repoRoot);
  await generateShimPackages(paths, aspects);
  await generateBin(paths);
  const assetCount = await copyAssets(paths);
  const esmBridges = await generateEsmBridges(paths, exportsByPackage);
  generateNpmrc(paths.bundleDir);
  const { dependencies, unresolved } = await generatePackageJson(paths, bitVersion, externals);

  const sea = argv.sea ? await buildSea(paths, seaEntryFilePath, { minify: argv.minify, externals }) : undefined;

  if (result.metafile) {
    await fs.writeJson(join(paths.bundleDir, 'metafile.json'), result.metafile, { spaces: 2 });
  }

  const { size } = await fs.stat(paths.appFilePath);
  const summary = {
    outDir: paths.rootOutDir,
    bundleFile: paths.appFilePath,
    bundleSizeMb: +(size / 1024 / 1024).toFixed(2),
    coreAspects: aspects.length,
    aspectsWithoutMainRuntime: withoutRuntime,
    uiBundlingExternals: argv.uiBundling,
    externalsInstalled: Object.keys(dependencies).length,
    externalsUnresolved: unresolved,
    assetsCopied: assetCount,
    workers: workers.map((w) => w.outPath),
    esmBridges,
    sea,
    errors: result.errors.length,
    warnings: result.warnings.length,
  };
  console.log(`\n[bundle] done:\n${JSON.stringify(summary, null, 2)}`);
  console.log(
    `\nnext:\n  cd ${paths.bundleDir} && npm install\n  node ${paths.rootOutDir}/node_modules/@teambit/bit/bin/bit --version`
  );
  return summary;
}

/**
 * Wipe every generated artefact but keep `bundle/node_modules` - the installed externals. They take
 * ~30s to reinstall and are only invalidated when `externals.ts` changes, so removing them on every
 * rebuild would make the edit/build/test loop needlessly slow.
 */
async function cleanOutDir(paths: ReturnType<typeof getBundlePaths>) {
  const keep = join(paths.bundleDir, 'node_modules');
  const entries = await fs.readdir(paths.rootOutDir).catch(() => [] as string[]);
  await Promise.all(entries.filter((e) => e !== BUNDLE_DIR_NAME).map((e) => fs.remove(join(paths.rootOutDir, e))));
  const bundleEntries = await fs.readdir(paths.bundleDir).catch(() => [] as string[]);
  await Promise.all(
    bundleEntries
      .map((entry) => join(paths.bundleDir, entry))
      .filter((entryPath) => entryPath !== keep)
      .map((entryPath) => fs.remove(entryPath))
  );
}

async function getBitVersionFromRepo(repoRoot: string): Promise<string> {
  const pkgJsonPath = join(repoRoot, 'node_modules', '@teambit', 'bit', 'package.json');
  const { version } = await fs.readJson(pkgJsonPath);
  return version;
}

runBundle().catch((err) => {
  console.error(err);
  process.exit(1);
});
