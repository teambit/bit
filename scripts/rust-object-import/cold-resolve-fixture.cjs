const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const recovery = require('./cold-recovery-fixture.cjs');

// Actual public manual merges establish pending state; resolution edits below
// model a user choosing conflict content, without synthesizing model metadata.
const scenarios = [
  { name: 'main-resolve-selected', main: true, selected: true },
  { name: 'main-resolve-all', main: true },
  { name: 'lane-resolve-selected', selected: true },
  { name: 'lane-resolve-all' },
  { name: 'lane-resolve-selected-multiple', multiple: true, selected: true },
  { name: 'lane-resolve-all-multiple', multiple: true },
  { name: 'main-resolve-selected-multiple', main: true, multiple: true, selected: true },
  { name: 'lane-resolve-pattern-all', multiple: true, patternAll: true },
  { name: 'lane-resolve-pattern-glob', multiple: true, selected: true, pattern: 'qualification.checkout/comp*' },
  {
    name: 'lane-resolve-pattern-comma',
    multiple: true,
    pattern: 'qualification.checkout/component,qualification.checkout/dependency',
  },
  {
    name: 'lane-resolve-pattern-exclusion',
    multiple: true,
    selected: true,
    pattern: '**,!qualification.checkout/dependency',
  },
  { name: 'main-resolve-message', main: true, selected: true, message: 'explicit resolved merge' },
  { name: 'lane-resolve-config', selected: true, config: true, policy: true },
  { name: 'lane-resolve-pending-policy', selected: true, pendingPolicy: true },
  { name: 'lane-resolve-added-deleted', selected: true, files: true },
  { name: 'lane-resolve-visible-cascade', multiple: true, dependency: true },
  { name: 'lane-resolve-cascade-message', multiple: true, dependency: true, message: 'explicit cascade resolution' },
  { name: 'main-resolve-visible-cascade', main: true, multiple: true, dependency: true },
  { name: 'lane-resolve-hidden-cascade', hidden: true, dependency: true },
  { name: 'lane-resolve-mixed-cascade', hidden: true, mixed: true, dependency: true },
  { name: 'resolve-duplicate-package', duplicate: true, error: true, untimed: true },
  { name: 'resolve-missing-policy', missingPolicy: true, error: true, untimed: true },
  { name: 'resolve-empty', empty: true, error: true, untimed: true },
  { name: 'resolve-nonpending', nonpending: true, error: true, untimed: true },
  { name: 'resolve-unedited-conflict', unedited: true, error: true, untimed: true },
];

