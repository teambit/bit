const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { WorkspaceEngine } = require(process.env.BIT_TEST_WORKSPACE_ADDON);

function frame(id, value) {
  const body = Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(12);
  header.write('BWS1');
  header.writeUInt32BE(id, 4);
  header.writeUInt32BE(body.length, 8);
  return Buffer.concat([header, body]);
}

test('in-process engine preserves helper bytes, binary responses and persistent read tokens', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-addon-'));
  t.after(() => fs.rm(directory, { force: true, recursive: true }));
  const filename = path.join(directory, 'source.txt');
  await fs.writeFile(filename, '\ufefforiginal\r\n');
  const requests = [1, 2].map((id) => frame(id, { kind: 'read', files: [filename], binary: true, retain: true }));
  const expected = execFileSync(process.env.BIT_TEST_OBJECT_IMPORT, { input: Buffer.concat(requests) });
  const engine = new WorkspaceEngine(4);
  t.after(() => engine.close());
  const first = await engine.request(requests[0]);
  const saved = Buffer.from(first);
  const second = await engine.request(requests[1]);
  assert.deepEqual(Buffer.concat([first, second]), expected);
  assert.deepEqual(first, saved, 'subsequent requests cannot overwrite escaped output');
  assert.equal(JSON.parse(second.subarray(0, second.indexOf(10))).data.files[0].readToken, 2);
});

test('in-process requests own input bytes and reject concurrent requests', async (t) => {
  const engine = new WorkspaceEngine(2);
  t.after(() => engine.close());
  const input = frame(12, { kind: 'compare', left: 'same', right: 'same' });
  const pending = engine.request(input);
  input.fill(0);
  assert.throws(() => engine.request(input), /active request/);
  const response = JSON.parse(await pending);
  assert.equal(response.id, 12);
  assert.equal(response.failed, false);
  assert.equal(JSON.parse(await engine.request(frame(13, { kind: 'compare', left: 'x', right: 'y' }))).id, 13);
});

test('close retires active requests and malformed frames retire their engine', async () => {
  const engine = new WorkspaceEngine(1);
  const pending = engine.request(frame(1, { kind: 'compare', left: 'a', right: 'b' }));
  engine.close();
  await assert.rejects(pending, /closed/);
  assert.throws(() => engine.request(Buffer.alloc(0)), /closed/);
  const malformed = new WorkspaceEngine(1);
  await assert.rejects(malformed.request(Buffer.from('nope')), /invalid workspace frame/);
  assert.throws(() => malformed.request(Buffer.alloc(0)), /closed/);
});

function session() {
  const { installed } = require('./load-source.cjs');
  const { MaterializationSession } = installed('@teambit/component.sources/dist/rust-workspace-materializer.js');
  const value = new MaterializationSession(process.env.BIT_TEST_OBJECT_IMPORT);
  assert.ok(value.engine instanceof WorkspaceEngine, 'compiled adapter must actually select the addon');
  return value;
}

test('adapter disposal waits for active native completion before releasing the fallback', async () => {
  const value = session();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const request = value.engine.request.bind(value.engine);
  value.engine.request = async (input) => {
    try { return await request(input); }
    finally { await gate; }
  };
  let completed = false;
  const pending = value.request((id) => frame(id, { kind: 'compare', left: 'x', right: 'y' }), 1)
    .then((result) => { completed = true; return result; });
  await Promise.resolve();
  let disposed = false;
  const disposal = value.dispose().then(() => { disposed = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(completed, false);
  assert.equal(disposed, false);
  release();
  assert.equal(await pending, undefined);
  await disposal;
  assert.equal(value.usable, false);
});

test('synchronous binding failure and invalid acknowledgements retire without hanging', async () => {
  for (const invalidResponse of [false, true]) {
    const value = session();
    if (!invalidResponse) value.engine.request = () => { throw new Error('binding rejected input'); };
    const pending = value.request((id) => frame(id, { kind: 'compare', left: 'x', right: 'y' }), 1, () => false);
    assert.equal(await pending, undefined);
    await value.dispose();
    assert.equal(value.usable, false);
  }
});

test('command diagnostics observe genuine addon frames and acknowledgements', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-addon-trace-'));
  t.after(() => fs.rm(directory, { force: true, recursive: true }));
  const trace = path.join(directory, 'trace.json');
  const input = frame(3, { kind: 'compare', left: 'same', right: 'same' }).toString('hex');
  const env = { ...process.env, BIT_IMPORT_TRACE: trace, BIT_IMPORT_TRACE_PROTOCOL_ONLY: '1' };
  delete env.BIT_IMPORT_TRACE_OWNER;
  execFileSync(process.execPath, ['--require', path.join(__dirname, 'import-trace.cjs'), '-e', `
    const { WorkspaceEngine } = require(process.env.BIT_TEST_WORKSPACE_ADDON);
    const engine = new WorkspaceEngine(1);
    engine.request(Buffer.from('${input}', 'hex')).finally(() => engine.close());
  `], { env });
  const result = JSON.parse(await fs.readFile(trace));
  assert.equal(result.workspace.compare.completed, 1);
  assert.equal(result.workspace.compare.failed, 0);
  assert.equal(result.workspaceFrames.length, 1);
  assert.equal(result.workspaceFrames[0].backend, 'addon');
});

test('native requests complete while the Node worker pool is occupied', () => {
  const input = frame(7, { kind: 'compare', left: 'same', right: 'same' }).toString('hex');
  execFileSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const { pbkdf2 } = require('node:crypto');
    const { WorkspaceEngine } = require(process.env.BIT_TEST_WORKSPACE_ADDON);
    const occupied = new Promise((resolve, reject) => pbkdf2('input', 'salt', 5000000, 32, 'sha256', error => error ? reject(error) : resolve('node')));
    const engine = new WorkspaceEngine(4);
    (async () => {
      const native = engine.request(Buffer.from('${input}', 'hex')).then(() => 'rust');
      assert.equal(await Promise.race([occupied, native]), 'rust');
      engine.close();
      await occupied;
    })().catch(error => { engine.close(); console.error(error); process.exitCode = 1; });
  `], { env: { ...process.env, UV_THREADPOOL_SIZE: '1' }, timeout: 30000 });
});

test('independent owners share bounded Rust workers without blocking each other', async () => {
  const engines = Array.from({ length: 16 }, () => new WorkspaceEngine(4));
  try {
    const results = await Promise.all(engines.map((engine, index) =>
      engine.request(frame(index + 1, { kind: 'compare', left: 'same', right: 'same' }))));
    assert.deepEqual(results.map((result) => JSON.parse(result).id), engines.map((_, index) => index + 1));
  } finally {
    engines.forEach((engine) => engine.close());
  }
});
