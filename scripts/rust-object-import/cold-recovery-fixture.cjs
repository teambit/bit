const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const merge = require('./merge-transaction-fixture.cjs');
const { captureColdLane } = require('./cold-lane-state.cjs');
const { readTree } = require('./checkout-transition-fixture.cjs');

async function capture(cli, directory) {
  const state = await captureColdLane(cli, directory);
  state.workspaceFiles = await readTree(directory);
  state.workspaceDirectories = await directories(directory);
  const paths = [
    '.bitmap',
    'workspace.jsonc',
    '.bit/staged-snaps',
    '.bit/unmerged.json',
    ...Object.keys(state.workspaceFiles),
    ...state.workspaceDirectories,
    ...Object.keys(state.lastMerged).map((name) => `.bit/last-merged/${name}`),
    ...Object.keys(state.stagedConfig).map((name) => `.bit/staged-config/${name}`),
  ];
  state.permissions = {};
  for (const name of [...new Set(paths)].sort()) {
    const stat = await fs.lstat(path.join(directory, name)).catch((error) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (stat && !stat.isSymbolicLink()) state.permissions[name] = stat.mode & 0o7777;
  }
  return state;
}

async function directories(directory, prefix = '') {
  const result = [];
  for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    if (!prefix && ['.bit', '.git', 'node_modules'].includes(entry.name)) continue;
    if (!entry.isDirectory()) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    result.push(relative, ...(await directories(path.join(directory, entry.name), relative)));
  }
  return result;
}

// Setup always uses public canonical commands. Only the final recovery command
// varies between the JavaScript, prior-wrapper and cold-owner measurements.
const scenarios = [
  { name: 'component-abort-selected', operation: 'componentAbort', selected: true },
  { name: 'component-abort-all', operation: 'componentAbort' },
  { name: 'component-abort-selected-multiple', operation: 'componentAbort', selected: true, multiple: true },
  { name: 'component-abort-all-multiple', operation: 'componentAbort', multiple: true },
  {
    name: 'component-abort-missing-root',
    operation: 'componentAbort',
    missingRoot: true,
    canonicalFallback: 'missing root requires canonical first restoration writer',
    untimed: true,
  },
  { name: 'component-abort-config', operation: 'componentAbort', selected: true, config: true },
  { name: 'component-abort-policy-config', operation: 'componentAbort', selected: true, config: true, policy: true },
  { name: 'component-abort-nonpending', operation: 'componentAbort', nonpending: true, error: true, untimed: true },
  { name: 'component-abort-empty', operation: 'componentAbort', empty: true, error: true, untimed: true },
  { name: 'lane-abort-current', operation: 'laneAbort' },
  { name: 'lane-abort-main', operation: 'laneAbort', main: true },
  { name: 'lane-abort-snapped', operation: 'laneAbort', snapped: true },
  { name: 'lane-abort-main-snapped', operation: 'laneAbort', snapped: true, main: true },
  { name: 'lane-abort-added-directory', operation: 'laneAbort', addition: true },
  { name: 'lane-abort-warm-cache', operation: 'laneAbort', addition: true, warmCache: true },
  { name: 'lane-abort-staged-absent', operation: 'laneAbort', staged: 'absent' },
  {
    name: 'lane-abort-missing-root',
    operation: 'laneAbort',
    missingRoot: true,
    canonicalFallback: 'missing root requires canonical first restoration writer',
    untimed: true,
  },
  { name: 'lane-abort-config', operation: 'laneAbort', config: true },
  { name: 'lane-abort-missing-backup', operation: 'laneAbort', missingBackup: true, error: true, untimed: true },
  {
    name: 'lane-abort-checkout-error',
    operation: 'laneAbort',
    blockedRoot: true,
    canonicalFallback: 'missing main file requires canonical caught-checkout lifecycle',
    untimed: true,
  },
  {
    name: 'reset-pending',
    operation: 'reset',
    canonicalFallback: 'ordinary checkout rejects pending merge context',
    untimed: true,
  },
  {
    name: 'reset-missing-root',
    operation: 'reset',
    missingRoot: true,
    canonicalFallback: 'ordinary checkout rejects missing root and pending context',
    untimed: true,
  },
  {
    name: 'reset-component-config',
    operation: 'reset',
    config: true,
    canonicalFallback: 'ordinary checkout rejects pending merge context',
    untimed: true,
  },
];

async function createBaseline(cli, temporary, command, options = {}) {
  const fixture = await merge.createFixture(cli, path.join(temporary, 'remote'), options);
  const directory = path.join(temporary, 'baseline');
  await fs.mkdir(directory, { recursive: true });
  const run = async (args) => {
    const result = await command(directory, args);
    assert.equal(result.code, 0, result.stderr || result.stdout);
  };
  await run(['init', '--skip-interactive', '--default-scope', 'qualification.destination']);
  const scopePath = path.join(directory, '.bit/scope.json');
  const scope = JSON.parse(await fs.readFile(scopePath));
  await fs.writeFile(
    scopePath,
    JSON.stringify({ ...scope, name: 'qualification.destination', remotes: fixture.remotes })
  );
  await fs.writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: 'recovery-qualification', private: true })
  );
  await run([
    'import',
    `${fixture.dependencyId}@1.0.0`,
    `${fixture.id}@1.0.1`,
    '--all-history',
    '--skip-dependency-installation',
    '--override',
    '--safe-mode',
  ]);
  await run(['link']);
  for (const [name, version] of [
    ['@types/jest', '26.0.20'],
    ['@types/node', '22.10.5'],
  ]) {
    const target = path.join(directory, 'node_modules', name);
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, 'package.json'), JSON.stringify({ name, version, types: 'index.d.ts' }));
    await fs.writeFile(path.join(target, 'index.d.ts'), 'export {};\n');
  }
  const load = createRequire(path.join(cli, 'package.json'));
  const bitmap = load('comment-json').parse(await fs.readFile(path.join(directory, '.bitmap'), 'utf8'));
  const roots = ['component', 'dependency'].map(
    (name) => Object.values(bitmap).find((entry) => entry?.name === name)?.rootDir
  );
  assert.ok(roots.every(Boolean));
  const pristineRemote = path.join(temporary, 'remote-pristine');
  await fs.cp(path.join(temporary, 'remote'), pristineRemote, { recursive: true, verbatimSymlinks: true });
  return { fixture, directory, roots, pristineRemote };
}

