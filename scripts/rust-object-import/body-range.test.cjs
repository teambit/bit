const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { installed, source } = require('./load-source.cjs');
const api =
  process.env.BIT_TEST_MERGE_TRANSACTION_COMPILED === '1'
    ? installed('@teambit/objects/dist/objects/rust-body-range.js')
    : source('scopes/scope/objects/objects/rust-body-range.ts');
test('packed private bodies preserve binary ranges, empty bodies and independent buffers', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-body-range-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'pack');
  const bytes = Buffer.from([0, 255, 13, 10, 97, 98, 99]);
  await fs.writeFile(filename, bytes);
  for (const [offset, length] of [
    [0, 4],
    [4, 3],
    [7, 0],
    [2, 0],
  ]) {
    const expected = bytes.subarray(offset, offset + length);
    assert.deepEqual(api.readRustBodyRangeSync(filename, offset, length), expected);
    assert.deepEqual(await api.readRustBodyRange(filename, offset, length), expected);
  }
  const [first, second] = await Promise.all([
    api.readRustBodyRange(filename, 0, 4),
    api.readRustBodyRange(filename, 0, 4),
  ]);
  first[0] = 42;
  assert.equal(second[0], 0);
  for (const [offset, length] of [
    [-1, 1],
    [0, -1],
    [0.5, 1],
    [NaN, 0],
    [0, Infinity],
    [32 * 1024 * 1024, 1],
  ]) {
    assert.throws(() => api.readRustBodyRangeSync(filename, offset, length), /invalid private body range/);
    await assert.rejects(api.readRustBodyRange(filename, offset, length), /invalid private body range/);
  }
  for (const [offset, length] of [
    [6, 2],
    [8, 0],
  ]) {
    assert.throws(() => api.readRustBodyRangeSync(filename, offset, length), /truncated/);
    await assert.rejects(api.readRustBodyRange(filename, offset, length), /truncated/);
  }
  await fs.truncate(filename, 2);
  assert.throws(() => api.readRustBodyRangeSync(filename, 0, 4), /truncated/);
  await assert.rejects(api.readRustBodyRange(filename, 0, 4), /truncated/);
  await fs.unlink(filename);
  assert.throws(() => api.readRustBodyRangeSync(filename, 0, 0), { code: 'ENOENT' });
  await assert.rejects(api.readRustBodyRange(filename, 0, 0), { code: 'ENOENT' });
});

test('concurrent packed ranges preserve independent aliases and observe later spool changes', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-body-batch-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'pack');
  const bytes = Buffer.alloc(64 * 257);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
  await fs.writeFile(filename, bytes);
  const ranges = Array.from({ length: 64 }, (_, index) => [index * 257, index % 7 ? 257 : 0]);
  const bodies = await Promise.all(ranges.map(([offset, length]) => api.readRustBodyRange(filename, offset, length)));
  bodies.forEach((body, index) => assert.deepEqual(body, bytes.subarray(ranges[index][0], ranges[index][0] + ranges[index][1])));
  const aliases = await Promise.all(Array.from({ length: 32 }, () => api.readRustBodyRange(filename, 0, 257)));
  aliases[0].fill(42);
  for (const body of aliases.slice(1)) assert.deepEqual(body, bytes.subarray(0, 257));
  bytes.fill(93);
  await fs.writeFile(filename, bytes);
  const changed = await Promise.all(ranges.map(([offset, length]) => api.readRustBodyRange(filename, offset, length)));
  changed.forEach((body, index) => assert.deepEqual(body, bytes.subarray(ranges[index][0], ranges[index][0] + ranges[index][1])));
  assert.notDeepEqual(bodies[1], changed[1], 'completed batches must not cache old private bytes');
});

test('a truncated or missing private range does not fail valid neighboring logical reads', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-body-batch-errors-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'pack');
  const bytes = Buffer.from([0, 255, 13, 10, 7, 8, 9, 10]);
  await fs.writeFile(filename, bytes);
  const reads = Array.from({ length: 16 }, (_, index) => api.readRustBodyRange(filename, index === 7 ? 7 : 0, 4));
  reads.push(api.readRustBodyRange(path.join(directory, 'missing'), 0, 0));
  const results = await Promise.allSettled(reads);
  results.forEach((result, index) => {
    if (index === 7) {
      assert.equal(result.status, 'rejected');
      assert.match(result.reason.message, /truncated/);
    } else if (index === 16) {
      assert.equal(result.status, 'rejected');
      assert.equal(result.reason.code, 'ENOENT');
    } else {
      assert.equal(result.status, 'fulfilled');
      assert.deepEqual(result.value, bytes.subarray(0, 4));
    }
  });
  await fs.truncate(filename, 0);
  await assert.rejects(api.readRustBodyRange(filename, 0, 4), /truncated/);
});
