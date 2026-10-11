const { runQualification } = require('./snapshot-transaction-qualification.cjs');
runQualification(process.argv[2], process.argv[3], {
  report: process.argv[4],
  scratch: process.env.BIT_SNAPSHOT_TRANSACTION_SCRATCH,
  extraFiles: Number(process.env.BIT_SNAPSHOT_TRANSACTION_EXTRA_FILES || 0),
  rounds: Number(process.env.BIT_SNAPSHOT_TRANSACTION_ROUNDS || 3),
  measure: true,
  diagnostics: false,
  omitStates: true,
})
  .then((report) => console.log(JSON.stringify({ temporary: report.temporary, runs: report.runs.length })))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