async function prepareRecovery(cli, directory, scenario, baseline, command) {
  const { fixture, roots } = baseline;
  const run = async (args, clock) => {
    const result = await command(directory, args, 'node', undefined, undefined, clock);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    return result;
  };
  const preparation = scenario.multiple
    ? { target: 'lane', topology: 'dependency', strategy: 'manual' }
    : scenario.addition
      ? { target: 'main', topology: 'addition', noAutoSnap: true }
      : scenario.empty
        ? { target: 'lane', topology: 'fast-forward' }
        : scenario.snapped
          ? { target: scenario.main ? 'main' : 'lane', topology: 'clean' }
          : { target: scenario.main ? 'main' : 'lane', topology: 'conflict', strategy: 'manual' };
  await merge.prepareScenario(
    directory,
    preparation,
    {
      root: path.join(directory, roots[0]),
      dependencyRoot: path.join(directory, roots[1]),
    },
    fixture,
    command,
    cli
  );
  if (scenario.multiple) {
    await fs.writeFile(path.join(directory, roots[1], 'index.js'), 'export default "local recovery dependency";\n');
    const mainFile = path.join(directory, roots[0], 'index.js');
    await fs.writeFile(mainFile, (await fs.readFile(mainFile, 'utf8')).replace('last = "base"', 'last = "local"'));
    await run([
      'snap',
      '**',
      '--message',
      'recovery dependency divergence',
      '--unmodified',
      '--skip-auto-snap',
      '--disable-snap-pipeline',
      '--ignore-issues',
      '*',
    ]);
  }
  if (scenario.staged === 'absent') {
    for (const name of ['staged-snaps', 'staged-config'])
      await fs.rm(path.join(directory, '.bit', name), { force: true, recursive: true });
  }
  const original = await capture(cli, directory);
  await run(merge.commandFor(preparation, fixture));
  if (!scenario.empty && !scenario.addition && !scenario.snapped) {
    const pending = JSON.parse(await fs.readFile(path.join(directory, '.bit/unmerged.json'), 'utf8'));
    assert.ok(JSON.stringify(pending).includes('component'), 'public merge must produce actual pending state');
    if (scenario.multiple)
      assert.equal(pending.length, 2, 'selected/all oracle requires two actual pending components');
  }
  if (scenario.warmCache) await warmDependencies(cli, directory, run);
  if (scenario.missingRoot) await fs.rm(path.join(directory, roots[0]), { recursive: true });
  if (scenario.blockedRoot) {
    const mainFile = path.join(directory, roots[0], 'index.js');
    await fs.rm(mainFile);
    await fs.mkdir(mainFile);
    await fs.writeFile(path.join(mainFile, 'blocking.txt'), 'not a source file\n');
  }
  if (scenario.config) {
    if (scenario.policy) await run(['deps', 'set', fixture.id, '@types/node@22.10.5', '--dev']);
    await run(['eject-conf', fixture.id]);
    if (scenario.policy) {
      const load = createRequire(path.join(cli, 'package.json'));
      const config = load('comment-json').parse(
        await fs.readFile(path.join(directory, roots[0], 'component.json'), 'utf8')
      );
      const policy = config.extensions['teambit.dependencies/dependency-resolver'].policy;
      assert.ok(JSON.stringify(policy).includes('@types/node'), 'public dependency policy must be ejected');
    }
  }
  if (scenario.missingBackup) await fs.rm(path.join(directory, '.bit/last-merged'), { recursive: true });
  return { original, before: await capture(cli, directory) };
}

async function warmDependencies(cli, directory, run) {
  await run(['link']);
  // The ordinary setup clock is fixed for snapshot identities. Warm this real
  // canonical load at wall time so its cache entries follow the control mtimes;
  // abort's subsequent copies must then make those same entries stale.
  await run(['status', '--json'], String(Date.now()));
  const load = createRequire(path.join(cli, 'package.json'));
  const { FsCache, dependencyCacheNeedsInvalidation } = load('@teambit/workspace.modules.fs-cache');
  const cache = new FsCache(path.join(directory, '.bit'));
  const entries = await cache.listDependenciesDataCache();
  assert.ok(
    Object.keys(entries).some((key) => key.includes('new-component')),
    'incoming-only cache must exist'
  );
  assert.equal(
    await dependencyCacheNeedsInvalidation(cache, directory, path.join(directory, 'workspace.jsonc')),
    false,
    'all canonical dependency entries must be warm before abort'
  );
}

function commandFor(scenario, fixture) {
  if (scenario.operation === 'laneAbort') return ['lane', 'merge-abort', '-x', '--silent'];
  if (scenario.operation === 'reset') return ['checkout', 'reset', fixture.id, '-x'];
  return [
    'merge',
    ...(scenario.nonpending ? [fixture.dependencyId] : scenario.selected ? [fixture.id] : []),
    '--abort',
    '-x',
  ];
}

module.exports = { scenarios, createBaseline, prepareRecovery, commandFor, capture };
