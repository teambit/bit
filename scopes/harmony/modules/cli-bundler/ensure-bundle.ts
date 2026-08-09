/* eslint-disable no-console */
import fs from 'fs-extra';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { join } from 'path';
import type { BundlePaths } from './config';
import { getBundlePaths, DEFAULT_OUT_DIR } from './config';
import { getExternals } from './externals';

/**
 * "Is the bundle at <out-dir> still the bundle these sources produce?"
 *
 * This exists for the e2e runners. Two situations have to be served by one rule:
 *
 *  - **CI**, where the suite is split across many fresh machines. Each machine must build once and
 *    then reuse across every mocha invocation on that machine - rebuilding per invocation would
 *    dominate the run.
 *  - **local**, where an `/tmp/bit-bundle` from yesterday is probably stale and silently testing the
 *    wrong code is worse than a rebuild.
 *
 * One rule covers both: **build if and only if the stamp doesn't match.** On CI the second and later
 * invocations match (nothing changed) and skip; locally, recompiling any component or editing the
 * bundler changes the stamp and forces a rebuild.
 */

export type StampInputs = {
  bitVersion: string;
  node: string;
  platform: string;
  arch: string;
  /** newest mtime across every compiled workspace component - the actual bundle input */
  distFingerprint: string;
  /** the bundler's own sources */
  bundlerFingerprint: string;
  /** externals change what gets installed next to the bundle */
  externalsHash: string;
  sea: boolean;
  uiBundling: boolean;
};

const STAMP_FILE = 'bundle-stamp.json';

function hash(value: string) {
  return createHash('sha1').update(value).digest('hex').slice(0, 16);
}

/**
 * Newest mtime over the `dist` dir of every workspace component. ~330 `stat` calls, a few ms - much
 * cheaper than walking the files, and it moves whenever `bit compile` writes anything.
 */
async function fingerprintDists(repoRoot: string): Promise<string> {
  const teambitDir = join(repoRoot, 'node_modules', '@teambit');
  let entries: string[] = [];
  try {
    entries = await fs.readdir(teambitDir);
  } catch {
    return 'no-node-modules';
  }
  let newest = 0;
  let counted = 0;
  await Promise.all(
    entries.map(async (entry) => {
      try {
        const stat = await fs.stat(join(teambitDir, entry, 'dist'));
        counted += 1;
        if (stat.mtimeMs > newest) newest = stat.mtimeMs;
      } catch {
        // not a compiled workspace component
      }
    })
  );
  return `${counted}:${Math.round(newest)}`;
}

async function fingerprintBundler(repoRoot: string): Promise<string> {
  const bundlerDir = join(repoRoot, 'node_modules', '@teambit', 'bit', 'dist', 'bundle');
  const parts: string[] = [];
  const walk = async (dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        // eslint-disable-next-line no-await-in-loop
        await walk(full);
      } else if (entry.name.endsWith('.js')) {
        // eslint-disable-next-line no-await-in-loop
        const stat = await fs.stat(full);
        parts.push(`${entry.name}:${Math.round(stat.mtimeMs)}`);
      }
    }
  };
  await walk(bundlerDir);
  return hash(parts.sort().join('|'));
}

async function computeStamp(repoRoot: string, opts: { sea: boolean; uiBundling: boolean }): Promise<StampInputs> {
  const { version } = await fs.readJson(join(repoRoot, 'node_modules', '@teambit', 'bit', 'package.json'));
  return {
    bitVersion: version,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    distFingerprint: await fingerprintDists(repoRoot),
    bundlerFingerprint: await fingerprintBundler(repoRoot),
    externalsHash: hash(getExternals({ uiBundling: opts.uiBundling }).join(',')),
    sea: opts.sea,
    uiBundling: opts.uiBundling,
  };
}

async function readStamp(paths: BundlePaths): Promise<StampInputs | undefined> {
  try {
    return await fs.readJson(join(paths.rootOutDir, STAMP_FILE));
  } catch {
    return undefined;
  }
}

