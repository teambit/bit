const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { source, installed } = require('./load-source.cjs');
const { recoveryProofProjection: project } = process.env.BIT_TEST_COMMAND_COMPILED === '1'
  ? installed('@teambit/bit/dist/rust-workspace-recovery-proof.js')
  : source('scopes/harmony/bit/rust-workspace-recovery-proof.ts');
const root = path.resolve('recovery-proof-workspace');
const proof = (relative, hash = 'a'.repeat(64)) => ({ path: path.join(root, relative), hash });

test('restored controls replace exact captured predicates while Sources remain unchanged', () => {
  const bitmap = proof('.bitmap');
  const restored = proof('.bitmap', 'b'.repeat(64));
  const src = proof('component/index.js');
  const metadata = { path: path.join(root, 'component'), hash: null, metadata: { kind: 'directory', realPath: path.join(root, 'component') } };
  const range = { ...src, range: { offset: 2, length: 5 } };
  const result = project(root, [bitmap, src, metadata, range, bitmap], [restored, src, metadata, range, restored], [bitmap.path]);
  assert.deepEqual(result.project(bitmap), restored);
  assert.deepEqual(result.project(src), src);
  assert.deepEqual(result.project(metadata), metadata);
  assert.deepEqual(result.project(range), range);
  assert.deepEqual(result.readSet, [restored, src, metadata, range, restored]);
  result.readSet[0].hash = 'c'.repeat(64);
  assert.deepEqual(result.project(bitmap), restored, 'caller mutation cannot alter the retained projection');
});

test('a restore cannot erase, reorder, weaken or rewrite unrelated dependency proofs', () => {
  const bitmap = proof('.bitmap');
  const src = proof('component/index.js');
  const changed = { ...src, hash: 'b'.repeat(64) };
  const controls = [bitmap.path];
  assert.throws(() => project(root, [bitmap, src], [bitmap], controls));
  assert.throws(() => project(root, [bitmap, src], [src, bitmap], controls));
  assert.throws(() => project(root, [src], [changed], controls));
  assert.throws(() => project(root, [src], [changed], [src.path]));
  assert.throws(() => project(root, [bitmap], [{ ...bitmap, exists: true }], controls));
  assert.throws(() => project(root, [bitmap, bitmap], [bitmap, { ...bitmap, hash: 'b'.repeat(64) }], controls));
  assert.throws(() => project(root, [bitmap], [bitmap], [path.join(root, '../.bitmap')]));
  assert.throws(() => project(root, [bitmap], [bitmap], [bitmap.path, bitmap.path]));
  const result = project(root, [bitmap], [bitmap], controls);
  assert.throws(() => result.project(src));
  assert.throws(() => result.project({ ...bitmap, hash: 'b'.repeat(64) }));
});
