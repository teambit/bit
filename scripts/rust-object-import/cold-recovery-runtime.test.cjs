const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { runQualification } = require('./cold-recovery-qualification.cjs');

test('public recovery preserves canonical output, repository state and ownership in all four modes', async (t) => {
  for (const key of ['BIT_LEGACY_ROOT', 'BIT_TEST_OBJECT_IMPORT', 'BIT_TEST_WORKSPACE_ADDON'])
    assert.ok(process.env[key], key);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-cold-recovery-runtime-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const result = await runQualification(process.env.BIT_LEGACY_ROOT, process.env.BIT_TEST_OBJECT_IMPORT, {
    scratch: directory,
    report: path.join(directory, 'report.json'),
    allowUnmarkedCli: true,
    diagnostic: true,
  });
  assert.equal(result.qualified, false, 'CI diagnostics cannot qualify retained benchmark measurements');
  assert.deepEqual(
    result.runs.map((run) => run.mode),
    ['node', 'native', 'missing-helper', 'crashed-helper']
  );
  assert.equal(result.stages.length, 92, 'all twenty-three public scenarios exercise all four modes');
  for (const run of result.runs) assert.equal(run.stages.length, 23);
});
