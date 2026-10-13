const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { source, installed } = require('../rust-object-import/load-source.cjs');
const prefix = 'scopes/dependencies/dependencies/files-dependency-builder/rust-scanner/';
const load = (name) => process.env.BIT_TEST_SCANNER_COMPILED
  ? installed('@teambit/dependencies/dist/files-dependency-builder/rust-scanner/'+name+'.js')
  : source(prefix+name+'.ts');
const { readNativeDependencyCache, nativeDependencyCacheStale } = load('dependency-cache');
const { RustDependencyScannerSession } = load('session');
const { FsCache } = installed('@teambit/workspace.modules.fs-cache');
const cacheRequire = createRequire(installed.resolve('@teambit/workspace.modules.fs-cache'));
const cacache = cacheRequire('cacache');
assert.ok(process.env.BIT_TEST_OBJECT_IMPORT && process.env.BIT_TEST_WORKSPACE_ADDON, 'actual addon required');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-native-cache-adapter-'));
  const previous = { ...process.env };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = process.env.BIT_TEST_OBJECT_IMPORT;
  delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
  const cache = new FsCache(root);
  cache.isNoFsCacheFeatureEnabled = false;
  const directory = path.join(cache.basePath, 'deps');
  t.after(() => { process.env = previous; cacache.clearMemoized(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, cache, directory, key: 'scope/comp@1.0.0' };
}
test('cache adapter consumes actual native hits, misses and fresh payloads', async (t) => {
  const f = fixture(t);
  assert.equal(await readNativeDependencyCache(f.cache, f.key), null);
  await f.cache.saveDependenciesDataInCache(f.key, '{"dependencies":[]}');
  assert.deepEqual(await readNativeDependencyCache(f.cache, f.key), await f.cache.getDependenciesDataFromCache(f.key));
  await f.cache.saveDependenciesDataInCache(f.key, '{"dependencies":["changed"]}');
  assert.equal((await readNativeDependencyCache(f.cache, f.key)).data, '{"dependencies":["changed"]}');
  await f.cache.deleteDependenciesDataCache(f.key);
  assert.equal(await readNativeDependencyCache(f.cache, f.key), null);
});
test('cache overrides, disabled caching and memoized aliases retain canonical dispatch', async (t) => {
  const f = fixture(t);
  await cacache.put(f.directory, f.key, 'memoized', { memoize: true, metadata: { timestamp: Date.now() } });
  const entry = await cacache.get.info(f.directory, f.key);
  fs.unlinkSync(entry.path);
  assert.equal(await readNativeDependencyCache(f.cache, f.key), undefined);
  assert.equal((await f.cache.getDependenciesDataFromCache(f.key)).data, 'memoized');
  cacache.clearMemoized();
  let calls = 0;
  f.cache.getDependenciesDataFromCache = async () => { calls++; return { data: 'override', timestamp: 1 }; };
  assert.equal(await readNativeDependencyCache(f.cache, f.key), undefined);
  assert.equal(calls, 0);
  delete f.cache.getDependenciesDataFromCache;
  f.cache.isNoFsCacheFeatureEnabled = true;
  assert.equal(await readNativeDependencyCache(f.cache, f.key), undefined);
  assert.equal(await f.cache.getDependenciesDataFromCache(f.key), null);
});
test('integrity failures retain canonical cache eviction and do not poison later native reads', async (t) => {
  const f = fixture(t);
  await f.cache.saveDependenciesDataInCache(f.key, 'original');
  const entry = await cacache.get.info(f.directory, f.key);
  fs.writeFileSync(entry.path, 'corrupt');
  assert.equal(await readNativeDependencyCache(f.cache, f.key), undefined);
  assert.equal(await f.cache.getDependenciesDataFromCache(f.key), null);
  assert.equal(fs.existsSync(f.directory), false);
  await f.cache.saveDependenciesDataInCache(f.key, 'new');
  assert.equal((await readNativeDependencyCache(f.cache, f.key)).data, 'new');
});
test('freshness adapter preserves filesystem hooks and observes edits without caching stat results', async (t) => {
  const f = fixture(t);
  const file = path.join(f.root, 'file.js');
  fs.writeFileSync(file, '');
  const timestamp = Date.now()+10000;
  const pattern = f.root.split(path.sep).join('/');
  assert.equal(await nativeDependencyCacheStale(pattern, [file], timestamp), false);
  fs.utimesSync(file, (timestamp+1000)/1000, (timestamp+1000)/1000);
  assert.equal(await nativeDependencyCacheStale(pattern, [file], timestamp), true);
  assert.equal(await nativeDependencyCacheStale(f.root+'\\escaped', [file], timestamp), undefined);
  if (process.platform === 'win32')
    assert.equal(await nativeDependencyCacheStale(f.root, [file], timestamp), undefined);
  const r = createRequire(installed.resolve('@teambit/toolbox.fs.last-modified'));
  const filesystem = r('fs-extra');
  const original = filesystem.stat;
  filesystem.stat = async (...args) => original(...args);
  try { assert.equal(await nativeDependencyCacheStale(pattern, [file], timestamp), undefined); }
  finally { filesystem.stat = original; }
});
test('cache responses respect session byte limits and retire failed sessions', async (t) => {
  const f = fixture(t);
  await f.cache.saveDependenciesDataInCache(f.key, 'x'.repeat(2048));
  const session = new RustDependencyScannerSession({ executable: process.env.BIT_TEST_OBJECT_IMPORT,
    workspaceAddon: process.env.BIT_TEST_WORKSPACE_ADDON, maxResponseBytes: 512 });
  t.after(() => session.dispose());
  assert.equal(await session.readDependencyCache(f.directory, f.key), undefined);
  assert.ok(session.unavailableReason);
});

test('reader overrides registered before the adapter loads cannot be captured as native defaults', (t) => {
  const f = fixture(t);
  const { spawnSync } = require('node:child_process');
  const run = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const path = require('node:path');
    const { source, installed } = require(${JSON.stringify(path.resolve(__dirname, '../rust-object-import/load-source.cjs'))});
    const { FsCache, nativeDependencyCacheDirectory } = installed('@teambit/workspace.modules.fs-cache');
    let calls = 0;
    FsCache.prototype.getDependenciesDataFromCache = async () => { calls++; return { data:'override', timestamp:1 }; };
    const cache = new FsCache(${JSON.stringify(f.root)}); cache.isNoFsCacheFeatureEnabled = false;
    assert.equal(nativeDependencyCacheDirectory(cache), undefined);
    const timestamps = require(path.join(path.dirname(installed.resolve('@teambit/toolbox.fs.last-modified')), 'last-modified.js'));
    assert.equal(timestamps.canReadModificationTimestampsNatively(), true);
    timestamps.getLastModifiedComponentTimestampMs = async () => 42;
    assert.equal(timestamps.canReadModificationTimestampsNatively(), false);
    const api = process.env.BIT_TEST_SCANNER_COMPILED
      ? installed('@teambit/dependencies/dist/files-dependency-builder/rust-scanner/dependency-cache.js')
      : source('scopes/dependencies/dependencies/files-dependency-builder/rust-scanner/dependency-cache.ts');
    (async () => {
      assert.equal(await api.readNativeDependencyCache(cache,'scope/comp@1.0.0'),undefined);
      assert.equal(calls,0);
      assert.equal((await cache.getDependenciesDataFromCache('scope/comp@1.0.0')).data,'override');
      assert.equal(calls,1);
      assert.equal(await api.nativeDependencyCacheStale(${JSON.stringify(f.root)},[],1),undefined);
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], { env: process.env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
});
