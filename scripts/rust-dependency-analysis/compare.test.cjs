const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compare, legacy } = require('./compare.cjs');

test('legacy reference preserves imported name and TypeScript type metadata', () => {
  assert.deepEqual(legacy({ path: 'x.ts', source: `import type { A as B } from 'pkg';` }), {
    status: 'ok', dependencies: { pkg: { importSpecifiers: [{ isDefault: false, name: 'A' }], isTypeImport: true } },
  });
});
test('comparator rejects lost metadata even when precinct names match', () => {
  assert.throws(() => compare({ status: 'ok', dependencies: { pkg: { isTypeImport: true } } }, {
    status: 'ok', dependencies: { pkg: {} },
  }), /raw detector metadata/);
});
test('comparator rejects parse success and dependency order drift', () => {
  assert.throws(() => compare({ status: 'parse_error' }, { status: 'ok', dependencies: {} }), /result status/);
  assert.throws(() => compare({ status: 'ok', dependencies: { a: {}, b: {} } }, {
    status: 'ok', dependencies: { b: {}, a: {} },
  }), /precinct dependency names and order/);
});
test('precinct no-check and core filtering apply before comparison', () => {
  assert.deepEqual(legacy({ path: 'x.js', source: '// @bit-no-check\nthis is invalid syntax' }).dependencies, {});
  assert.deepEqual(legacy({ path: 'x.js', source: `require('node:fs'); require('pkg');`, options: { includeCore: false } }).dependencies, { pkg: {} });
});
test('JS reference follows precinct module classification', () => {
  assert.deepEqual(legacy({ path: 'x.js', source: `require.resolve('./x');` }), { status: 'ok', dependencies: {} });
  assert.deepEqual(legacy({ path: 'x.js', source: `define(['pkg'], function(pkg) {});` }), { status: 'unsupported' });
  assert.deepEqual(legacy({ path: 'x.css', source: `@import './y.css';` }), { status: 'unsupported' });
});
