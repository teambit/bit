// Measure the same qualified commands with one warmup and three alternating pairs.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { runQualification } = require('./lane-recovery-qualification.cjs');
const [cli, helper, extraArg, scratch, output] = process.argv.slice(2);
assert.ok(
  cli && helper && extraArg !== undefined && scratch && output,
  'usage: lane-recovery-measure.cjs <private-cli> <release-helper> <extra-files> <scratch-directory> <report.json>'
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
  scratch: path.resolve(scratch),
})
  .then(async (report) => {
    for (const run of report.runs) {
      const scenarios = Object.keys(run.scenarios);
      let scenarioIndex = -1;
      let previousStep = Infinity;
      for (const sample of run.measurements) {
        if (sample.step <= previousStep) scenarioIndex += 1;
        assert.ok(scenarioIndex < scenarios.length, 'measurement scenario ordering');
        sample.scenario = scenarios[scenarioIndex];
        previousStep = sample.step;
      }
      assert.equal(scenarioIndex + 1, scenarios.length, 'every scenario has measurements');
    }
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ temporary: report.temporary, fileCounts: report.fileCounts }));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
