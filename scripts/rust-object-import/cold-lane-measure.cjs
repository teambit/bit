// Fixed lane-domain acceptance, then complete-command measurements bound to that proof.
const path = require('node:path');
const { runQualification } = require('./merge-transaction-qualification.cjs');
const cli = process.env.BIT_COLD_LANE_CLI;
const helper = process.env.BIT_COLD_LANE_HELPER;
const report = process.env.BIT_COLD_LANE_REPORT;
const proof = process.env.BIT_COLD_LANE_PROOF;
if (!cli || !helper || !report) throw new Error('BIT_COLD_LANE_CLI, HELPER and REPORT are required');
runQualification(cli, helper, {
  coldLane: true,
  scenarioDomain: 'lane',
  installedEnv: true,
  nodeBaseline: process.env.BIT_COLD_LANE_BASELINE || 'javascript',
  extraFiles: Number(process.env.BIT_COLD_LANE_EXTRA_FILES || 0),
  scratch: process.env.BIT_COLD_LANE_SCRATCH,
  report: path.resolve(report),
  ...(proof ? { measure: true, rounds: 3, diagnostics: false, proof: path.resolve(proof) } : {}),
}).then((result) => {
  if (!result.qualified || (proof && !result.proofSha256)) throw new Error('unqualified lane command evidence');
  console.log(JSON.stringify({ qualified: true, baseline: result.nodeBaseline, runs: result.runs.length,
    measurements: result.runs.reduce((sum, run) => sum + run.measurements.length, 0) }));
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
