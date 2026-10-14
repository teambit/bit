const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const snap = require('./cold-snap-fixture.cjs');
const scenarios = [
  { name: 'tag-selected', selected: true },
  { name: 'tag-no-message', selected: true, noMessage: true },
  { name: 'tag-all' },
  { name: 'tag-new', added: true, selected: true, expected: '0.0.1' },
  { name: 'tag-new-major', added: true, selected: true, flags: ['--major'], expected: '1.0.0' },
  { name: 'tag-new-increment', added: true, selected: true, flags: ['--increment-by', '3'], expected: '0.0.3' },
  { name: 'tag-new-existing', added: true, mixedNew: true },
  { name: 'tag-new-linked', added: true, mixedNew: true, linkedNew: true },
  { name: 'tag-new-linked-major', added: true, mixedNew: true, linkedNew: true, flags: ['--major'], expectedNew: '1.0.0' },
  { name: 'tag-new-linked-auto-minor', added: true, mixedNew: true, linkedNew: true, flags: ['--major', '--auto-tag-increment', 'minor'], expectedNew: '1.0.0' },
  { name: 'tag-minor', selected: true, flags: ['--minor'] },
  { name: 'tag-exact', selected: true, flags: ['--ver', '3.2.1'], expected: '3.2.1' },
  { name: 'tag-prerelease', selected: true, flags: ['--increment', 'prerelease', '--prerelease-id', 'dev'] },
  { name: 'tag-per-pattern', selected: true, patternVersion: 'minor' },
  { name: 'tag-glob', selected: true, tagPattern: 'glob' },
  { name: 'tag-overlapping-patterns', selected: true, tagPattern: 'overlap' },
  { name: 'tag-glob-new-before-existing', added: true, mixedNew: true, patterns: ['**'] },
  { name: 'tag-glob-unmodified-error', selected: true, patterns: ['qualification.checkout/depend*'], error: true, untimed: true },
  { name: 'tag-glob-missing-error', selected: true, patterns: ['qualification.checkout/missing*'], error: true, untimed: true },
  { name: 'tag-comma-unmodified-error', selected: true, patterns: ['qualification.checkout/depend*,qualification.checkout/missing*'], error: true, untimed: true },
  { name: 'tag-partial-pattern-error', selected: true, patterns: ['qualification.checkout/comp*', 'qualification.checkout/depend*'], error: true, untimed: true },
  { name: 'tag-noop', noop: true },
  { name: 'tag-unmodified', selected: true, unmodified: true },
  { name: 'tag-visible-cascade', dependency: true },
  { name: 'tag-auto-minor', dependency: true, flags: ['--auto-tag-increment', 'minor'] },
  { name: 'tag-skip-cascade', dependency: true, skipAutoSnap: true },
  { name: 'tag-stored-caret-range', dependency: true, rangePrefix: '^', flags: ['--major'] },
  { name: 'tag-stored-tilde-range', dependency: true, rangePrefix: '~', flags: ['--major'] },
  { name: 'tag-workspace-range-fallback', dependency: true, rangePrefix: '^', workspaceRange: true, flags: ['--major'], canonicalFallback: true, untimed: true },
  { name: 'tag-snapped', selected: true, snapped: true },
  { name: 'tag-unmerged', unmerged: true },
  { name: 'tag-snapped-excludes-pending', unmerged: true, snapped: true, pendingSnapped: true, noop: true },
  { name: 'tag-current-lane-fallback', lane: true, selected: true, canonicalFallback: true, error: true, untimed: true },
];
async function prepareTag(cli, directory, scenario, baseline, command) {
  if (scenario.rangePrefix) await prepareRangePrefix(cli, directory, scenario, command);
  const prepared = await snap.prepareSnap(cli, directory, scenario, baseline, command);
  if (scenario.rangePrefix && !scenario.workspaceRange) {
    const models = decoded(prepared.before, 'Component');
    const parent = models.find(([, model]) => model.name === 'component')?.[1];
    const version = decoded(prepared.before, 'Version').find(([hash]) => hash === parent?.head)?.[1];
    const resolver = version?.extensions.find((extension) => extension.name === 'teambit.dependencies/dependency-resolver');
    assert.equal(resolver?.data?.componentRangePrefix, scenario.rangePrefix, 'public setup must retain the range prefix in the current model');
  }
  if (scenario.snapped && !scenario.pendingSnapped) {
    const result = await command(directory, ['snap', '-m', 'prepare ordinary tag']);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    prepared.before = await snap.capture(cli, directory);
  }
  return prepared;
}
async function prepareRangePrefix(cli, directory, scenario, command) {
  const target = path.join(directory, 'workspace.jsonc');
  const original = await fs.readFile(target);
  const json = createRequire(path.join(cli, 'package.json'))('comment-json');
  const config = json.parse(original.toString());
  const resolver = 'teambit.dependencies/dependency-resolver';
  config[resolver] = { ...config[resolver], componentRangePrefix: scenario.rangePrefix };
  await fs.writeFile(target, json.stringify(config, null, 2));
  if (scenario.workspaceRange) return;
  const result = await command(directory, ['snap', '--unmodified', '-m', 'seed stored dependency range']);
  assert.equal(result.code, 0, result.stderr || result.stdout);
  await fs.writeFile(target, original);
}
function commandFor(scenario, fixture) {
  const base = snap.commandFor(scenario, fixture);
  const message = base.indexOf('--message');
  const args = ['tag'];
  if (scenario.patterns) args.push(...scenario.patterns);
  else if (scenario.selected || scenario.dependency) {
    const id = base[1];
    assert.ok(id && !id.startsWith('-'));
    if (scenario.tagPattern) {
      const glob = `${id.slice(0, id.lastIndexOf('/') + 1)}*`;
      args.push(...(scenario.tagPattern === 'overlap' ? [id, glob] : [glob]));
    } else args.push(scenario.patternVersion ? `${id}@${scenario.patternVersion}` : id);
  }
  if (!scenario.noMessage) args.push('-m', message >= 0 ? base[message + 1] : 'ordinary public tag');
  if (scenario.unmodified) args.push('--unmodified');
  if (scenario.unmerged && !scenario.pendingSnapped) args.push('--unmerged');
  if (scenario.skipAutoSnap) args.push('--skip-auto-tag');
  if (scenario.snapped) args.push('--snapped');
  args.push(...(scenario.flags || []));
  return args;
}
function decoded(state, type) {
  return Object.entries(state.objects).flatMap(([hash, hex]) => {
    const bytes = Buffer.from(hex, 'hex');
    const zero = bytes.indexOf(0);
    return bytes.subarray(0, zero).toString().startsWith(`${type} `) ? [[hash, JSON.parse(bytes.subarray(zero + 1))]] : [];
  });
}
function assertOutcome(scenario, before, after, result) {
  if (scenario.error) { assert.notEqual(result.code, 0); return; }
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const created = decoded(after, 'Version').filter(([hash]) => !before.objects[hash]);
  if (scenario.noop) { assert.equal(created.length, 0); return; }
  assert.ok(created.length > 0, 'public tag must persist Versions');
  const models = decoded(after, 'Component');
  for (const [hash] of created) {
    const binding = models.flatMap(([, model]) => Object.entries(model.versions).filter(([, ref]) => ref === hash));
    assert.equal(binding.length, 1, 'tagged semantic version points to exactly one allocated object hash');
    assert.match(binding[0][0], /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
    assert.notEqual(binding[0][0], hash, 'semantic identity is distinct from object hash');
    if (scenario.expected) assert.equal(binding[0][0], scenario.expected);
  }
  if (scenario.mixedNew) assert.equal(created.length, 2, 'selected plus automatic overlap must not duplicate Versions');
  if (scenario.linkedNew) {
    assert.match(result.stdout, /auto-tagged dependents \(1\)/);
    assert.match(result.stdout, /2 component\(s\) tagged/);
    const newModel = models.find(([, model]) => model.name === 'new-unit')[1];
    const newVersion = created.find(([hash]) => Object.values(newModel.versions).includes(hash))[1];
    assert.match(newVersion.log.message, /\(bump dependencies versions\)$/);
    if (scenario.expectedNew) assert.ok(newModel.versions[scenario.expectedNew]);
  }
  if (scenario.rangePrefix) {
    const dependencyModel = models.find(([, model]) => model.name === 'dependency')[1];
    const dependencyBinding = Object.entries(dependencyModel.versions).find(([, hash]) => created.some(([createdHash]) => createdHash === hash));
    const parent = created.map(([, version]) => version).find((version) => version.dependencies?.some((dependency) => dependency.id.name === 'dependency'));
    const dependency = parent?.dependencies.find((entry) => entry.id.name === 'dependency');
    assert.ok(dependency, 'dependent must be automatically tagged');
    assert.equal(dependency.id.version, dependencyBinding[0]);
    assert.equal(dependency.versionRange, `${scenario.rangePrefix}${dependencyBinding[0]}`);
  }
}
module.exports = { scenarios, prepareTag, commandFor, assertOutcome, createBaseline: snap.createBaseline, capture: snap.capture };
