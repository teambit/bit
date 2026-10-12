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
