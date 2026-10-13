const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const cp = require('node:child_process');
const { root, source } = require('./load-source.cjs');
const { nativeObjectDirectory } = source('scopes/scope/objects/objects/rust-object-directory.ts');
const native =
  process.env.BIT_TEST_OBJECT_IMPORT ||
  path.join(root, 'native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));
async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bit directory λ '));
  const previous = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_OBJECT_IMPORT = native;
  t.after(async () => {
    if (previous === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = previous;
    await fs.rm(dir, { recursive: true, force: true });
  });
  await Promise.all(Array.from({ length: 256 }, (_, i) => fs.mkdir(path.join(dir, i.toString(16).padStart(2, '0')))));
  return dir;
}
const hash = (prefix, n) => prefix + n.toString(16).padStart(38, '0');
const file = (dir, h) => path.join(dir, h.slice(0, 2), h.slice(2));

test('directory traversal streams multiple frames, preserves leaf directories and observes mutations', async (t) => {
  const dir = await setup(t);
  const hashes = Array.from({ length: 4100 }, (_, i) => hash('7f', i));
  await Promise.all(hashes.map((h) => fs.writeFile(file(dir, h), 'opaque')));
  await fs.mkdir(file(dir, hash('00', 1)));
  if (process.platform !== 'win32') await fs.symlink(path.join(dir, 'missing'), file(dir, hash('00', 2)));
  await fs.writeFile(path.join(dir, '7f', '.hidden'), 'ignored');
  await fs.mkdir(path.join(dir, '.hidden'));
  const expected = [...hashes, hash('00', 1), ...(process.platform === 'win32' ? [] : [hash('00', 2)])]
    .sort()
    .reverse();
  assert.deepEqual(
    (await nativeObjectDirectory(dir)).map((entry) => entry.hash),
    expected
  );
  await fs.unlink(file(dir, hashes[0]));
  assert.equal((await nativeObjectDirectory(dir)).length, expected.length - 1);
  await fs.writeFile(path.join(dir, '00', 'invalid'), 'x');
  assert.equal(await nativeObjectDirectory(dir), undefined, 'late layout failure discards earlier frames');
});

test('combined directory headers retain null fallback and exact stat metadata', async (t) => {
  const dir = await setup(t);
  const h = hash('7f', 1);
  await fs.writeFile(file(dir, h), zlib.deflateSync(Buffer.from('Source hash 1\0payload')));
  await fs.writeFile(file(dir, hash('00', 1)), 'corrupt');
  const result = await nativeObjectDirectory(dir, true);
  const stat = await fs.stat(file(dir, h));
  assert.deepEqual(result[0], { hash: h, header: { type: 'Source', size: stat.size, mtimeMs: stat.mtimeMs } });
  assert.deepEqual(result[1], { hash: hash('00', 1), header: undefined });
  process.env.BIT_RUST_OBJECT_HEADERS = 'off';
  try {
    assert.equal(await nativeObjectDirectory(dir, true), undefined);
  } finally {
    delete process.env.BIT_RUST_OBJECT_HEADERS;
  }
  process.env.BIT_RUST_OBJECT_TRAVERSAL = 'off';
  try {
    assert.equal(await nativeObjectDirectory(dir), undefined);
  } finally {
    delete process.env.BIT_RUST_OBJECT_TRAVERSAL;
  }
  await fs.rmdir(path.join(dir, 'ff'));
  assert.equal(await nativeObjectDirectory(dir), undefined, 'narrower layouts retain Node');
});

test('unusual layouts, inaccessible directories and missing helpers return whole-operation fallback', async (t) => {
  const dir = await setup(t);
  for (const name of ['not-a-hash', 'A'.repeat(38)]) {
    const p = path.join(dir, '00', name);
    await fs.writeFile(p, 'x');
    assert.equal(await nativeObjectDirectory(dir), undefined);
    await fs.unlink(p);
  }
  await fs.mkdir(path.join(dir, 'ZZ'));
  assert.equal(await nativeObjectDirectory(dir), undefined);
  await fs.rmdir(path.join(dir, 'ZZ'));
  await fs.rmdir(path.join(dir, '00'));
  await fs.symlink(path.join(dir, '01'), path.join(dir, '00'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(await nativeObjectDirectory(dir), undefined);
  await fs.unlink(path.join(dir, '00'));
  await fs.mkdir(path.join(dir, '00'));
  if (process.platform !== 'win32' && process.getuid?.() !== 0) {
    await fs.chmod(path.join(dir, '00'), 0);
    try {
      assert.equal(await nativeObjectDirectory(dir), undefined);
    } finally {
      await fs.chmod(path.join(dir, '00'), 0o755);
    }
  }
  process.env.BIT_RUST_OBJECT_IMPORT = path.join(dir, 'missing');
  assert.equal(await nativeObjectDirectory(dir), undefined);
});

test('malformed requests fail without success; root snapshot changes request fallback', async (t) => {
  const dir = await setup(t);
  for (const [count, payload] of [
    [0, ''],
    [257, ''],
    [2, '0000'],
    [2, '0001'],
    [1, 'ZZ'],
    [2, '01'],
  ]) {
    const input = Buffer.alloc(12 + payload.length);
    input.write('BWR1');
    input.writeUInt32BE(1, 4);
    input.writeUInt32BE(count, 8);
    input.write(payload, 12);
    const result = cp.spawnSync(native, ['--objects-dir', dir], { input });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout.length, 0);
  }
  const input = Buffer.from('BWR1\0\0\0\x01\0\0\0\x0100', 'binary');
  const result = cp.spawnSync(native, ['--objects-dir', dir], { input });
  assert.equal(JSON.parse(result.stdout).fallback, true);
});

test('truncated, corrupt, duplicate, oversized, fallback and trailing responses never expose partial results', async (t) => {
  const dir = await setup(t);
  if (process.platform === 'win32') return;
  const helper = path.join(dir, 'helper.cjs');
  const frame = {
    version: 1,
    id: 1,
    sequence: 0,
    headers: false,
    done: false,
    fallback: false,
    objects: [{ hash: hash('7f', 1), header: null }],
  };
  const done = { ...frame, sequence: 1, done: true, objects: [] };
  const line = (value) => JSON.stringify(value) + '\n';
  for (const output of [
    line(frame),
    line(frame) + line({ ...done, fallback: true }),
    line(frame) + line({ ...frame, sequence: 1 }),
    line(frame) + line(done) + 'trailing',
    line({ ...frame, id: 2 }),
    line({ ...frame, objects: Array(4097).fill(frame.objects[0]) }),
    'x'.repeat(4 * 1024 * 1024 + 1),
  ]) {
    await fs.writeFile(
      helper,
      '#!' +
        process.execPath +
        '\nprocess.stdin.resume();process.stdin.on("end",()=>process.stdout.write(' +
        JSON.stringify(output) +
        '));\n'
    );
    await fs.chmod(helper, 0o755);
    process.env.BIT_RUST_OBJECT_IMPORT = helper;
    assert.equal(await nativeObjectDirectory(dir), undefined);
  }
});

test('failed helpers are reaped before releasing the slot, and nonzero exit invalidates complete output', async (t) => {
  const dir = await setup(t);
  if (process.platform === 'win32') return;
  const helper = path.join(dir, 'lifecycle.cjs');
  await fs.writeFile(
    helper,
    '#!' +
      process.execPath +
      '\nprocess.on("SIGTERM",()=>{});process.stdin.resume();process.stdin.on("end",()=>{process.stdout.write("invalid\\n");setInterval(()=>{},1000)});\n'
  );
  await fs.chmod(helper, 0o755);
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  const start = Date.now();
  assert.equal(await nativeObjectDirectory(dir), undefined);
  assert.ok(Date.now() - start >= 200, 'wait for SIGKILL and actual close');
  process.env.BIT_RUST_OBJECT_IMPORT = native;
  assert.deepEqual(await nativeObjectDirectory(dir), []);
  const done = { version: 1, id: 1, sequence: 0, headers: false, done: true, fallback: false, objects: [] };
  await fs.writeFile(
    helper,
    '#!' +
      process.execPath +
      '\nprocess.stdin.resume();process.stdin.on("end",()=>{process.stdout.write(' +
      JSON.stringify(JSON.stringify(done) + '\n') +
      ');process.exitCode=7;});\n'
  );
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  assert.equal(await nativeObjectDirectory(dir), undefined);
});

test('portable directory replies reject invalid sequences, partial frames and failed exits', async (t) => {
  const dir = await setup(t);
  const { EventEmitter } = require('node:events');
  const original = cp.spawn;
  let output,
    exit = 0,
    killed = false;
  cp.spawn = () => {
    const child = new EventEmitter();
    child.pid = 12345;
    child.stdout = new EventEmitter();
    child.stdin = new EventEmitter();
    child.kill = () => {
      killed = true;
      return true;
    };
    child.stdin.end = () =>
      queueMicrotask(() => {
        // Deliberately split newline framing across pipe chunks.
        for (let offset = 0; offset < output.length; offset += 7)
          child.stdout.emit('data', Buffer.from(output.slice(offset, offset + 7)));
        child.emit('close', exit);
      });
    return child;
  };
  const frame = {
    version: 1,
    id: 1,
    sequence: 0,
    headers: false,
    done: false,
    fallback: false,
    objects: [{ hash: hash('7f', 1), header: null }],
  };
  const done = { ...frame, sequence: 1, done: true, objects: [] };
  const line = (value) => JSON.stringify(value) + '\n';
  try {
    for (output of [
      line(frame),
      line(frame) + line({ ...done, fallback: true }),
      line(frame) + line({ ...done, sequence: 0 }),
      line(frame) + line(done) + 'extra',
      line(frame) + line({ ...frame, sequence: 1 }),
    ])
      assert.equal(await nativeObjectDirectory(dir), undefined);
    assert.equal(killed, true);
    output = line(frame) + line(done);
    assert.deepEqual(await nativeObjectDirectory(dir), [{ hash: hash('7f', 1), header: undefined }]);
    exit = 7;
    assert.equal(await nativeObjectDirectory(dir), undefined);
  } finally {
    cp.spawn = original;
  }
});

test(
  'Windows directory junctions are rejected by both coordinator and native snapshot checks',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const dir = await setup(t);
    await fs.rmdir(path.join(dir, '00'));
    await fs.symlink(path.join(dir, '01'), path.join(dir, '00'), 'junction');
    assert.equal(await nativeObjectDirectory(dir), undefined);
    const prefixes = Array.from({ length: 256 }, (_, i) => (255 - i).toString(16).padStart(2, '0')).join('');
    const request = Buffer.alloc(12 + prefixes.length);
    request.write('BWR1');
    request.writeUInt32BE(1, 4);
    request.writeUInt32BE(256, 8);
    request.write(prefixes, 12);
    const child = cp.spawnSync(native, ['--objects-dir', dir], { input: request });
    assert.equal(child.status, 0);
    assert.equal(JSON.parse(child.stdout).fallback, true);
  }
);
