const { runQualification } = require('./checkout-transition-qualification.cjs');
runQualification(process.argv[2], process.argv[3], {
  report: process.argv[4],
  proof: process.env.BIT_CHECKOUT_TRANSITION_PROOF,
  scratch: process.env.BIT_CHECKOUT_TRANSITION_SCRATCH,
  extraFiles: Number(process.env.BIT_CHECKOUT_TRANSITION_EXTRA_FILES || 0),
  rounds: Number(process.env.BIT_CHECKOUT_TRANSITION_ROUNDS || 3),
  measure: true,
  diagnostics: false,
  omitStates: true,
})
  .then((report) =>
    console.log(JSON.stringify({ temporary: report.temporary, runs: report.runs.length, workload: report.workload }))
  )
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
