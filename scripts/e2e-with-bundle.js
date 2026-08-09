#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Run the e2e suite against the *bundled* bit instead of the repo's `bd` binary.
 *
 *   npm run e2e-test:bundle              # the script distribution
 *   npm run e2e-test:sea                 # the single executable
 *   npm run e2e-test:bundle -- --force   # rebuild even if the bundle looks current
 *   npm run e2e-test:bundle -- --circle  # the CircleCI mocha reporter/flags
 *
 * The bundle is built at most once per machine: `ensureBundle` compares a stamp (bit version, node,
 * platform, newest `dist` mtime across all workspace components, bundler mtimes, externals list)
 * against the one recorded in the out dir, and only rebuilds on a mismatch. That gives CI a single
 * build per split machine, and gives a local run an automatic rebuild whenever anything was
 * recompiled - without ever rebuilding twice for the same sources.
 *
 * Anything after `--` that isn't recognised here is forwarded to mocha, so `.only`-style workflows
 * and explicit spec paths keep working.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const argv = process.argv.slice(2);

const take = (flag) => {
  const i = argv.indexOf(flag);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  argv.splice(i, 2);
  return value;
};
const takeBool = (flag) => {
  const i = argv.indexOf(flag);
  if (i === -1) return false;
  argv.splice(i, 1);
  return true;
};

const sea = takeBool('--sea');
const force = takeBool('--force');
const noBuild = takeBool('--no-build');
const uiBundling = takeBool('--ui-bundling');
const circle = takeBool('--circle');
const debug = takeBool('--debug');
const outDir = take('--out-dir');
const mochaArgs = argv; // whatever is left

async function main() {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const { ensureBundle } = require(path.join(repoRoot, 'node_modules/@teambit/bit/dist/bundle/ensure-bundle.js'));
  const result = await ensureBundle(repoRoot, { outDir, sea, uiBundling, force, noBuild });
  console.log(`[e2e-with-bundle] ${result.built ? 'built' : 'reused'} ${result.outDir} (${result.reason})`);
  console.log(`[e2e-with-bundle] bit_bin = ${result.bitBin}`);

  const prepare = spawnSync('npx', ['registry-mock', 'prepare'], { cwd: repoRoot, stdio: 'inherit' });
  if (prepare.status !== 0) process.exit(prepare.status ?? 1);

  const mocha = [
    '--require',
    './babel-register',
    ...(circle
      ? [
          '--reporter',
          'mocha-multi-reporters',
          '--reporter-options',
          'configFile=mocha-multi-reporters-config.json',
          '--colors',
          '--exit',
        ]
      : []),
    ...(mochaArgs.length ? mochaArgs : ['./e2e/**/*.e2e*.ts']),
  ];

  const env = {
    ...process.env,
    // `CommandHelper.getBitBin()` reads this first; it accepts a full command, not only a bin name
    npm_config_bit_bin: result.bitBin,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --no-warnings --max-old-space-size=5000`.trim(),
    ...(debug ? { npm_config_debug: 'true' } : {}),
  };

  const run = spawnSync('npx', ['mocha', ...mocha], { cwd: repoRoot, stdio: 'inherit', env });
  process.exit(run.status ?? 1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
