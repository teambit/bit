const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installed, source } = require('./load-source.cjs');
const api =
  process.env.BIT_TEST_SNAPSHOT_TRANSACTION_COMPILED === '1'
    ? installed('@teambit/objects/dist/objects/rust-snapshot-values.js')
    : source('scopes/scope/objects/objects/rust-snapshot-values.ts');

test('snapshot wire keeps ordinary Unicode compact and lone surrogates exact in values and keys', () => {
  const input = { text: 'Unicode Ω🌱\u0000\r\n', '\ud800': '\udfff', paired: '\ud800\udc00', empty: '' };
  const projected = api.projectRustSnapshotValue(input);
  assert.deepEqual(projected, {
    kind: 'object',
    value: [
      ['text', { kind: 'string', value: input.text }],
      [[0xd800], { kind: 'string', value: [0xdfff] }],
      ['paired', { kind: 'string', value: input.paired }],
      ['empty', { kind: 'string', value: '' }],
    ],
  });
  assert.deepEqual(JSON.parse(JSON.stringify(projected)), projected);
  const content = 'a'.repeat(4096);
  const compact = api.projectRustSnapshotValue(content);
  const legacy = { kind: 'string', value: api.snapshotUtf16(content) };
  assert.ok(JSON.stringify(compact).length < JSON.stringify(legacy).length / 2);
});

test('compact projection preserves original limits, number bits, undefined and no-getter fallback', () => {
  assert.equal(api.projectRustSnapshotValue('a'.repeat(Math.floor((4 * 1024 * 1024) / 6) + 1)), undefined);
  const projected = api.projectRustSnapshotValue([undefined, -0, Infinity, NaN]);
  assert.equal(projected.value[0].kind, 'undefined');
  assert.equal(projected.value[1].value, '8000000000000000');
  assert.equal(projected.value[2].value, '7ff0000000000000');
  assert.equal(Buffer.from(projected.value[3].value, 'hex').readDoubleBE(), NaN);
  let calls = 0;
  const object = {};
  Object.defineProperty(object, 'value', {
    enumerable: true,
    get() {
      calls++;
      throw new Error('unread');
    },
  });
  assert.equal(api.projectRustSnapshotValue(object), undefined);
  assert.equal(calls, 0);
});

test('private string encoding never invokes subsequently replaced String methods', () => {
  let calls = 0;
  const previous = ['isWellFormed', 'charCodeAt'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(String.prototype, key),
  ]);
  try {
    for (const [key] of previous)
      Object.defineProperty(String.prototype, key, {
        configurable: true,
        get() {
          calls++;
          throw new Error('unread string hook');
        },
      });
    assert.deepEqual(api.projectRustSnapshotValue('plain'), { kind: 'string', value: 'plain' });
    assert.deepEqual(api.projectRustSnapshotValue('\ud800'), { kind: 'string', value: [0xd800] });
  } finally {
    for (const [key, descriptor] of previous) Object.defineProperty(String.prototype, key, descriptor);
  }
  assert.equal(calls, 0);
});
