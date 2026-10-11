// Whole-command paired measurements; keep the qualified driver and fixtures unchanged.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { runQualification } = require('./config-merge-qualification.cjs');
const [cli, helper, extraArg, scratch, output] = process.argv.slice(2);
assert.ok(
  cli && helper && extraArg !== undefined && scratch && output,
  'usage: config-merge-measure.cjs <private-cli> <release-helper> <extra-files-and-dependencies> <scratch-directory> <report.json>'
);
const extra = Number(extraArg);
assert.ok(Number.isInteger(extra) && extra >= 0 && extra <= 1000);
const repository = path.resolve(__dirname, '../..');
const reportPath = path.resolve(output);
assert.ok(!reportPath.startsWith(repository + path.sep), 'reports must stay outside the repository');
runQualification(cli, helper, {
  rounds: 3,
  measure: true,
  diagnostics: false,
  compactReport: true,
  extraFiles: extra,
  extraDependencies: extra,
  scratch: path.resolve(scratch),
})
  .then(async (report) => {
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ temporary: report.temporary, workload: report.workload }));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
