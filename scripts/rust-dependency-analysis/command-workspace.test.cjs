const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createHash } = require('node:crypto');
const { commandWorkspace, benchmarkGlobals } = require('./command-workspace.cjs');
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-command-workspace-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = 'export const value = 1;';
  fs.writeFileSync(path.join(root, 'index.js'), source);
  const manifest = {
    schemaVersion: 1,
    cliRevision: 'revision',
    componentCount: 1,
    sources: { 'index.js': createHash('sha256').update(source).digest('hex') },
  };
  fs.writeFileSync(path.join(root, '.rust-install-fixture.json'), JSON.stringify(manifest));
  return root;
}
test('separate fixture keeps CLI provenance and owned cache with verified source content', (t) => {
  const root = setup(t);
  const actual = commandWorkspace('/tmp/readonly-cli', { revision: 'revision' }, root);
  assert.equal(actual.componentCount, 1);
  assert.equal(actual.cache, path.join(root, '.bit/cache/components/deps'));
  fs.writeFileSync(path.join(root, 'index.js'), 'changed');
  assert.throws(() => commandWorkspace('/tmp/readonly-cli', { revision: 'revision' }, root), /index.js/);
});
test('cache symlink is rejected before creating directories outside the fixture', (t) => {
  const root = setup(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-command-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(root, '.bit'), 'dir');
  assert.throws(() => commandWorkspace('/tmp/readonly-cli', { revision: 'revision' }, root), /ancestors/);
  assert.deepEqual(fs.readdirSync(outside), []);
});
test('globals disable interactive telemetry prompts only in the owned directory', (t) => {
  const root = setup(t);
  const globals = benchmarkGlobals(root);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(globals, 'config/config.json'))), {
    analytics_reporting: 'false',
    error_reporting: 'false',
    anonymous_reporting: 'false',
  });
});
