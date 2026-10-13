const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { source, installed } = require('../rust-object-import/load-source.cjs');
const load = createRequire(installed.resolve('@teambit/workspace.modules.fs-cache'));
const cacache = load('cacache');
const { getLastModifiedComponentTimestampMs } = source('scopes/toolbox/fs/last-modified/last-modified.ts');
const helper = process.env.BIT_TEST_OBJECT_IMPORT;
assert.ok(helper, 'dependency cache parity requires an actual helper');
function native(request) {
  const body = Buffer.from(JSON.stringify(request));
  const header = Buffer.alloc(12);
  header.write('BWS1');
  header.writeUInt32BE(1, 4);
  header.writeUInt32BE(body.length, 8);
  return JSON.parse(execFileSync(helper, { input: Buffer.concat([header, body]), encoding: 'utf8' }));
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-native-dependency-cache-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cache = path.join(root, 'cache');
  return { root, cache, read: (key) => native({ kind: 'dependencyCacheRead', cache, key }) };
}
test('native cache reads match cacache hashes, newest records, deletions and missing content', async (t) => {
  const f = fixture(t);
  const key = 'scope/component@1.0.0';
  assert.deepEqual(f.read(key).data, { cache: null });
  for (const data of ['first', '{"dependencies":["λ🌱"]}', '']) {
    await cacache.put(f.cache, key, data, { metadata: { timestamp: 1700000000000 } });
    const expected = await cacache.get(f.cache, key);
    assert.deepEqual(f.read(key).data.cache, { timestamp: expected.metadata.timestamp, data: expected.data.toString() });
  }
  await cacache.rm.entry(f.cache, key);
  assert.deepEqual(f.read(key).data, { cache: null });
  await cacache.put(f.cache, key, 'restored', { metadata: { timestamp: 1700000000001 } });
  const entry = await cacache.get.info(f.cache, key);
  fs.unlinkSync(entry.path);
  assert.deepEqual(f.read(key).data, { cache: null });
});
test('native cache ignores corrupt index checksums and declines corrupt or unsupported payloads', async (t) => {
  const f = fixture(t);
  const key = 'scope/component@1.0.0';
  await cacache.put(f.cache, key, 'payload', { metadata: { timestamp: 1700000000000 } });
  const index = createRequire(load.resolve('cacache'))('./entry-index');
  fs.appendFileSync(index.bucketPath(f.cache, key), '\ninvalid\t{"key":"'+key+'","integrity":null}');
  assert.equal(f.read(key).data.cache.data, 'payload');
  const entry = await cacache.get.info(f.cache, key);
  fs.writeFileSync(entry.path, 'corrupt');
  assert.equal(f.read(key).failed, true);
  await cacache.put(f.cache, key, 'sha256', { algorithms: ['sha256'], metadata: { timestamp: 1700000000000 } });
  assert.equal(f.read(key).failed, true);
  assert.equal((await cacache.get(f.cache, key)).data.toString(), 'sha256');
});
test('native freshness agrees with recursive directory and explicit-file timestamp rules', async (t) => {
  const f = fixture(t);
  const root = path.join(f.root, 'component');
  const names = ['visible/child/file.js', '.hidden/child/file.js', 'node_modules/pkg/index.js', 'root.js'];
  for (const name of names) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
  }
  const base = 1600000000000;
  const stamp = (file, milliseconds) => fs.utimesSync(file, milliseconds / 1000, milliseconds / 1000);
  const all = [root, ...fs.readdirSync(root, { recursive: true }).map((file) => path.join(root, file))];
  for (const file of all) stamp(file, base);
  const files = [path.join(root, 'root.js'), path.join(root, 'missing.js')];
  const compare = async (timestamp) => {
    // Component-map directories are Linux paths. Globby requires forward
    // slashes on Windows; the native request carries a filesystem path.
    const expected = (await getLastModifiedComponentTimestampMs(root.split(path.sep).join('/'), files)) > timestamp;
    const actual = native({ kind: 'dependencyCacheFreshness', root, files, timestamp });
    assert.equal(actual.failed, false, JSON.stringify(actual));
    assert.equal(actual.data.stale, expected);
  };
  for (const file of all) {
    stamp(file, base + 2000);
    await compare(base + 1000);
    await compare(base + 2000);
    stamp(file, base);
  }
  files.push(path.join(root, '.hidden/child/file.js'));
  stamp(files.at(-1), base + 2000.5);
  await compare(base + 2000);
  await compare(base + 2001);
  const external = path.join(f.root, 'external');
  fs.mkdirSync(external);
  stamp(external, base+2000);
  try {
    fs.symlinkSync(external, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await compare(base+1000);
    await compare(Date.now()+10000);
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
  }
  fs.unlinkSync(files[0]);
  await compare(base + 1000);
});
test('native freshness declines directory symlinks and glob spellings for canonical traversal', (t) => {
  const f = fixture(t);
  const root = path.join(f.root, 'component');
  fs.mkdirSync(root);
  try {
    fs.symlinkSync(root, path.join(root, 'loop'), process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    if (error.code === 'EPERM') return t.skip('symlinks unavailable');
    throw error;
  }
  assert.equal(native({ kind: 'dependencyCacheFreshness', root, files: [], timestamp: 1700000000000 }).failed, true);
  assert.equal(native({ kind: 'dependencyCacheFreshness', root: root+'*', files: [], timestamp: 1700000000000 }).failed, true);
});
