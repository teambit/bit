// Whole-command release timings; setup, state capture and tracing are outside the measured interval.
const assert = require('node:assert/strict');
const { runQualification } = require('./cold-command-qualification.cjs');
const [cli, helper, proof, report] = process.argv.slice(2);
assert.ok(cli && helper && proof && report, 'usage: cold-command-measure.cjs <cli> <release-helper> <proof> <report>');
assert.ok(!helper.includes('/debug/'), 'release helper required for retained performance samples');
runQualification(cli, helper, {
  measure: true,
  wrapper: true,
  rounds: Number(process.env.BIT_COLD_COMMAND_ROUNDS || 3),
  scratch: process.env.BIT_COLD_COMMAND_SCRATCH,
  proof,
  report,
})
  .then((result) => {
    console.log(
      JSON.stringify({ qualified: result.qualified, proofSha256: result.proofSha256, samples: result.runs.length })
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
