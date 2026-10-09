const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compare, legacy, selectCorpus } = require('./compare.cjs');
const path = require('node:path');

test('legacy reference preserves imported name and TypeScript type metadata', () => {
  assert.deepEqual(legacy({ path: 'x.ts', source: `import type { A as B } from 'pkg';` }), {
    status: 'ok',
    dependencies: { pkg: { importSpecifiers: [{ isDefault: false, name: 'A' }], isTypeImport: true } },
  });
});
test('comparator rejects lost metadata even when precinct names match', () => {
  assert.throws(
    () =>
      compare(
        { status: 'ok', dependencies: { pkg: { isTypeImport: true } } },
        {
          status: 'ok',
          dependencies: { pkg: {} },
        }
      ),
    /raw detector metadata/
  );
});
test('comparator rejects parse success and dependency order drift', () => {
  assert.throws(() => compare({ status: 'parse_error' }, { status: 'ok', dependencies: {} }), /result status/);
  assert.throws(
    () =>
      compare(
        { status: 'ok', dependencies: { a: {}, b: {} } },
        {
          status: 'ok',
          dependencies: { b: {}, a: {} },
        }
      ),
    /precinct dependency names and order/
  );
});
test('precinct no-check and core filtering apply before comparison', () => {
  assert.deepEqual(legacy({ path: 'x.js', source: '// @bit-no-check\nthis is invalid syntax' }).dependencies, {});
  assert.deepEqual(
    legacy({ path: 'x.js', source: `require('node:fs'); require('pkg');`, options: { includeCore: false } })
      .dependencies,
    { pkg: {} }
  );
});

test('wire comparison preserves omitted undefined legacy metadata', () => {
  const reference = legacy({ path: 'strings.js', source: `import { 'some-name' as local } from 'pkg';` });
  compare(reference, { status: 'ok', dependencies: { pkg: { importSpecifiers: [{ isDefault: false }] } } });
  assert.throws(
    () =>
      compare(reference, {
        status: 'ok',
        dependencies: { pkg: { importSpecifiers: [{ isDefault: false, name: 'some-name' }] } },
      }),
    /raw detector metadata/
  );
});

test('legacy optional calls differ between Babel JS and ESTree TS', () => {
  const source = `import './base'; require?.('./optional');`;
  assert.deepEqual(Object.keys(legacy({ path: 'optional.js', source }).dependencies), ['./base']);
  assert.deepEqual(Object.keys(legacy({ path: 'optional.ts', source }).dependencies), ['./base', './optional']);
});

test('tracked corpus selection is sorted, reproducible, and restricted to supported extensions', () => {
  const root = path.resolve(__dirname, '../..');
  const files = selectCorpus(root);
  assert.ok(files.length > 100);
  assert.deepEqual(files, [...files].sort());
  assert.ok(files.every((file) => /\.(js|jsx|cjs|mjs|ts|tsx|mts|cts)$/.test(file)));
  assert.deepEqual(selectCorpus(root, ['scripts/example.js']), [path.join(root, 'scripts/example.js')]);
});
test('JS reference follows precinct module classification', () => {
  assert.deepEqual(legacy({ path: 'x.js', source: `require.resolve('./x');` }), { status: 'ok', dependencies: {} });
  assert.deepEqual(legacy({ path: 'x.js', source: `define(['pkg'], function(pkg) {});` }), { status: 'unsupported' });
  assert.deepEqual(legacy({ path: 'x.css', source: `@import './y.css';` }), { status: 'unsupported' });
});

test('prototype fallback fixtures execute real legacy omissions and metadata errors', () => {
  const fixtures = require('./fixtures.cjs');
  for (const ext of ['js', 'ts']) {
    const fixture = fixtures.find((item) => item.name === `prototype-__proto__-import-${ext}`);
    assert.ok(fixture.expectFallback);
    assert.equal(fixture.fallback, undefined, 'the reference must run the actual detector');
    assert.deepEqual(legacy(fixture), { status: 'ok', dependencies: {} });
  }
  for (const name of ['constructor', 'toString', 'hasOwnProperty']) {
    const js = legacy(fixtures.find((item) => item.name === `prototype-${name}-import-js`));
    assert.equal(js.status, 'parse_error');
    assert.match(js.diagnostic, /Maximum call stack size exceeded/);
    assert.deepEqual(legacy(fixtures.find((item) => item.name === `prototype-${name}-import-ts`)), {
      status: 'ok',
      dependencies: {},
    });
  }
});
