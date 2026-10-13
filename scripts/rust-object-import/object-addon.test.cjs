const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { installed } = require('./load-source.cjs');
const { NativeImportOperation } = installed('@teambit/objects/dist/objects/rust-object-operation.js');
const { WorkspaceEngine } = require(process.env.BIT_TEST_WORKSPACE_ADDON);

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-object-addon-'));
  const objectsDirectory = path.join(directory, 'objects');
  await fs.mkdir(objectsDirectory);
  const operation = new NativeImportOperation(process.env.BIT_TEST_OBJECT_IMPORT, { objectsDirectory });
  t.after(async () => {
    await operation.disposeAndWait();
    await fs.rm(directory, { force: true, recursive: true });
  });
  return { directory, objectsDirectory, operation };
}

test('compiled import operations use the addon for coalesced decisions and durable writes', async (t) => {
  const { directory, operation } = await fixture(t);
  assert.deepEqual(await Promise.all([
    operation.request({ kind: 'version', existing: '9', incoming: '10' }, (value) => value),
    operation.request({ kind: 'version', existing: '1', incoming: '2' }, (value) => value),
  ]), [true, false]);
  assert.ok(operation.engine instanceof WorkspaceEngine);
  assert.equal(operation.child, undefined);
  assert.equal(operation.stats.frames, 1);
  if (process.platform !== 'linux') return;
  assert.equal(await operation.request({ kind: 'indexWrite', contents: '{"components":[]}' }, (value) => value), true);
  assert.equal(await fs.readFile(path.join(directory, 'index.json'), 'utf8'), '{"components":[]}');
});

test('object operation retirement waits for native completion before exposing fallback', async (t) => {
  const { operation } = await fixture(t);
  await operation.request({ kind: 'version', existing: 'a', incoming: 'b' }, (value) => value);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const request = operation.engine.request.bind(operation.engine);
  operation.engine.request = async (input) => {
    try { return await request(input); }
    finally { await gate; }
  };
  let completed = false;
  const pending = operation.request({ kind: 'version', existing: 'b', incoming: 'a' }, (value) => value)
    .then((value) => { completed = true; return value; });
  await new Promise((resolve) => setImmediate(resolve));
  let disposed = false;
  const disposal = operation.disposeAndWait().then(() => { disposed = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(completed, false);
  assert.equal(disposed, false);
  release();
  assert.equal(await pending, undefined);
  await disposal;
});
