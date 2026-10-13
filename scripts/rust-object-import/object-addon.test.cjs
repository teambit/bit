const { test } = require('node:test');
process.env.BIT_RUST_CLIENT_VCS = 'on';
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

const { spawnRustImportTransport } = installed('@teambit/legacy.scope/dist/objects-fetcher/rust-import-transport.js');
const { RustObjectImporter } = installed('@teambit/legacy.scope/dist/objects-fetcher/rust-object-importer.js');
const { ImportStreamEngine } = require(process.env.BIT_TEST_WORKSPACE_ADDON);
const { createHash } = require('node:crypto');
const { deflateSync } = require('node:zlib');

function sourceObject(text) {
  const body = Buffer.from(text), hash = createHash('sha1').update(body).digest('hex');
  return { ref: { toString: () => hash }, buffer: deflateSync(Buffer.concat([Buffer.from(`Source ${hash} ${text.length}\0`), body])) };
}

test('compiled Source imports keep validation and selection on one in-process owner', async (t) => {
  const { objectsDirectory } = await fixture(t);
  const importer = new RustObjectImporter(process.env.BIT_TEST_OBJECT_IMPORT, { objectsDirectory });
  t.after(() => importer.disposeAndWait());
  const item = sourceObject('native stream 🚀');
  const expected = Buffer.from(item.buffer);
  await importer.importBatch([item], async (values) => {
    assert.equal(importer.child.backend, 'addon');
    assert.ok(values[0]);
    assert.deepEqual(await fs.readdir(objectsDirectory), []);
    item.buffer.fill(0); // Selection cannot mutate the native bytes already validated.
    return [0];
  }, async (_, persisted) => assert.deepEqual([...persisted], [0]));
  const hash = item.ref.toString();
  assert.deepEqual(await fs.readFile(path.join(objectsDirectory, hash.slice(0, 2), hash.slice(2))), expected);
  await importer.disposeAndWait();
  assert.notEqual(importer.child.signalCode, null);
});

test('native import transport handles clean EOF, malformed input and cancellation without hanging', async () => {
  for (const kind of ['eof', 'invalid', 'cancel']) {
    const child = spawnRustImportTransport(process.env.BIT_TEST_OBJECT_IMPORT, []);
    assert.equal(child.backend, 'addon');
    const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({code, signal})));
    child.stdin.on('error', () => {});
    child.stdout.resume(); child.stderr.resume();
    if (kind === 'cancel') child.kill();
    else child.stdin.end(kind === 'invalid' ? Buffer.from('nope') : undefined);
    const result = await closed;
    assert.deepEqual(result, kind === 'cancel' ? {code:null,signal:'SIGTERM'} : {code:kind === 'eof' ? 0 : 1,signal:null});
  }
});

test('waiting import streams do not occupy shared Rayon workers and release their capacity', async () => {
  for (let index = 0; index < 20; index++) assert.throws(() => new ImportStreamEngine(() => {}, 0), /options/);
  const streams = [];
  try {
    for (let index = 0; index < 16; index++) {
      let closed;
      const stopped = new Promise(resolve => { closed = resolve; });
      const engine = new ImportStreamEngine(event => { if (event.kind === 'closed') closed(); }, 2);
      streams.push({engine, stopped});
    }
    assert.throws(() => new ImportStreamEngine(() => {}, 2), /limit/);
    const engine = new WorkspaceEngine(2);
    try {
      const body = Buffer.from(JSON.stringify({kind:'compare',left:'same',right:'same'}));
      const header = Buffer.alloc(12); header.write('BWS1'); header.writeUInt32BE(1,4); header.writeUInt32BE(body.length,8);
      let timer;
      try {
        const response = await Promise.race([engine.request(Buffer.concat([header,body])), new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error('waiting import owners blocked shared workers')), 5000);
        })]);
        assert.equal(JSON.parse(response).failed, false);
      } finally { clearTimeout(timer); }
    } finally { engine.close(); }
  } finally {
    streams.forEach(({engine}) => engine.close());
    await Promise.all(streams.map(({stopped}) => stopped));
  }
  let closed;
  const stopped = new Promise(resolve => { closed = resolve; });
  const replacement = new ImportStreamEngine(event => { if (event.kind === 'closed') closed(); }, 2);
  replacement.end();
  await stopped;
});