function stampMatches(a: StampInputs | undefined, b: StampInputs): { match: boolean; reason?: string } {
  if (!a) return { match: false, reason: 'no previous build' };
  const differing = (Object.keys(b) as Array<keyof StampInputs>).filter((key) => a[key] !== b[key]);
  // a stamp with `sea: true` also satisfies a non-sea request - the script bundle is built either way
  const meaningful = differing.filter((key) => !(key === 'sea' && a.sea && !b.sea));
  if (!meaningful.length) return { match: true };
  return { match: false, reason: meaningful.map((key) => `${key} changed`).join(', ') };
}

function runStep(cmd: string, args: string[], cwd: string) {
  console.log(`[ensure-bundle] ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });
}

export type EnsureOptions = {
  outDir?: string;
  sea?: boolean;
  uiBundling?: boolean;
  /** rebuild even if the stamp matches */
  force?: boolean;
  /** never build; fail if the bundle is missing or stale (useful to assert CI prepared it) */
  noBuild?: boolean;
};

export type EnsureResult = {
  built: boolean;
  reason: string;
  outDir: string;
  /** what to hand the e2e helper as `--bit_bin` */
  bitBin: string;
};

export async function ensureBundle(repoRoot: string, opts: EnsureOptions = {}): Promise<EnsureResult> {
  const paths = getBundlePaths(repoRoot, opts.outDir || process.env.BIT_BUNDLE_OUT_DIR || DEFAULT_OUT_DIR);
  const sea = Boolean(opts.sea);
  const wanted = await computeStamp(repoRoot, { sea, uiBundling: Boolean(opts.uiBundling) });
  const existing = await readStamp(paths);
  const { match, reason } = stampMatches(existing, wanted);

  const artifact = sea ? join(paths.rootOutDir, 'bit-app') : paths.appFilePath;
  const artifactExists = await fs.pathExists(artifact);
  const upToDate = match && artifactExists && !opts.force;

  const bitBin = sea ? join(paths.rootOutDir, 'bit-app') : `node ${join(paths.rootOutDir, 'bin', 'bit')}`;

  if (upToDate) {
    console.log(`[ensure-bundle] reusing ${paths.rootOutDir} (stamp matches)`);
    return { built: false, reason: 'up to date', outDir: paths.rootOutDir, bitBin };
  }

  const why = opts.force ? 'forced' : !artifactExists ? 'artifact missing' : reason || 'stale';
  if (opts.noBuild) {
    throw new Error(`[ensure-bundle] ${paths.rootOutDir} is not usable (${why}) and --no-build was given`);
  }

  console.log(`[ensure-bundle] building (${why})`);
  const bundlerEntry = join(repoRoot, 'node_modules', '@teambit', 'bit', 'dist', 'bundle', 'bundle.js');
  const args = [bundlerEntry, '--out-dir', paths.rootOutDir];
  if (sea) args.push('--sea');
  if (opts.uiBundling) args.push('--ui-bundling');
  runStep(process.execPath, args, repoRoot);
  // the externals are ordinary dependencies of the distribution's package.json, so they install
  // into its root `node_modules`. a clean rebuild deliberately keeps that directory, so this is a
  // no-op on a warm machine and the real install on a cold one.
  runStep('npm', ['install', '--no-audit', '--no-fund', '--loglevel', 'error'], paths.rootOutDir);

  await fs.writeJson(join(paths.rootOutDir, STAMP_FILE), wanted, { spaces: 2 });
  return { built: true, reason: why, outDir: paths.rootOutDir, bitBin };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  ensureBundle(process.cwd(), {
    outDir: get('--out-dir'),
    sea: argv.includes('--sea'),
    uiBundling: argv.includes('--ui-bundling'),
    force: argv.includes('--force'),
    noBuild: argv.includes('--no-build'),
  })
    .then((res) => {
      console.log(JSON.stringify(res, null, 2));
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
