const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { LegacySessionControl } = require('./legacy-session-control.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-legacy-control-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const metrics = { controlReads: 0, controlParses: 0, controlCacheHits: 0 };
  const session = new LegacySessionControl(metrics);
  t.after(() => session.dispose());
  return { root, metrics, session };
}
test('frontier duplicates retain metadata and logical path identity', async (t) => {
  const { root, metrics, session } = fixture(t);
  const first = path.join(root, 'a.ts');
  const second = path.join(root, 'b.ts');
  fs.writeFileSync(first, "import type { Foo } from './types';\nexport { Foo };\n");
  fs.symlinkSync(first, second);
  await session.prefetch([first, first, second]);
  assert.equal(metrics.controlParses, 2);
  assert.deepEqual(Object.keys(session.get(first).dependencies), ['./types']);
  assert.equal(session.get(first).dependencies['./types'].isTypeImport, true);
  assert.equal(session.get(first).dependencies['./types'].importSpecifiers[0].name, 'Foo');
  assert.equal(session.get(second).path, second);
});
test('authoritative inline edits replace dependencies without a second file read', async (t) => {
  const { root, metrics, session } = fixture(t);
  const filename = path.join(root, 'index.ts');
  const old = await session.scanSource(filename, "import './old';");
  const current = await session.scanSource(filename, "import './new';");
  assert.deepEqual(Object.keys(old.dependencies), ['./old']);
  assert.deepEqual(Object.keys(current.dependencies), ['./new']);
  assert.equal(metrics.controlReads, 0);
  assert.deepEqual(await session.scanSource(filename, "import './new';"), current);
  assert.equal(metrics.controlParses, 2);
});
test('lease cache clearing preserves source freshness and malformed-source diagnostics', async (t) => {
  const { root, session } = fixture(t);
  const filename = path.join(root, 'index.ts');
  fs.writeFileSync(filename, "import './old';");
  await session.prefetch([filename]);
  session.clearCache();
  fs.writeFileSync(filename, "import './new';");
  await session.prefetch([filename]);
  assert.deepEqual(Object.keys(session.get(filename).dependencies), ['./new']);
  const malformed = await session.scanSource(filename, 'const value = ;');
  assert.equal(malformed.status, 'parse_error');
  assert.ok(malformed.diagnostics[0]);
});
