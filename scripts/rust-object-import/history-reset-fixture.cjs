const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { inflateSync, deflateSync } = require('node:zlib');
const checkout = require('./checkout-transition-fixture.cjs');

// Imported immutable tags seed exported ancestry; all local reset candidates are created
// through real disposable workspace commands after this fixture is imported.
async function createFixture(cli, directory, options = {}) {
  return checkout.createFixture(cli, directory, options);
}

const scenarios = [
  { name: 'main-head', command: ['reset', 'component', '--head', '--force'], snaps: 2 },
  { name: 'main-all', command: ['reset', 'component', '--force'], snaps: 2 },
  { name: 'main-all-no-pattern', command: ['reset', '--silent'], snaps: 2 },
  { name: 'lane-head', command: ['reset', '--head', '--silent'], snaps: 2, lane: true },
  { name: 'lane-all', command: ['reset', '--silent'], snaps: 2, lane: true },
  { name: 'snap-dependent-not-indexed', command: ['reset', 'dependency', '--head'], dependency: true, snapOnly: true },
  { name: 'dependent-blocked', command: ['reset', 'dependency', '--head'], dependency: true, error: true },
  { name: 'dependent-force', command: ['reset', 'dependency', '--head', '--force'], dependency: true },
  {
    name: 'candidate-dependent-blocked',
    command: ['reset', 'qualification.checkout/*', '--head'],
    dependency: true,
    error: true,
  },
  { name: 'soft-tags', command: ['reset', '--soft', '--silent'], soft: true },
  { name: 'soft-pattern', command: ['reset', 'qualification.checkout/component', '--soft'], soft: true },
  { name: 'soft-deleted', command: ['reset', '--soft', '--silent'], soft: true, deleted: true },
  { name: 'never-exported', command: ['reset', '--never-exported'], neverExported: true },
  {
    name: 'detached-head',
    command: ['reset', 'component', '--head', '--force'],
    detached: true,
    error: true,
    errorText: 'is exported',
  },
  { name: 'detached-all', command: ['reset', 'component', '--force'], detached: true },
  {
    name: 'missing-local-version',
    command: ['reset', 'component', '--head', '--force'],
    snaps: 1,
    damage: 'missing',
    error: true,
    errorText: 'not found|unable|missing',
  },
  {
    name: 'corrupt-local-version',
    command: ['reset', 'component', '--head', '--force'],
    snaps: 1,
    damage: 'corrupt',
    error: true,
    errorText: 'JSON|Unexpected|invalid|parse',
  },
  {
    name: 'persist-callback-failure',
    command: ['reset', 'component', '--head', '--force'],
    snaps: 1,
    writeFailure: true,
    error: true,
    errorText: 'deliberate history reset callback failure after persisted prefix',
  },
];

async function prepare(directory, roots, scenario, successful, cli) {
  const [componentRoot, dependencyRoot] = roots;
  const stable = path.join(directory, componentRoot, 'stable.txt');
  const snap = (pattern, message, extra = []) =>
    successful(directory, [
      'snap',
      pattern,
      '--message',
      message,
      '--disable-snap-pipeline',
      '--ignore-issues',
      '*',
      ...extra,
    ]);
  if (scenario.lane)
    await successful(directory, ['lane', 'create', 'reset-qualification', '--scope', 'qualification.destination']);
  if (scenario.neverExported) {
    await fs.mkdir(path.join(directory, 'new-component'));
    await fs.writeFile(path.join(directory, 'new-component/index.js'), 'export default "never-exported";\n');
    await successful(directory, ['add', 'new-component', '--id', 'new-component', '--main', 'index.js']);
    await snap('new-component', 'never exported candidate');
    return;
  }
  if (scenario.soft) {
    await fs.writeFile(stable, 'soft reset change\nsecond\nthird\n');
    await successful(directory, ['tag', 'component', '--soft', '--ignore-issues', '*']);
    if (scenario.deleted) await successful(directory, ['delete', 'component', '--silent']);
    return;
  }
  if (scenario.detached) {
    await successful(directory, ['checkout', '1.0.0', 'component', '--skip-dependency-installation']);
    await fs.writeFile(stable, 'detached local change\nsecond\nthird\n');
    await snap('component', 'detached reset candidate', ['--detach-head']);
    return;
  }
  if (scenario.dependency) {
    await fs.writeFile(path.join(directory, dependencyRoot, 'index.js'), 'export default "dependency local reset";\n');
    await fs.writeFile(stable, 'actual dependent reset snapshot\nsecond\nthird\n');
    if (scenario.snapOnly) await snap('qualification.checkout/*', 'snap-only dependent omitted by canonical tag index');
    else
      await successful(directory, [
        'tag',
        'qualification.checkout/*',
        '--message',
        'tagged dependency reset guards',
        '--disable-tag-pipeline',
        '--ignore-issues',
        '*',
      ]);
    return;
  }
  for (let index = 0; index < (scenario.snaps || 1); index++) {
    await fs.writeFile(stable, `local reset snapshot ${index}\nsecond\nthird\n`);
    await snap('component', `local reset snapshot ${index}`);
  }
  if (scenario.damage) {
    const load = createRequire(path.join(cli, 'package.json'));
    const bitmap = load('comment-json').parse(await fs.readFile(path.join(directory, '.bitmap'), 'utf8'));
    const ref = Object.values(bitmap).find((entry) => entry && entry.name === 'component').version;
    assert.match(ref, /^[a-f0-9]{40}$/);
    const filename = path.join(directory, '.bit/objects', ref.slice(0, 2), ref.slice(2));
    if (scenario.damage === 'missing') await fs.unlink(filename);
    else {
      const inflated = inflateSync(await fs.readFile(filename));
      const header = inflated.subarray(0, inflated.indexOf(0)).toString().split(' ');
      const body = '{"corruptLocalVersion":';
      header[2] = String(body.length);
      await fs.writeFile(filename, deflateSync(Buffer.from(header.join(' ') + '\0' + body)));
    }
  }
}

async function capture(directory, roots) {
  const result = await checkout.capture(directory, roots);
  try {
    result.persistFault = (await fs.readFile(path.join(directory, '.bit/history-reset-persist-fault.json'))).toString(
      'hex'
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    result.persistFault = null;
  }
  result.stash = await checkout.readTree(path.join(directory, '.bit/stash'));
  result.stagedConfig = await checkout.readTree(path.join(directory, '.bit/staged-config'));
  return result;
}

function assertWorkspaceBytesPreserved(before, after) {
  assert.deepEqual(after.roots, before.roots, 'history reset changes metadata, not workspace Source bytes');
}

module.exports = { createFixture, scenarios, prepare, capture, assertWorkspaceBytesPreserved };
