const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { deflateSync } = require('node:zlib');
const { installed } = require('./load-source.cjs');
const { readRustMiniStatus } = installed('@teambit/bit/dist/rust-mini-status.js');
const hash = (bytes) => createHash('sha1').update(bytes).digest('hex');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-cold-status-'));
  const previous = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_OBJECT_IMPORT = process.env.BIT_TEST_OBJECT_IMPORT;
  t.after(async () => {
    if (previous === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = previous;
    await fs.rm(root, { recursive: true, force: true });
  });
  async function write(name, bytes) {
    const file = path.join(root, name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
  }
  const json = (name, value) => write(name, JSON.stringify(value));
  async function object(type, ref, value) {
    const body = JSON.stringify(value);
    await write(
      `.bit/objects/${ref.slice(0, 2)}/${ref.slice(2)}`,
      deflateSync(Buffer.from(`${type} ${ref} ${body.length}\0${body}`))
    );
  }
  const bitmap = {
    alpha: {
      name: 'alpha',
      scope: '',
      version: '1.0.0',
      defaultScope: 'test.scope',
      rootDir: 'alpha',
      mainFile: 'index.js',
    },
    '$schema-version': '17.0.0',
  };
  await json('workspace.jsonc', { 'teambit.workspace/workspace': { defaultScope: 'test.scope' } });
  await json('.bit/scope.json', { lanes: { current: 'main' } });
  await json('.bitmap', bitmap);
  await write('alpha/index.js', 'hello\n');
  await object('Component', hash('test.scope/alpha'), {
    name: 'alpha',
    scope: 'test.scope',
    versions: { '1.0.0': 'a'.repeat(40) },
  });
  const version = {
    mainFile: 'index.js',
    log: {},
    dependencies: [],
    devDependencies: [],
    files: [{ relativePath: 'index.js', name: 'index.js', test: false, file: hash('hello\n') }],
  };
  await object('Version', 'a'.repeat(40), version);
  return { root, write, json, object, bitmap, version, read: () => readRustMiniStatus(root, root) };
}
const empty = { modified: [], newComps: [], compWithIssues: [] };
test('cold status compares native repository models and current bytes without stale Version caching', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.read(), empty);
  await f.write('alpha/index.js', '\ufeffhello\r\n');
  assert.deepEqual(await f.read(), empty);
  await f.write('alpha/index.js', 'changed\n');
  assert.deepEqual((await f.read()).modified, ['test.scope/alpha']);
  f.version.files[0].file = hash('changed\n');
  await f.object('Version', 'a'.repeat(40), f.version);
  assert.deepEqual(await f.read(), empty);
});
test('native command owns installed ignore syntax and component-local policy', async (t) => {
  const f = await fixture(t);
  await f.write('.gitignore', '**/*.tmp\n');
  await f.write('alpha/.bitignore', 'skip.log\n.bitignore\n');
  await f.write('alpha/ignored.tmp', 'not source');
  await f.write('alpha/skip.log', 'not source');
  assert.deepEqual(await f.read(), empty);
  await f.write('alpha/added.js', 'new source');
  assert.deepEqual((await f.read()).modified, ['test.scope/alpha']);
});
test('unversioned components and missing models preserve mini-status semantics', async (t) => {
  const f = await fixture(t);
  f.bitmap.alpha.version = '';
  await f.json('.bitmap', f.bitmap);
  assert.deepEqual(await f.read(), { ...empty, newComps: ['test.scope/alpha'] });
  f.bitmap.alpha.version = '1.0.0';
  await f.json('.bitmap', f.bitmap);
  const ref = hash('test.scope/alpha');
  await fs.rm(path.join(f.root, '.bit/objects', ref.slice(0, 2), ref.slice(2)));
  assert.deepEqual(await f.read(), empty);
});
test('orphaned tag resolution precedes regular tags', async (t) => {
  const f = await fixture(t);
  await f.object('Component', hash('test.scope/alpha'), {
    name: 'alpha',
    scope: 'test.scope',
    versions: { '1.0.0': 'b'.repeat(40) },
    orphanedVersions: { '1.0.0': 'a'.repeat(40) },
  });
  assert.deepEqual(await f.read(), empty);
});
test('unknown extensions, lanes, global config and non-ASCII paths decline without a partial summary', async (t) => {
  const f = await fixture(t);
  await f.json('.bitrc.jsonc', {});
  assert.equal(await f.read(), undefined);
  await fs.rm(path.join(f.root, '.bitrc.jsonc'));
  await f.json('.bit/scope.json', { lanes: { current: 'feature' } });
  assert.equal(await f.read(), undefined);
  await f.json('.bit/scope.json', { lanes: { current: 'main' } });
  await f.write('alpha/ı.js', 'unsupported legacy case fold');
  assert.equal(await f.read(), undefined);
  await fs.rm(path.join(f.root, 'alpha/ı.js'));
  await f.json('workspace.jsonc', { 'teambit.workspace/workspace': {}, 'custom.scope/hook': {} });
  assert.equal(await f.read(), undefined);
});
test('missing native helper preserves the canonical fallback boundary', async (t) => {
  const f = await fixture(t);
  process.env.BIT_RUST_OBJECT_IMPORT = path.join(f.root, 'missing-helper');
  assert.equal(await f.read(), undefined);
});
test('invalid identities and latest-version placeholders stay on the canonical parser', async (t) => {
  const f = await fixture(t);
  f.bitmap.alpha.name = 'invalid.name';
  await f.json('.bitmap', f.bitmap);
  assert.equal(await f.read(), undefined);
  f.bitmap.alpha.name = 'alpha';
  f.bitmap.alpha.version = 'latest';
  await f.json('.bitmap', f.bitmap);
  assert.equal(await f.read(), undefined);
  f.bitmap.alpha.version = '01.0.0';
  await f.json('.bitmap', f.bitmap);
  assert.equal(await f.read(), undefined);
});
test('workspace-root status excludes nested components and normalizes its bitmap', async (t) => {
  const f = await fixture(t);
  f.bitmap.root = {
    name: 'root',
    scope: '',
    version: '1.0.0',
    defaultScope: 'test.scope',
    rootDir: '.',
    mainFile: 'root.js',
  };
  await f.json('.bitmap', f.bitmap);
  await f.write('root.js', 'root source\n');
  const { normalizeBitmapContentForVersioning } = installed('@teambit/legacy.bit-map');
  const files = [];
  for (const relativePath of ['.bitmap', 'workspace.jsonc', 'root.js']) {
    const bytes = await fs.readFile(path.join(f.root, relativePath));
    files.push({
      relativePath,
      name: relativePath,
      test: false,
      file: hash(relativePath === '.bitmap' ? normalizeBitmapContentForVersioning(bytes.toString()) : bytes),
    });
  }
  await f.object('Component', hash('test.scope/root'), {
    name: 'root',
    scope: 'test.scope',
    versions: { '1.0.0': 'b'.repeat(40) },
  });
  await f.object('Version', 'b'.repeat(40), { ...f.version, mainFile: 'root.js', files });
  assert.deepEqual(await f.read(), empty);
  await f.write('.bitmap', '// formatting is not a Source change\n' + JSON.stringify(f.bitmap, null, 4));
  assert.deepEqual(await f.read(), empty);
  await f.write('alpha/index.js', 'only the nested component changed\n');
  assert.deepEqual((await f.read()).modified, ['test.scope/alpha']);
});
