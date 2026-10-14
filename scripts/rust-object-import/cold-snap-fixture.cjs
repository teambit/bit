const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const recovery = require('./cold-recovery-fixture.cjs');

const scenarios = [
  { name: 'main-snap-selected', selected: true },
  { name: 'main-snap-no-message', selected: true, noMessage: true },
  { name: 'main-snap-all' },
  { name: 'main-snap-new', added: true, selected: true },
  { name: 'main-snap-new-existing', added: true, mixedNew: true },
  { name: 'main-snap-new-linked', added: true, mixedNew: true, linkedNew: true },
  { name: 'main-snap-noop', noop: true },
  { name: 'main-snap-unmodified', selected: true, unmodified: true },
  { name: 'main-snap-visible-cascade', dependency: true },
  { name: 'main-snap-skip-cascade', dependency: true, skipAutoSnap: true },
  { name: 'lane-snap-selected', lane: true, selected: true },
  { name: 'lane-snap-new', lane: true, added: true, selected: true },
  { name: 'lane-snap-visible-cascade', lane: true, dependency: true },
  { name: 'lane-snap-hidden-cascade', hidden: true, dependency: true },
  { name: 'lane-snap-hidden-aspect-cascade', hidden: true, dependency: true, aspect: true },
  { name: 'main-snap-unmerged', unmerged: true },
  { name: 'lane-snap-unmerged', unmerged: true, lane: true },
  { name: 'snap-pattern-no-match', pattern: 'qualification.checkout/absent*', error: true, untimed: true },
  { name: 'snap-pattern-unmodified', pattern: 'qualification.checkout/depend*', error: true, untimed: true },
];

