const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { root, installed, source } = require('./load-source.cjs');
const { createMergeFixture } = require('./merge-history-fixture.cjs');
const compiled = process.env.BIT_TEST_MERGE_HISTORY_COMPILED === '1';
const objectsRoot = path.dirname(installed.resolve('@teambit/objects'));
const loadClass = (relative) =>
  (compiled ? require(path.join(objectsRoot, `${relative}.js`)) : source(`scopes/scope/objects/${relative}.ts`))
    .default;
const Repository = loadClass('objects/repository');
const Ref = loadClass('objects/ref');
const Version = loadClass('models/version');
const VersionHistory = loadClass('models/version-history');
const ModelComponent = loadClass('models/model-component');
const snapshot = compiled
  ? require(path.join(objectsRoot, 'objects/rust-snapshot.js'))
  : source('scopes/scope/objects/objects/rust-snapshot.ts');
const helper = process.env.BIT_TEST_OBJECT_IMPORT || path.join(root, 'native/target/debug/bit-object-import');
async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-history-population-'));
  const previousFlag = process.env.BIT_RUST_CLIENT_VCS;
  const previousHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  const types = installed('@teambit/legacy.scope').typesObj;
  const previousVersion = types.Version;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  types.Version = Version;
  t.after(async () => {
    types.Version = previousVersion;
    if (previousFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = previousFlag;
    if (previousHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = previousHelper;
    await fs.rm(directory, { recursive: true, force: true });
  });
  // Fixtures use the installed parser while writing their canonical model objects.
  types.Version = previousVersion;
  const fixture = await createMergeFixture(process.env.BIT_LEGACY_ROOT, directory);
  const remote = await fixture.publishRemoteSibling();
  types.Version = Version;
  const scopeJson = JSON.parse(await fs.readFile(path.join(directory, 'scope.json'), 'utf8'));
  const repo = await Repository.create({ scopePath: directory, scopeJson });
  const head = new Ref(remote);
  const model = ModelComponent.from({ name: 'component', scope: 'qualification.merge', versions: {}, head });
  const history = new VersionHistory({ name: 'component', scope: 'qualification.merge', versions: [] });
  return { directory, repo, head, model, history, base: fixture.baseRef };
}
function populate(fixture) {
  return snapshot.withRustSnapshotOperation(() =>
    fixture.model.populateVersionHistoryIfMissingGracefully(fixture.repo, fixture.history, fixture.head)
  );
}
function publicOutcome(value) {
  return { error: value.err?.constructor.name, added: value.added?.map((row) => row.hash.toString()) };
}

test('public native history population persists records and preserves cached parent identities', async (t) => {
  const fixture = await setup(t);
  const cached = await fixture.repo.load(fixture.head);
  const result = await populate(fixture);
  assert.deepEqual(
    result.added.map((row) => row.hash.toString()),
    [fixture.head.toString(), fixture.base]
  );
  assert.equal(result.added[0].parents, cached.parents);
  assert.equal(fixture.history.versions[0].parents[0], cached.parents[0]);
  const persisted = await fs.readFile(fixture.repo.objectPath(fixture.history.hash()));
  assert.ok(persisted.length);
  assert.deepEqual(await populate(fixture), {});
});

test('public history population preserves canonical graceful errors for missing heads and parents', async (t) => {
  const fixture = await setup(t);
  const originalHead = fixture.head;
  fixture.head = new Ref('f'.repeat(40));
  const missingHead = await populate(fixture);
  assert.equal(missingHead.err.constructor.name, 'HeadNotFound');
  assert.deepEqual(fixture.history.versions, []);
  fixture.head = originalHead;
  await fs.rm(fixture.repo.objectPath(new Ref(fixture.base)));
  const missingParent = await populate(fixture);
  assert.equal(missingParent.err.constructor.name, 'ParentNotFound');
  assert.deepEqual(
    missingParent.added.map((row) => row.hash.toString()),
    [fixture.head.toString()]
  );
  assert.deepEqual(fixture.history.versions, []);
});

test('public history population honors pending Version ancestry and custom parser hooks', async (t) => {
  const fixture = await setup(t);
  const pending = await fixture.repo.load(fixture.head);
  pending.parents = [];
  fixture.repo.add(pending);
  const result = await populate(fixture);
  assert.deepEqual(
    result.added.map((row) => row.hash.toString()),
    [fixture.head.toString()]
  );
  assert.deepEqual(fixture.history.versions[0].parents, []);
  const next = await setup(t);
  const parse = Version.parse;
  let calls = 0;
  Version.parse = function (...args) {
    calls++;
    return parse.apply(this, args);
  };
  try {
    assert.ok((await populate(next)).added.length > 0);
    assert.ok(calls > 0, 'custom Version parser must retain canonical traversal');
  } finally {
    Version.parse = parse;
  }
});

test('concurrent public populations preserve canonical added-head return semantics under the mutex', async (t) => {
  const fixture = await setup(t);
  const results = await snapshot.withRustSnapshotOperation(() =>
    Promise.all([
      fixture.model.populateVersionHistoryIfMissingGracefully(fixture.repo, fixture.history, fixture.head),
      fixture.model.populateVersionHistoryIfMissingGracefully(fixture.repo, fixture.history, fixture.head),
    ])
  );
  assert.deepEqual(
    results[0].added.map((row) => row.hash.toString()),
    [fixture.head.toString(), fixture.base]
  );
  assert.deepEqual(
    results[1].added.map((row) => row.hash.toString()),
    [fixture.head.toString()]
  );
  assert.deepEqual(
    fixture.history.versions.map((row) => row.hash.toString()),
    [fixture.head.toString(), fixture.base]
  );
});