async function prepareResolve(cli, directory, scenario, baseline, command) {
  if (scenario.hidden) return prepareHidden(cli, directory, scenario, baseline, command);
  const prepared = scenario.pendingPolicy
    ? await preparePendingPolicy(cli, directory, baseline, command)
    : scenario.main && scenario.multiple
      ? await prepareMainMultiple(cli, directory, baseline, command)
      : await recovery.prepareRecovery(cli, directory, scenario, baseline, command);
  const load = createRequire(path.join(cli, 'package.json'));
  const bitmap = load('comment-json').parse(await fs.readFile(path.join(directory, '.bitmap'), 'utf8'));
  assert.equal(Boolean(bitmap._bit_lane), !scenario.main, 'fixture must exercise the named current-lane domain');
  if (!scenario.empty && !scenario.unedited) {
    for (const root of baseline.roots) {
      const filename = path.join(directory, root, 'index.js');
      const original = await fs.readFile(filename, 'utf8');
      // Selecting local conflict content preserves imports and ordinary lines.
      const resolved = original.replace(
        /^<<<<<<<[^\n]*\n([\s\S]*?)^=======[^\n]*\n[\s\S]*?^>>>>>>>[^\n]*(?:\n|$)/gm,
        '$1'
      );
      assert.ok(!resolved.includes('<<<<<<<'), 'all public conflict markers must be resolved');
      await fs.writeFile(filename, resolved);
    }
  }
  if (scenario.files) {
    const root = path.join(directory, baseline.roots[0]);
    await fs.writeFile(path.join(root, 'resolved.spec.ts'), 'export const resolvedTest = true;\n');
    await fs.writeFile(path.join(root, 'resolved.js'), 'export default "resolved addition";\n');
    await fs.rm(path.join(root, 'added.js'));
  }
  if (scenario.duplicate) {
    const filename = path.join(directory, 'package.json');
    const pkg = JSON.parse(await fs.readFile(filename));
    pkg.dependencies = { ...pkg.dependencies, '@qualification/checkout.component': '1.0.1' };
    await fs.writeFile(filename, JSON.stringify(pkg));
  }
  if (scenario.missingPolicy) {
    const result = await command(directory, ['deps', 'set', baseline.fixture.id, 'resolve-missing-package@1.0.0']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
  }
  return { original: prepared.original, before: await recovery.capture(cli, directory) };
}

async function prepareMainMultiple(cli, directory, baseline, command) {
  const merge = require('./merge-transaction-fixture.cjs');
  const preparation = { target: 'main', topology: 'dependency', strategy: 'manual' };
  await merge.prepareScenario(
    directory,
    preparation,
    {
      root: path.join(directory, baseline.roots[0]),
      dependencyRoot: path.join(directory, baseline.roots[1]),
    },
    baseline.fixture,
    command,
    cli
  );
  await fs.writeFile(
    path.join(directory, baseline.roots[1], 'index.js'),
    'export default "local recovery dependency";\n'
  );
  const mainFile = path.join(directory, baseline.roots[0], 'index.js');
  await fs.writeFile(mainFile, (await fs.readFile(mainFile, 'utf8')).replace('last = "base"', 'last = "local"'));
  const run = async (args) => {
    const result = await command(directory, args);
    assert.equal(result.code, 0, result.stderr || result.stdout);
  };
  await run([
    'snap',
    '**',
    '--message',
    'main dependency divergence',
    '--unmodified',
    '--skip-auto-snap',
    '--disable-snap-pipeline',
    '--ignore-issues',
    '*',
  ]);
  const original = await recovery.capture(cli, directory);
  await run(merge.commandFor(preparation, baseline.fixture));
  const pending = JSON.parse(await fs.readFile(path.join(directory, '.bit/unmerged.json'), 'utf8'));
  assert.equal(pending.length, 2, 'two actual main pending entries');
  return { original };
}

async function preparePendingPolicy(cli, directory, baseline, command) {
  const run = async (args) => {
    const result = await command(directory, args);
    assert.equal(result.code, 0, result.stderr || result.stdout);
  };
  const snap = (message) =>
    run([
      'snap',
      baseline.fixture.id,
      '--message',
      message,
      '--skip-auto-snap',
      '--disable-snap-pipeline',
      '--ignore-issues',
      '*',
    ]);
  const filename = path.join(directory, baseline.roots[0], 'index.js');
  const source =
    'import dependency from "@qualification/checkout.dependency";\nexport default dependency;\nexport const side = "base";\n';
  await fs.writeFile(filename, source);
  await snap('pending policy common');
  await run(['lane', 'create', 'incoming', '--scope', 'qualification.destination']);
  await run(['deps', 'set', baseline.fixture.id, '@types/node@22.10.5', '--dev']);
  await fs.writeFile(filename, source.replace('"base"', '"incoming"'));
  await snap('pending policy incoming');
  await run(['switch', 'main', '--skip-fetch', '--skip-dependency-installation']);
  await run(['lane', 'create', 'destination', '--scope', 'qualification.destination']);
  await fs.writeFile(filename, source.replace('"base"', '"local"'));
  await snap('pending policy local');
  const original = await recovery.capture(cli, directory);
  await run(['lane', 'merge', 'incoming', '-x', '--auto-merge-resolve', 'manual']);
  const pending = JSON.parse(await fs.readFile(path.join(directory, '.bit/unmerged.json'), 'utf8'));
  assert.equal(pending.length, 1);
  assert.ok(
    JSON.stringify(pending[0].mergedConfig).includes('@types/node'),
    'public merge retains real pending policy'
  );
  return { original };
}

async function prepareHidden(cli, directory, scenario, baseline, command) {
  const run = async (args) => {
    const result = await command(directory, args);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    return result;
  };
  await require('./merge-transaction-hidden-fixture.cjs').prepareHiddenMainMerge({
    cli,
    directory,
    fixture: baseline.fixture,
    roots: { root: path.join(directory, baseline.roots[0]), dependencyRoot: path.join(directory, baseline.roots[1]) },
    command,
    runApi: (cwd, runner, args) => command(cwd, ['__api', runner, ...args]),
  });
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
  const leaf = Object.values(bitmap).find((row) => row?.name === 'dependency');
  assert.ok(leaf?.rootDir);
  if (scenario.mixed) {
    await fs.mkdir(path.join(directory, 'visible-parent'));
    await fs.writeFile(
      path.join(directory, 'visible-parent/index.js'),
      'import dependency from "@qualification/checkout.dependency";\nexport default dependency;\n'
    );
    await run(['add', 'visible-parent', '--id', 'visible-parent', '--scope', 'qualification.checkout']);
    await run([
      'snap',
      'visible-parent',
      '--message',
      'visible dependent alongside hidden',
      '--skip-auto-snap',
      '--disable-snap-pipeline',
      '--ignore-issues',
      '*',
    ]);
  }
  await run(['lane', 'create', 'resolve-incoming', '--scope', 'qualification.checkout']);
  await fs.writeFile(
    path.join(directory, leaf.rootDir, 'index.js'),
    'export default "resolved hidden cascade leaf";\n'
  );
  await run([
    'snap',
    baseline.fixture.dependencyId,
    '--message',
    'incoming leaf for resolution',
    '--skip-auto-snap',
    '--disable-snap-pipeline',
    '--ignore-issues',
    '*',
  ]);
  await run(['export']);
  await run(['switch', 'hidden', '--skip-fetch', '--skip-dependency-installation']);
  const original = await recovery.capture(cli, directory);
  await run(['lane', 'merge', 'qualification.checkout/resolve-incoming', '--no-snap', '-x']);
  const pending = JSON.parse(await fs.readFile(path.join(directory, '.bit/unmerged.json'), 'utf8'));
  assert.equal(pending.length, 1, 'only the visible leaf is pending');
  assert.equal(pending[0].id.name, 'dependency');
  return { original, before: await recovery.capture(cli, directory) };
}

function commandFor(scenario, fixture) {
  return [
    'merge',
    ...(scenario.pattern
      ? [scenario.pattern]
      : scenario.nonpending || scenario.dependency
        ? [fixture.dependencyId]
        : scenario.patternAll
          ? ['**']
          : scenario.selected
            ? [fixture.id]
            : []),
    '--resolve',
    ...(scenario.message ? ['--message', scenario.message] : []),
  ];
}

function assertOutcome(scenario, before, after, result) {
  if (scenario.error) {
    assert.equal(after.unmerged, before.unmerged, 'failed resolve preserves pending entries');
    assert.deepEqual(after.roots, before.roots, 'failed resolve preserves workspace Sources');
    return;
  }
  const pending = JSON.parse(Buffer.from(after.unmerged, 'hex').toString());
  const untouched = scenario.multiple && scenario.selected ? 1 : 0;
  assert.equal(pending.length, untouched, 'selection and auto-tag closure determine remaining pending entries');
  if (untouched) {
    const original = JSON.parse(Buffer.from(before.unmerged, 'hex').toString());
    assert.deepEqual(
      pending[0],
      original.find((row) => row.id.name === 'dependency')
    );
  }
  const versions = Object.entries(after.objects).filter(
    ([hash, hex]) => before.objects[hash] !== hex && Buffer.from(hex, 'hex').toString().startsWith('Version ')
  );
  const count = scenario.mixed
    ? 3
    : scenario.hidden || scenario.dependency || (scenario.multiple && !scenario.selected)
      ? 2
      : 1;
  assert.equal(versions.length, count, 'actual snapshot count includes automatic dependents');
  const reported = scenario.multiple && !scenario.selected && !scenario.dependency ? 2 : 1;
  assert.ok(result.stdout.includes(`resolved components (${reported})`), 'public report excludes automatic dependents');
  if (scenario.hidden) {
    const lanes = (state) =>
      Object.values(state.objects)
        .map((hex) => Buffer.from(hex, 'hex'))
        .filter((bytes) => bytes.toString().startsWith('Lane '))
        .map((bytes) => JSON.parse(bytes.subarray(bytes.indexOf(0) + 1)))
        .filter((lane) => lane.name === 'hidden');
    const oldLane = lanes(before)[0],
      newLane = lanes(after)[0];
    assert.equal(newLane.updateDependents.length, 1);
    assert.notEqual(newLane.updateDependents[0], oldLane.updateDependents[0]);
    assert.ok(!newLane.components.some((row) => row.id.name === 'component'), 'hidden auto-tag remains hidden');
  }
}

module.exports = {
  scenarios,
  createBaseline: recovery.createBaseline,
  capture: recovery.capture,
  prepareResolve,
  commandFor,
  assertOutcome,
};
