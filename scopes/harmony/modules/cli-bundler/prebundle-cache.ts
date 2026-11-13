/* eslint-disable no-console */
import fs from 'fs-extra';
import { execFileSync } from 'child_process';
import { join } from 'path';
import globby from 'globby';

/**
 * Caches the UI/preview pre-bundle artifacts - `@teambit/ui` and `@teambit/preview`'s `artifacts/`
 * trees, produced by the `BundleUI`/`PreBundlePreview` build tasks - across `bit install`s and
 * `node_modules` wipes.
 *
 * Producing these locally needs a real `bit build ... --tasks BundleUI,PreBundlePreview`, which is
 * slow and, on this branch, has repeatedly been blocked by the issues documented in
 * `bundle-plan/21-bit-start-prebundles.md` and `bundle-plan/18-findings-log.md` - so once a good
 * copy exists it is worth keeping around instead of re-deriving it on every `node_modules` reset.
 * This module is a plain file cache, not a builder, and the two directions read from different
 * places - they are not simple mirrors of each other:
 *  - `savePrebundleCache` reads the **capsules** the build task just wrote to (located via
 *    `bit capsule list --json`, since `bit build` never writes artifacts anywhere under this repo's
 *    own `node_modules`) and copies them into `<repoRoot>/.bundle-cache/ui-preview-prebundle`.
 *  - `restorePrebundleCache` copies the other way, from that cache into
 *    `node_modules/@teambit/{ui,preview}/artifacts` - exactly where `generateShimPackages`/
 *    `copyShippedArtifacts` already read them from for a local (`packagesRoot` = repo root) build, so
 *    nothing else about the bundler needs to change.
 */

export const PREBUNDLE_CACHE_DIR_REL = join('.bundle-cache', 'ui-preview-prebundle');
const META_FILE = 'meta.json';

const ASPECTS = [
  { pkg: '@teambit/ui', dir: 'ui' },
  { pkg: '@teambit/preview', dir: 'preview' },
] as const;

export type PrebundleCacheMeta = {
  /** git commit the artifacts were built from */
  commit: string;
  /** ISO timestamp of when they were captured into the cache */
  capturedAt: string;
  /** the `@teambit/bit` version they were built with, kept as a sanity check, not enforced */
  bitVersion: string;
  /** file count per aspect, for a quick sanity check without unpacking the cache */
  fileCounts: Record<string, number>;
};

function cacheDir(repoRoot: string): string {
  return join(repoRoot, PREBUNDLE_CACHE_DIR_REL);
}

function artifactsDir(packageDir: string): string {
  return join(packageDir, 'artifacts');
}

function currentCommit(repoRoot: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }).toString().trim();
}

async function countFiles(dir: string): Promise<number> {
  const files = await globby(['**/*'], { cwd: dir, dot: true, onlyFiles: true }).catch(() => []);
  return files.length;
}

export async function readPrebundleCacheMeta(repoRoot: string): Promise<PrebundleCacheMeta | undefined> {
  try {
    return await fs.readJson(join(cacheDir(repoRoot), META_FILE));
  } catch {
    return undefined;
  }
}

export type RestoreResult =
  | { restored: false; reason: string }
  | { restored: true; meta: PrebundleCacheMeta; aspectsRestored: string[] };

/**
 * Copy the cached artifacts into `node_modules/@teambit/{ui,preview}/artifacts`. Never overwrites
 * artifacts that are already there - a real local build (once one can be produced) always wins over
 * the cache; this only fills the gap so `bit start`/the bundle can be exercised without one.
 */
export async function restorePrebundleCache(repoRoot: string): Promise<RestoreResult> {
  const meta = await readPrebundleCacheMeta(repoRoot);
  if (!meta) return { restored: false, reason: 'no cache found' };

  const aspectsRestored: string[] = [];
  for (const aspect of ASPECTS) {
    const packageDir = join(repoRoot, 'node_modules', ...aspect.pkg.split('/'));
    const target = artifactsDir(packageDir);
    // eslint-disable-next-line no-await-in-loop
    if (await fs.pathExists(target)) continue; // a real local build already produced one - keep it
    const source = join(cacheDir(repoRoot), aspect.dir, 'artifacts');
    // eslint-disable-next-line no-await-in-loop
    if (!(await fs.pathExists(source))) continue; // cache is incomplete for this aspect
    // eslint-disable-next-line no-await-in-loop
    await fs.copy(source, target, { dereference: true });
    aspectsRestored.push(aspect.pkg);
  }
  if (!aspectsRestored.length) {
    return { restored: false, reason: 'nothing to restore (artifacts already present, or cache incomplete)' };
  }
  return { restored: true, meta, aspectsRestored };
}

const BUILD_HINT =
  'bit build "teambit.ui-foundation/ui, teambit.preview/preview" --reuse-capsules --tasks "BundleUI,PreBundlePreview"';

