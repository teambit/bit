const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');

// Usage: node history-reset-differential.cjs PRIVATE_CLI HELPER [REPORT_JSON]
// Calls the real canonical private methods with inert public callbacks. Never
// patches installed modules or changes production dependency/configuration data.
const cli = path.resolve(process.argv[2] || '');
const helper = path.resolve(process.argv[3] || '');
assert.ok(process.argv[2] && process.argv[3], 'PRIVATE_CLI and HELPER are required');
assert.ok(cli.startsWith(os.tmpdir() + path.sep), 'private CLI required');
process.env.BIT_RUST_CLIENT_VCS = 'off';
const repository = path.resolve(__dirname, '../..');
const preliminary = process.env.BIT_HISTORY_RESET_DIFFERENTIAL_PRELIMINARY === '1';
const marker = JSON.parse(fs.readFileSync(path.join(cli, '.bit-object-import-build.json')));
const digest = (filename) => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const bindings = new Map([
  [__filename, digest(__filename)],
  [helper, digest(helper)],
]);
for (const [filename, sha] of Object.entries(marker.sourceSha256)) {
  const absolute = path.join(repository, filename);
  if (!preliminary) {
    assert.equal(digest(absolute), sha, filename);
    bindings.set(absolute, sha);
  }
}
for (const entry of marker.compiledModules) {
  const absolute = path.join(cli, 'node_modules/@teambit', entry.path);
  assert.equal(digest(absolute), entry.sha256, entry.path);
  bindings.set(absolute, entry.sha256);
}
const requireCli = createRequire(path.join(cli, 'package.json'));
const { ModelComponent, Ref, Version, Lane } = requireCli('@teambit/objects');
const { ComponentID, ComponentIdList } = requireCli('@teambit/component-id');
const { SnapsDistance } = requireCli('@teambit/component.snap-distance');
const { DependencyGraph } = requireCli('@teambit/legacy.dependency-graph');
const { sourceIdentity } = require('./artifacts/contract.cjs');
const nativeSourceDigest = sourceIdentity(repository);
for (const filename of Object.keys(require.cache)) {
  if (filename.startsWith(cli + path.sep)) bindings.set(filename, digest(filename));
}
const child = spawn(helper, ['--threads', '1'], { stdio: ['pipe', 'pipe', 'inherit'] });
let sequence = 0;
let buffered = Buffer.alloc(0);
let pending;
function fail(error) {
  if (pending) {
    clearTimeout(pending.timer);
    pending.reject(error);
    pending = undefined;
  }
  child.kill();
}
child.on('error', fail);
child.on('exit', (code) => {
  if (pending) fail(new Error(`helper exited ${code}`));
});
child.stdout.on('data', (chunk) => {
  buffered = Buffer.concat([buffered, chunk]);
  if (buffered.length > 4 * 1024 * 1024) return fail(new Error('oversized helper response'));
  const newline = buffered.indexOf(10);
  if (newline < 0) return;
  try {
    assert.ok(pending, 'unsolicited helper response');
    const response = JSON.parse(buffered.subarray(0, newline));
    buffered = buffered.subarray(newline + 1);
    assert.equal(buffered.length, 0, 'multiple helper responses');
    assert.equal(response.version, 1);
    assert.equal(response.id, pending.id);
    assert.equal(response.completed, 1);
    assert.deepEqual(response.skipped, []);
    assert.equal(response.failed, false);
    clearTimeout(pending.timer);
    pending.resolve(response);
    pending = undefined;
  } catch (error) {
    fail(error);
  }
});
const request = (input) =>
  new Promise((resolve, reject) => {
    assert.equal(pending, undefined);
    const bytes = Buffer.from(JSON.stringify(input));
    assert.ok(bytes.length <= 4 * 1024 * 1024);
    const header = Buffer.alloc(12);
    header.write('BMT1');
    header.writeUInt32BE(++sequence, 4);
    header.writeUInt32BE(bytes.length, 8);
    pending = {
      id: sequence,
      resolve,
      reject,
      timer: setTimeout(() => fail(new Error('helper request timeout')), 30000),
    };
    child.stdin.write(Buffer.concat([header, bytes]));
  });
