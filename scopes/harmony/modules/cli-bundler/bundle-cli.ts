/* eslint-disable no-console */
import fs from 'fs-extra';
import { join } from 'path';
import { getBundlePaths, DEFAULT_OUT_DIR } from './config';
import { getCoreAspectsInfo, getExtraPackages } from './core-aspects-info';
import { getExternals } from './externals';
import { generateEntry } from './generate-entry';
import { runEsbuild } from './run-esbuild';
import { buildWorkers } from './build-workers';
import { buildSea } from './build-sea';
import { generateShimPackages } from './generate-shim-packages';
import { generateEsmBridges } from './generate-esm-bridges';
import { generateBin } from './generate-bin';
import { generateNpmrc } from './generate-npmrc';
import { generatePackageJson } from './create-package-json';
import { copyAssets } from './copy-assets';

/**
 * The one implementation of "produce a bundled bit CLI".
 *
 * Two callers share it and must never diverge:
 *  - `npm run bundle` in this repo, for local iteration (`scopes/harmony/bit/bundle/bundle.ts`);
 *  - the `BundleCliAppTask` build task of `teambit.harmony/envs/bit-cli-app-env`, which produces
 *    what actually ships inside `@teambit/bit`.
 *
 * Everything environment-specific is a parameter, so neither caller needs a copy of the logic:
 *  - `coreAspectIds` — supplied by the caller (see `getCoreAspectsInfo` for why it is not imported);
 *  - `packagesRoot` — where to read the compiled `@teambit/*` packages from. The repo root locally,
 *    the capsule during a build.
 */
export type BundleCliOptions = {
  /** where the compiled `@teambit/*` packages live (repo root, or a capsule dir) */
  packagesRoot: string;
  /** ids of every core aspect, e.g. `teambit.workspace/workspace` */
  coreAspectIds: string[];
  /** where the distribution is written */
  outDir?: string;
  minify?: boolean;
  sourcemap?: boolean;
  /** also build a node single executable */
  sea?: boolean;
  /** include the UI/preview bundling externals - see `externals.ts`, costs ~1.1GB */
  uiBundling?: boolean;
  /** wipe the out dir first, keeping the installed externals */
  clean?: boolean;
  /**
   * The out dir **is** an existing package root that should become the distribution - i.e. the
   * capsule of `@teambit/bit` during a build, whose contents get published as the package.
   *
   * Changes three things versus writing a standalone prototype dir:
   *  - never clean (the out dir holds the component's own sources and dist);
   *  - merge into the existing package.json instead of writing a stand-in;
   *  - no `.npmrc`, which only exists to make the prototype's local `npm install` work.
   */
  inPlace?: boolean;
};

export type BundleCliResult = {
  outDir: string;
  bundleFile: string;
  bundleSizeMb: number;
  coreAspects: number;
  extraPackages: string[];
  aspectsWithoutMainRuntime: string[];
  uiBundlingExternals: boolean;
  externalsInstalled: number;
  externalsUnresolved: string[];
  assetsCopied: number;
  workers: string[];
  esmBridges: { generated: number; skipped: number };
  /** `.d.ts` files copied into the shims, and how many shims got any */
  typeFiles: number;
  shimsWithTypes: number;
  sea?: { exePath: string; sizeMb: number; nodeVersion: string };
  errors: number;
  warnings: number;
};

/** Wipe every generated artefact but keep the installed externals. */
async function cleanOutDir(paths: ReturnType<typeof getBundlePaths>) {
  const entries = await fs.readdir(paths.rootOutDir).catch(() => [] as string[]);
  // everything else is generated; `node_modules` holds the installed externals, which take ~30s to
  // reinstall and only change when the externals list does.
  await Promise.all(entries.filter((e) => e !== 'node_modules').map((e) => fs.remove(join(paths.rootOutDir, e))));
}

async function readBitVersion(packagesRoot: string): Promise<string> {
  const { version } = await fs.readJson(join(packagesRoot, 'node_modules', '@teambit', 'bit', 'package.json'));
  return version;
}

export async function bundleCli(options: BundleCliOptions): Promise<BundleCliResult> {
  const { packagesRoot, coreAspectIds } = options;
  const paths = getBundlePaths(packagesRoot, options.outDir || DEFAULT_OUT_DIR);
  console.log(`[bundle] packages: ${packagesRoot}`);
  console.log(`[bundle] output:   ${paths.rootOutDir}`);

  // never clean in place: the out dir is the capsule, holding the component's own sources and dist
  if (options.clean ?? !options.inPlace) await cleanOutDir(paths);
  await fs.ensureDir(paths.bundleDir);

  const aspects = await getCoreAspectsInfo(coreAspectIds, packagesRoot);
  const withoutRuntime = aspects.filter((a) => !a.mainRuntimeImport).map((a) => a.id);
  console.log(`[bundle] core aspects: ${aspects.length} (${withoutRuntime.length} without a main runtime)`);

  const extraPackages = getExtraPackages(packagesRoot);
  const { entryFilePath, seaEntryFilePath, exportsByPackage } = await generateEntry(
    paths.generatedDir,
    aspects,
    extraPackages
  );
  const externals = getExternals({ uiBundling: options.uiBundling });

  const result = await runEsbuild({
    entryFilePath,
    outFilePath: paths.appFilePath,
    repoRoot: packagesRoot,
    externals,
    minify: options.minify,
    sourcemap: options.sourcemap,
  });

  const workers = await buildWorkers(paths, externals);
  const bitVersion = await readBitVersion(packagesRoot);
  const shims = await generateShimPackages(paths, aspects, extraPackages);
  await generateBin(paths);
  const assetCount = await copyAssets(paths);
  const esmBridges = await generateEsmBridges(paths, exportsByPackage);
  if (!options.inPlace) generateNpmrc(paths.rootOutDir);
  const { dependencies, unresolved } = await generatePackageJson(paths, bitVersion, externals, {
    inPlace: options.inPlace,
  });
  const sea = options.sea ? await buildSea(paths, seaEntryFilePath, { minify: options.minify, externals }) : undefined;

  if (result.metafile) {
    await fs.writeJson(join(paths.bundleDir, 'metafile.json'), result.metafile, { spaces: 2 });
  }

  const { size } = await fs.stat(paths.appFilePath);
  return {
    outDir: paths.rootOutDir,
    bundleFile: paths.appFilePath,
    bundleSizeMb: +(size / 1024 / 1024).toFixed(2),
    coreAspects: aspects.length,
    extraPackages,
    aspectsWithoutMainRuntime: withoutRuntime,
    uiBundlingExternals: Boolean(options.uiBundling),
    externalsInstalled: Object.keys(dependencies).length,
    externalsUnresolved: unresolved,
    assetsCopied: assetCount,
    workers: workers.map((w) => w.outPath),
    esmBridges,
    typeFiles: shims.typeFiles,
    shimsWithTypes: shims.shimsWithTypes,
    sea,
    errors: result.errors.length,
    warnings: result.warnings.length,
  };
}
