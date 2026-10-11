const { runQualification } = require('./workspace-inspection-qualification.cjs');
runQualification(process.argv[2], process.argv[3], {
  report: process.argv[4],
  scratch: process.env.BIT_INSPECTION_SCRATCH,
  extraFiles: Number(process.env.BIT_INSPECTION_EXTRA_FILES || 0),
  rounds: Number(process.env.BIT_INSPECTION_ROUNDS || 3),
  measure: true,
  diagnostics: false,
  omitStates: true,
})
  .then((report) => console.log(JSON.stringify({ temporary: report.temporary, runs: report.runs.length })))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
