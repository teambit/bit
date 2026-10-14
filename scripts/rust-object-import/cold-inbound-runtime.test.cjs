const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { run, scenarios } = require('./cold-inbound-qualification.cjs');

test('public fetch/import preserves canonical output, object bytes and native ownership', async (t) => {
  for (const key of ['BIT_LEGACY_ROOT', 'BIT_TEST_OBJECT_IMPORT', 'BIT_TEST_WORKSPACE_ADDON'])
    assert.ok(process.env[key], key);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-cold-inbound-runtime-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const result = await run(
    process.env.BIT_LEGACY_ROOT,
    process.env.BIT_TEST_OBJECT_IMPORT,
    path.join(directory, 'report.json'),
    { scratch: directory, addon: process.env.BIT_TEST_WORKSPACE_ADDON }
  );
  assert.equal(result.qualified, true);
  assert.equal(result.runs.length, scenarios.length * 2 * 4);
});
