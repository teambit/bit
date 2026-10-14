const assert = require('node:assert/strict');
const { runQualification } = require('./cold-recovery-qualification.cjs');
const cli = process.env.BIT_COLD_RECOVERY_CLI;
const helper = process.env.BIT_COLD_RECOVERY_HELPER;
const report = process.env.BIT_COLD_RECOVERY_REPORT;
const proof = process.env.BIT_COLD_RECOVERY_PROOF;
assert.ok(cli && helper && report, 'BIT_COLD_RECOVERY_CLI/HELPER/REPORT required');
runQualification(cli, helper, {
  report,
  nodeBaseline: process.env.BIT_COLD_RECOVERY_BASELINE || 'javascript',
  extraFiles: Number(process.env.BIT_COLD_RECOVERY_EXTRA_FILES || 0),
  ...(proof ? { measure: true, proof } : {}),
})
  .then((result) => {
    assert.equal(result.qualified, true);
    console.log(JSON.stringify({ qualified: true, runs: result.runs.length }));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
