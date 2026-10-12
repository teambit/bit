// Retained complete-command pairs require a matching four-mode acceptance proof.
const path = require('node:path');
const qualification = require('./history-query-qualification.cjs');
const { runQualification } = qualification;
const cli = process.env.BIT_HISTORY_QUERY_CLI;
const helper = process.env.BIT_HISTORY_QUERY_HELPER;
const proof = process.env.BIT_HISTORY_QUERY_PROOF;
const report = process.env.BIT_HISTORY_QUERY_REPORT;
if (!cli || !helper || !proof || !report)
  throw new Error('BIT_HISTORY_QUERY_CLI, HELPER, PROOF and REPORT are required');
if (qualification.supportsMeasurement !== true)
  throw new Error('history query qualification does not support proof-bound measurement');
runQualification(cli, helper, {
  measure: true,
  rounds: 3,
  diagnostics: false,
  extraFiles: Number(process.env.BIT_HISTORY_QUERY_EXTRA_FILES || 0),
  scratch: process.env.BIT_HISTORY_QUERY_SCRATCH,
  proof: path.resolve(proof),
  report: path.resolve(report),
})
  .then((result) => {
    if (!result.qualified || !result.proofSha256 || !result.runs.every((run) => Array.isArray(run.measurements)))
      throw new Error('history query measurement requires proof-bound command samples');
    console.log(
      JSON.stringify({
        qualified: result.qualified,
        runs: result.runs.length,
        actualWorkspaceSourceFiles: result.actualWorkspaceSourceFiles,
        measurements: result.runs.reduce((sum, run) => sum + run.measurements.length, 0),
      })
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