/**
 * capsule dir basenames are `<componentId with "/" -> "_">@<version>` (see `bit capsule list --json`
 * - `workspaceCapsulesRootDir` + `capsules`, a flat list of every capsule path currently on disk for
 * this workspace). Mapping is by aspect id, not by npm package name - the two differ
 * (`teambit.ui-foundation/ui` vs. `@teambit/ui`).
 */
const CAPSULE_DIR_PREFIX: Record<(typeof ASPECTS)[number]['dir'], string> = {
  ui: 'teambit.ui-foundation_ui',
  preview: 'teambit.preview_preview',
};

type CapsuleListResult = {
  workspaceCapsulesRootDir: string;
  capsules: string[];
};

function readCapsuleList(repoRoot: string, bitBin: string): CapsuleListResult {
  const raw = execFileSync(bitBin, ['capsule', 'list', '--json'], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 32,
  }).toString();
  try {
    return JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`[prebundle-cache] couldn't parse "${bitBin} capsule list --json" output: ${err.message}`);
  }
}

function findCapsuleDir(list: CapsuleListResult, dirPrefix: string): string | undefined {
  return list.capsules.find((p) => (p.split('/').pop() || '').startsWith(`${dirPrefix}@`));
}

export type SaveOptions = {
  /**
   * the `bit` binary to run `capsule list` with. Must be the **same one the build itself ran with**
   * - `teambit.ui-foundation/ui` and `teambit.preview/preview` are core aspects, so a bvm-linked
   * released `bit` resolves them to its own published packages rather than to this workspace's
   * modified source (see bundle-plan §14 2026-08-18). Defaults to `bit` on `PATH`; override with the
   * `BIT_BIN` env var (same convention as `scripts/circular-deps-check`) - e.g. this repo's own dev
   * binary, `bd`.
   */
  bitBin?: string;
};

/**
 * Copy the capsule output of a real `bit build ... --tasks BundleUI,PreBundlePreview` into the
 * repo-local cache, plus a `meta.json` recording the commit and date they were built from, so a
 * later session can tell the cache is still worth trusting without having to rebuild to find out.
 *
 * Reads directly from the capsules (via `bit capsule list --json`), not from
 * `node_modules/@teambit/{ui,preview}/artifacts` - `bit build` never writes there, only into the
 * capsule, so sourcing from `node_modules` would silently require someone to have copied it there by
 * hand first.
 */
export async function savePrebundleCache(repoRoot: string, opts: SaveOptions = {}): Promise<PrebundleCacheMeta> {
  const bitBin = opts.bitBin || process.env.BIT_BIN || 'bit';
  const list = readCapsuleList(repoRoot, bitBin);
  const fileCounts: Record<string, number> = {};
  await fs.ensureDir(cacheDir(repoRoot));
  for (const aspect of ASPECTS) {
    const capsuleDir = findCapsuleDir(list, CAPSULE_DIR_PREFIX[aspect.dir]);
    if (!capsuleDir) {
      throw new Error(
        `[prebundle-cache] no capsule for ${CAPSULE_DIR_PREFIX[aspect.dir]} under ` +
          `${list.workspaceCapsulesRootDir} - build it first (${BUILD_HINT})`
      );
    }
    const source = artifactsDir(capsuleDir);
    // eslint-disable-next-line no-await-in-loop
    if (!(await fs.pathExists(source))) {
      throw new Error(`[prebundle-cache] ${source} does not exist - re-run the build task (${BUILD_HINT})`);
    }
    const target = join(cacheDir(repoRoot), aspect.dir, 'artifacts');
    // eslint-disable-next-line no-await-in-loop
    await fs.remove(target);
    // eslint-disable-next-line no-await-in-loop
    await fs.copy(source, target, { dereference: true });
    // eslint-disable-next-line no-await-in-loop
    fileCounts[aspect.dir] = await countFiles(target);
  }
  const { version: bitVersion } = await fs.readJson(join(repoRoot, 'node_modules', '@teambit', 'bit', 'package.json'));
  const meta: PrebundleCacheMeta = {
    commit: currentCommit(repoRoot),
    capturedAt: new Date().toISOString(),
    bitVersion,
    fileCounts,
  };
  await fs.writeJson(join(cacheDir(repoRoot), META_FILE), meta, { spaces: 2 });
  return meta;
}

if (require.main === module) {
  const mode = process.argv[2];
  const repoRoot = process.cwd();
  if (mode === 'save') {
    savePrebundleCache(repoRoot)
      .then((meta) => console.log(`[prebundle-cache] saved:\n${JSON.stringify(meta, null, 2)}`))
      .catch((err) => {
        console.error(err.message);
        process.exit(1);
      });
  } else if (mode === 'restore') {
    restorePrebundleCache(repoRoot)
      .then((res) => console.log(`[prebundle-cache] ${JSON.stringify(res, null, 2)}`))
      .catch((err) => {
        console.error(err.message);
        process.exit(1);
      });
  } else {
    console.error('usage: node prebundle-cache.js <save|restore>  (save: set BIT_BIN to override the "bit" on PATH)');
    process.exit(1);
  }
}