const hash = (index) => (index + 1).toString(16).padStart(40, '0');
function generator(seed) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}
function version(index, dependencies = []) {
  return new Version({
    hash: hash(index),
    mainFile: 'index.js',
    files: [{ name: 'index.js', relativePath: 'index.js', file: new Ref(hash(9999)), test: false }],
    log: { message: 'seeded history reset', date: '1700000000000' },
    dependencies: [],
    devDependencies: [],
    flattenedDependencies: ComponentIdList.fromArray(dependencies),
  });
}
async function local(seed) {
  const random = generator(seed);
  const refs = Array.from({ length: 12 }, (_, index) => new Ref(hash(index)));
  const tags = {};
  const orphaned = {};
  for (let index = 0; index < 8; index++) tags[`1.0.${index}`] = refs[Math.floor(random() * refs.length)];
  for (let index = 0; index < 4; index++) orphaned[`1.0.${index}`] = refs[Math.floor(random() * refs.length)];
  const model = ModelComponent.from({
    name: 'local',
    scope: 'qualification',
    versions: tags,
    orphanedVersions: orphaned,
    head: refs[0],
  });
  if (seed % 3 === 0) model.lastFoundTag = '1.0.2';
  const originalTagCache = model.lastFoundTag;
  const sourceOnly = [...refs];
  model.divergeData = new SnapsDistance(sourceOnly, [], undefined);
  const onLane = seed % 2 === 0;
  const lane = onLane
    ? new Lane({
        name: 'reset',
        scope: 'qualification',
        hash: hash(100),
        components: [{ id: model.toComponentId(), head: refs[3] }],
      })
    : undefined;
  const objects = new Map();
  const metadata = refs.map((ref, index) => {
    if (index !== 3 && random() < 0.15) return { hash: ref.toString(), missing: true };
    const row = version(index);
    row.origin = random() < 0.4 ? { lane: { name: 'reset', scope: 'qualification' } } : undefined;
    row.squashed =
      random() < 0.2
        ? { previousParents: [], laneId: { name: 'old', scope: 'qualification' }, log: row.log }
        : undefined;
    row.unrelated = random() < 0.2 ? { head: refs[0], laneId: { name: 'old', scope: 'qualification' } } : undefined;
    objects.set(ref.toString(), row);
    return {
      hash: ref.toString(),
      originLane: Boolean(row.originLaneId),
      squashed: Boolean(row.squashed),
      unrelated: Boolean(row.unrelated),
    };
  });
  const response = await request({
    kind: 'historyResetLocalVersions',
    sourceOnly: refs.map((ref) => ref.toString()),
    lane: onLane,
    ...(onLane ? { laneHead: refs[3].toString() } : {}),
    metadata,
    tags: Object.entries(tags).map(([label, ref]) => ({ label, hash: ref.toString() })),
    orphaned: Object.entries(orphaned).map(([label, ref]) => ({ label, hash: ref.toString() })),
    ...(originalTagCache ? { lastFoundTag: originalTagCache } : {}),
  });
  const expected = await model.getLocalHashes({ load: async (ref) => objects.get(ref.toString()) }, undefined, lane);
  const labels = model.switchHashesWithTagsIfExist(expected);
  assert.deepEqual(
    response.data.selected.map((row) => refs[row.source]),
    expected
  );
  assert.deepEqual(response.data.labels, labels);
  assert.equal(response.data.lastFoundTagPresent, model.lastFoundTag !== undefined);
  assert.equal(response.data.lastFoundTag, model.lastFoundTag);
  if (!onLane) assert.equal(expected, sourceOnly, 'canonical main local-ref array alias is retained');
  for (const ref of expected) assert.ok(refs.includes(ref), 'canonical Ref aliases retained');
}
async function dependents(seed) {
  const random = generator(seed);
  const components = [];
  const versions = new Map();
  const rows = [];
  const ids = Array.from({ length: 5 }, (_, index) => ComponentID.fromString(`qualification/component${index}`));
  for (let index = 0; index < ids.length; index++) {
    const tags = {};
    const orphaned = {};
    for (let label = 0; label < 4; label++) {
      const ref = new Ref(hash(100 + index * 10 + label));
      tags[`1.0.${label}`] = ref;
      const deps = ids.filter(() => random() < 0.35).map((id) => id.changeVersion(`1.0.${Math.floor(random() * 5)}`));
      versions.set(ref.toString(), version(100 + index * 10 + label, deps));
    }
    // Orphaned labels overwrite normal lookup, without moving the original property key.
    orphaned['1.0.1'] = new Ref(hash(500 + index));
    versions.set(hash(500 + index), version(500 + index, [ids[(index + 1) % ids.length].changeVersion('1.0.4')]));
    orphaned['1.0.4'] = new Ref(hash(600 + index));
    versions.set(hash(600 + index), version(600 + index, []));
    const model = ModelComponent.from({
      name: ids[index].name,
      scope: 'qualification',
      versions: tags,
      orphanedVersions: orphaned,
    });
    components.push(model);
    for (const label of Object.keys(model.versionsIncludeOrphaned)) {
      const value = versions.get(model.versionsIncludeOrphaned[label].toString());
      rows.push({
        id: model.toComponentId().changeVersion(label).toString(),
        dependencies: value.flattenedDependencies.map((id) => id.toString()),
      });
    }
  }
  const queries = ids.flatMap((id) => Array.from({ length: 5 }, (_, index) => id.changeVersion(`1.0.${index}`)));
  const exclude = queries.filter(() => random() < 0.25).map((id) => id.toString());
  const response = await request({
    kind: 'historyResetDependents',
    rows,
    queries: queries.map((id) => id.toString()),
    exclude,
  });
  const graph = await DependencyGraph.loadAllVersions({
    list: async () => components,
    objects: { load: async (ref) => versions.get(ref.toString()) },
  });
  const expected = queries.map((id) => graph.getImmediateDependentsPerId(id));
  assert.deepEqual(response.data.dependents, expected);
  assert.deepEqual(
    response.data.outside,
    expected.map((deps) => deps.filter((id) => !exclude.includes(id)))
  );
  for (const component of components)
    for (const label of Object.keys(component.versionsIncludeOrphaned)) {
      const value = versions.get(component.versionsIncludeOrphaned[label].toString());
      assert.equal(
        value.id.toString(),
        component.toComponentId().toString(),
        'canonical graph sets original loaded Version.id'
      );
    }
}
(async () => {
  try {
    for (let seed = 1; seed <= 96; seed++) await local(seed);
    for (let seed = 1; seed <= 96; seed++) await dependents(seed);
    for (const [filename, sha] of bindings) assert.equal(digest(filename), sha, filename);
    assert.equal(sourceIdentity(repository), nativeSourceDigest);
    const report = {
      qualified: !preliminary,
      preliminary,
      seeds: { local: [1, 96], dependents: [1, 96] },
      cases: 192,
      helperSha256: digest(helper),
      nativeSourceDigest,
      cliProvenance: marker,
      bindings: Object.fromEntries(bindings),
    };
    if (process.argv[4]) fs.writeFileSync(process.argv[4], JSON.stringify(report, null, 2) + '\n');
    console.log('192 canonical history-reset differential cases passed');
  } finally {
    child.stdin.end();
  }
})().catch((error) => {
  console.error(error);
  child.kill();
  process.exitCode = 1;
});
