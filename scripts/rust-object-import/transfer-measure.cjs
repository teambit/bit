// Paired whole-client transfer timings. The loopback server is a separate remote process.
const path = require('node:path');
const { runQualification } = require('./transfer-qualification.cjs');
async function main() {
  const [cli, helper, report] = process.argv.slice(2);
  if (!cli || !helper || !report) throw new Error('Usage: transfer-measure.cjs CLI HELPER REPORT');
  const result = await runQualification(cli, helper, {
    measure: true,
    diagnostics: false,
    omitStates: true,
    rounds: Number(process.env.BIT_TRANSFER_MEASUREMENT_ROUNDS || 3),
    extraFiles: Number(process.env.BIT_TRANSFER_MEASUREMENT_EXTRA_FILES || 0),
    scratch: process.env.BIT_TRANSFER_MEASUREMENT_SCRATCH,
    transports: process.env.BIT_TRANSFER_QUALIFICATION_TRANSPORTS?.split(','),
    report: path.resolve(report),
  });
  console.log(JSON.stringify({ temporary: result.temporary, runs: result.runs.length }));
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
