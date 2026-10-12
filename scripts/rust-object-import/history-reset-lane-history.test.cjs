const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { inflateSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const { source, installed, root } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_HISTORY_RESET_COMPILED === '1';
const base = path.dirname(installed.resolve('@teambit/objects'));
const moduleAt = (name) =>
  compiled ? require(path.join(base, 'objects', name + '.js')) : source('scopes/scope/objects/objects/' + name + '.ts');
if (!compiled) source('scopes/scope/objects/models/index.ts');
const { LaneHistory } = compiled
  ? installed('@teambit/objects')
  : source('scopes/scope/objects/models/lane-history.ts');
const metadata = moduleAt('rust-snapshot-metadata');
const transaction = moduleAt('rust-snapshot-transaction');

async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-reset-lane-history-'));
  const previous = { flag: process.env.BIT_RUST_CLIENT_VCS, helper: process.env.BIT_RUST_OBJECT_IMPORT };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT =
    process.env.BIT_TEST_OBJECT_IMPORT ||
    path.join(root, 'native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));
  t.after(async () => {
    for (const [key, value] of [
      ['BIT_RUST_CLIENT_VCS', previous.flag],
      ['BIT_RUST_OBJECT_IMPORT', previous.helper],
    ])
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function historyValue() {
  const history = {};
  history['10'] = {
    log: { date: '10', message: 'Ω🌱\nsecond', omitted: undefined },
    components: ['qualification/main@' + 'a'.repeat(40)],
    nested: { z: undefined, 2: 'numeric', 1: 'first' },
  };
  history['2'] = { log: { date: '2' }, components: [], updateDependents: [], deleted: undefined };
  history.batch = {
    log: { date: '5' },
    components: [],
    updateDependents: ['qualification/hidden@' + 'b'.repeat(40)],
    arbitrary: [undefined, null, -0, { 3: 'three', 1: 'one', optional: undefined }],
  };
  return new LaneHistory({ name: 'reset-history', scope: 'qualification', laneHash: 'c'.repeat(40), history });
}

test('real LaneHistory native projection preserves canonical compact/pretty bytes and mutable-body identity', async (t) => {
  const directory = await setup(t);
  const value = historyValue();
  const identity = createHash('sha1')
    .update('c'.repeat(40) + ':LaneHistory')
    .digest('hex');
  assert.equal(value.hash().toString(), identity);
  for (const pretty of [false, true]) {
    const projected = metadata.prepareRustSnapshotMetadata(value);
    assert.equal(projected?.type, 'LaneHistory', 'actual defining LaneHistory class must be eligible');
    const stagingDirectory = await fs.mkdtemp(path.join(directory, 'spool-'));
    await transaction.withRustSnapshotTransaction(async () => {
      const result = await transaction.requestRustSnapshotTransaction(
        { kind: 'snapshotSerialize', objects: [{ ...projected, hash: identity }], stagingDirectory, pretty },
        (data) => data?.count === 1 && data.objects?.length === 1
      );
      assert.ok(result, 'native LaneHistory serializer must accept actual metadata AST');
      const row = result.objects[0];
      assert.equal(row.hash, identity);
      assert.equal(row.type, 'LaneHistory');
      const compressed = await fs.readFile(row.compressedPath);
      assert.equal(createHash('sha1').update(compressed).digest('hex'), row.compressedSha1);
      const body = value.toBuffer(pretty);
      const expected = Buffer.concat([Buffer.from(value.getHeader(body)), body]);
      assert.deepEqual(inflateSync(compressed), expected);
    });
  }
  const alias = value.getHistory();
  const retained = alias['2'];
  value.removeHistoryEntries(['10', 'batch', '10', 'absent']);
  assert.equal(value.getHistory(), alias, 'canonical pruning retains original history map');
  assert.equal(alias['2'], retained, 'retained rows keep original aliases');
  assert.equal(value.hash().toString(), identity, 'history content mutations do not change object identity');
});

test('LaneHistory custom history accessors decline without reading them or changing aliases', async (t) => {
  await setup(t);
  const value = historyValue();
  let reads = 0;
  Object.defineProperty(value.getHistory().batch, 'custom', {
    enumerable: true,
    get() {
      reads++;
      throw Error('hook');
    },
  });
  assert.equal(metadata.prepareRustSnapshotMetadata(value), undefined);
  assert.equal(reads, 0);
  const another = historyValue();
  Object.defineProperty(another, 'history', {
    enumerable: true,
    get() {
      reads++;
      throw Error('history');
    },
  });
  assert.equal(metadata.prepareRustSnapshotMetadata(another), undefined);
  assert.equal(reads, 0);
});