async function prepareSnap(cli, directory, scenario, baseline, command) {
  if (scenario.unmerged)
    return require('./cold-resolve-fixture.cjs').prepareResolve(
      cli,
      directory,
      { selected: true, main: !scenario.lane },
      baseline,
      command
    );
  const run = async (args) => {
    const result = await command(directory, args);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    return result;
  };
  let roots = baseline.roots;
  if (scenario.hidden) {
    const prepare = scenario.aspect
      ? require('./cold-snap-aspect-fixture.cjs').prepareHiddenAspectSnap
      : require('./merge-transaction-hidden-fixture.cjs').prepareHiddenMainMerge;
    await prepare({
      cli,
      directory,
      fixture: baseline.fixture,
      roots: { root: path.join(directory, roots[0]), dependencyRoot: path.join(directory, roots[1]) },
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
    roots = [undefined, Object.values(bitmap).find((row) => row?.name === 'dependency').rootDir];
  } else if (scenario.lane) {
    await run(['lane', 'create', 'ordinary', '--scope', 'qualification.checkout']);
  }
  const original = await recovery.capture(cli, directory);
  if (scenario.added) {
    await fs.mkdir(path.join(directory, 'new-unit'));
    await fs.writeFile(
      path.join(directory, 'new-unit/index.js'),
      scenario.linkedNew
        ? 'import component from "@qualification/checkout.component";\nexport default component;\n'
        : 'export default "new public component";\n'
    );
    await run(['add', 'new-unit', '--id', 'new-unit', '--scope', 'qualification.destination']);
    if (scenario.mixedNew)
      await fs.appendFile(path.join(directory, roots[0], 'index.js'), '\nexport const ordinaryEdit = true;\n');
  } else if (!scenario.noop && !scenario.unmodified) {
    await fs.appendFile(
      path.join(directory, roots[scenario.dependency ? 1 : 0], 'index.js'),
      '\nexport const ordinaryEdit = true;\n'
    );
  }
  return { original, before: await recovery.capture(cli, directory) };
}

function commandFor(scenario, fixture) {
  return [
    'snap',
    ...(scenario.pattern
      ? [scenario.pattern]
      : scenario.added && !scenario.mixedNew
        ? ['qualification.destination/new-unit']
        : scenario.dependency
          ? [fixture.dependencyId]
          : scenario.selected
            ? [fixture.id]
            : []),
    ...(!scenario.noMessage ? ['--message', 'ordinary public snapshot'] : []),
    ...(scenario.unmerged ? ['--unmerged'] : []),
    ...(scenario.unmodified ? ['--unmodified'] : []),
    ...(scenario.skipAutoSnap ? ['--skip-auto-snap'] : []),
  ];
}

function versions(state) {
  return Object.entries(state.objects).filter(
    ([, hex]) => typeof hex === 'string' && Buffer.from(hex, 'hex').toString().startsWith('Version ')
  );
}

function assertOutcome(scenario, before, after, result) {
  if (scenario.error || scenario.noop) {
    assert.deepEqual(after.objects, before.objects, 'no new snapshot objects on errors or no-op');
    assert.equal(after.bitmap, before.bitmap, 'no tracked version change on errors or no-op');
    if (scenario.noop) assert.match(result.stdout, /nothing to snap/i);
    return;
  }
  const existing = new Set(versions(before).map(([key]) => key));
  const created = versions(after).filter(([key]) => !existing.has(key));
  assert.equal(
    created.length,
    scenario.mixedNew || (scenario.dependency && !scenario.skipAutoSnap) ? 2 : 1,
    'selected and automatic snapshots are persisted'
  );
  if (scenario.unmerged)
    assert.deepEqual(
      JSON.parse(Buffer.from(after.unmerged, 'hex').toString()),
      [],
      'public snap --unmerged clears resolved pending entries'
    );
  if (scenario.added) {
    const objects = Object.values(after.objects)
      .filter((hex) => typeof hex === 'string')
      .map((hex) => Buffer.from(hex, 'hex').toString());
    assert.ok(
      objects.some((text) => text.startsWith('Component ') && text.includes('new-unit')),
      'new model object exists'
    );
    assert.ok(
      created.some(([, hex]) => Buffer.from(hex, 'hex').toString().includes('index.js')),
      'new snapshot retains actual file metadata'
    );
  }
  if (scenario.linkedNew) {
    const decoded = created.map(([, hex]) => {
      const bytes = Buffer.from(hex, 'hex');
      return JSON.parse(bytes.subarray(bytes.indexOf(0) + 1));
    });
    const linked = decoded.find((version) =>
      version.dependencies.some((dependency) => dependency.id.name === 'component')
    );
    assert.ok(linked, 'new public component retains its linked component dependency');
    assert.equal(linked.log.message, 'ordinary public snapshot (bump dependencies versions)');
    assert.match(result.stdout, /auto-snapped dependents \(1\)/, 'selected new component remains in automatic report');
    const dependency = linked.dependencies.find((entry) => entry.id.name === 'component');
    assert.ok(
      created.some(([hash]) => hash === dependency.id.version),
      'linked dependency uses the same-batch snapshot'
    );
  }
  if (scenario.hidden) {
    const laneRecord = (state) =>
      Object.values(state.objects)
        .map((hex) => Buffer.from(hex, 'hex'))
        .filter((bytes) => bytes.toString().startsWith('Lane '))
        .map((bytes) => JSON.parse(bytes.subarray(bytes.indexOf(0) + 1)))
        .find((lane) => lane.name === 'hidden');
    const oldLane = laneRecord(before),
      newLane = laneRecord(after);
    assert.equal(newLane.updateDependents.length, 1);
    assert.notEqual(newLane.updateDependents[0], oldLane.updateDependents[0]);
    assert.ok(
      !newLane.components.some((row) => row.id.name === 'component'),
      'automatic hidden dependent remains hidden'
    );
    if (scenario.aspect) {
      const decode = (state, ref) => {
        const bytes = Buffer.from(state.objects[ref], 'hex');
        return JSON.parse(bytes.subarray(bytes.indexOf(0) + 1));
      };
      const oldVersion = decode(before, oldLane.updateDependents[0].split('@')[1]);
      const newVersion = decode(after, newLane.updateDependents[0].split('@')[1]);
      assert.deepEqual(oldVersion.dependencies, [], 'hidden parent has no runtime component dependency');
      assert.deepEqual(oldVersion.devDependencies, [], 'hidden parent has no development component dependency');
      const oldAspect = oldVersion.extensions.find((row) => row.extensionId?.name === 'dependency');
      const newAspect = newVersion.extensions.find((row) => row.extensionId?.name === 'dependency');
      assert.ok(oldAspect && newAspect, 'public aspect producer persisted actual extension dependency');
      assert.notEqual(newAspect.extensionId.version, oldAspect.extensionId.version);
      const edges = decode(after, newVersion.flattenedEdgesRef);
      assert.ok(
        edges.some(
          (edge) =>
            edge.type === 'ext' &&
            edge.source.name === 'component' &&
            edge.target.version === newAspect.extensionId.version
        ),
        'flattened extension edge follows the new selected snapshot'
      );
    }
  }
}

module.exports = {
  scenarios,
  prepareSnap,
  commandFor,
  assertOutcome,
  createBaseline: recovery.createBaseline,
  capture: recovery.capture,
};
