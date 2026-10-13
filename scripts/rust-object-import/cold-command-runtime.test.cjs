const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runQualification } = require('./cold-command-qualification.cjs');

test('public cold checkout and main merge preserve canonical output, state and fallback boundaries', async (t) => {
  for (const key of ['BIT_LEGACY_ROOT', 'BIT_TEST_OBJECT_IMPORT', 'BIT_TEST_WORKSPACE_ADDON'])
    assert.ok(process.env[key], key);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-cold-command-runtime-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const result = await runQualification(process.env.BIT_LEGACY_ROOT, process.env.BIT_TEST_OBJECT_IMPORT, {
    scratch: directory,
    report: path.join(directory, 'report.json'),
    allowUnmarkedCli: true,
  });
  assert.equal(result.runs.length, 80, 'all twenty scenarios exercise all four modes');
});
