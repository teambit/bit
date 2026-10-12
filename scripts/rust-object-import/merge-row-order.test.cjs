const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installed, source } = require('./load-source.cjs');
const api = process.env.BIT_TEST_MERGE_TRANSACTION_COMPILED === '1'
  ? installed('@teambit/component.modules.merge-helper/dist/rust-merge-row-order.js')
  : source('scopes/component/modules/merge-helper/rust-merge-row-order.ts');

test('indexed merge receipts preserve all original row identities in reversed order', () => {
  const rows = Array.from({ length: 513 }, (_, current) => ({ kind: 'unModifiedFiles', current }));
  const indices = rows.map((_, index) => index).reverse();
  const ordered = api.orderedRustMergeRows({ rowIndices: indices }, rows);
  indices.forEach((index, at) => assert.strictEqual(ordered[at], rows[index]));
  assert.deepEqual(api.orderedRustMergeRows({ rowIndices: [] }, []), []);
});

test('incomplete, repeated, noninteger and out-of-range receipts are rejected', () => {
  const rows = [{ kind: 'addFiles', other: 0 }, { kind: 'removeFiles', current: 0 }];
  for (const rowIndices of [undefined, {}, [], [0], [0, 0], [0, 2], [-1, 0], [0, 0.5], ['0', 1], [NaN, 1], [Infinity, 1]]) {
    assert.equal(api.orderedRustMergeRows({ rowIndices }, rows), undefined);
  }
});

test('row lookup keys retain first-match selectors and distinguish each identity field', () => {
  const row = { kind: 'modifiedFiles', current: 0, other: 1, base: 2, bodyPlanIndex: 3 };
  const key = api.rustMergeRowKey(row);
  assert.equal(api.rustMergeRowKey({ ...row, outputPlanIndex: 9 }), key);
  for (const field of ['current', 'other', 'base', 'bodyPlanIndex']) {
    assert.notEqual(api.rustMergeRowKey({ ...row, [field]: undefined }), key);
    assert.notEqual(api.rustMergeRowKey({ ...row, [field]: 10 }), key);
  }
  assert.notEqual(api.rustMergeRowKey({ ...row, kind: 'updatedFiles' }), key);
});
