// Reproducible complete-command retained pairs, after a matching acceptance proof.
const path = require('node:path');
const { runQualification } = require('./history-reset-qualification.cjs');
const cli = process.env.BIT_HISTORY_RESET_CLI;
const helper = process.env.BIT_HISTORY_RESET_HELPER;
const proof = process.env.BIT_HISTORY_RESET_PROOF;
const report = process.env.BIT_HISTORY_RESET_REPORT;
if (!cli || !helper || !proof || !report)
  throw new Error('BIT_HISTORY_RESET_CLI, HELPER, PROOF and REPORT are required');
runQualification(cli, helper, {
  measure: true,
  rounds: 3,
  diagnostics: false,
  omitStates: true,
  extraFiles: Number(process.env.BIT_HISTORY_RESET_EXTRA_FILES || 0),
  scratch: process.env.BIT_HISTORY_RESET_SCRATCH,
  proof: path.resolve(proof),
  report: path.resolve(report),
})
  .then((result) =>
    console.log(
      JSON.stringify({
        qualified: result.qualified,
        runs: result.runs.length,
        actualWorkspaceSourceFiles: result.actualWorkspaceSourceFiles,
        measurements: result.runs.reduce((sum, run) => sum + run.measurements.length, 0),
      })
    )
  )
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
