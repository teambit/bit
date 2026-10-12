const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateMeasurementProof, measurementEntries, timedScenarios } = require('./merge-transaction-qualification.cjs');

test('measurement requires exact complete four-mode proof and fixture bindings', () => {
  const expected = {
    helperSha256: 'helper',
    nativeSourceDigest: 'source',
    bindings: { driver: 'sha' },
    cliProvenance: { revision: 'production' },
    fixtureDimensions: { extraFiles: 260, scenarios: ['log', 'missing'] },
  };
  const proof = {
    ...expected,
    qualified: true,
    baselineOnly: false,
    modeCoverage: ['node', 'native', 'missing-helper', 'crashed-helper'],
    runs: ['node', 'native', 'missing-helper', 'crashed-helper'].map((mode) => ({
      mode,
      stages: [{ scenario: 'log' }, { scenario: 'missing' }],
    })),
  };
  validateMeasurementProof(proof, expected);
  for (const mutate of [
    (p) => {
      p.qualified = false;
    },
    (p) => {
      p.baselineOnly = true;
    },
    (p) => {
      p.runs[3].mode = 'native';
    },
    (p) => {
      p.runs.pop();
    },
    (p) => {
      p.fixtureDimensions.extraFiles = 0;
    },
    (p) => {
      p.runs[1].stages.reverse();
    },
    (p) => {
      p.cliProvenance.revision = 'predecessor';
    },
    (p) => {
      p.bindings.driver = 'changed';
    },
    (p) => {
      p.helperSha256 = 'other';
    },
    (p) => {
      p.nativeSourceDigest = 'other';
    },
  ]) {
    const changed = structuredClone(proof);
    mutate(changed);
    assert.throws(() => validateMeasurementProof(changed, expected));
  }
});

test('whole command entries exclude fallback timing and alternate three retained pairs', () => {
  assert.deepEqual(measurementEntries(), [
    { mode: 'node', round: -1, warmup: true },
    { mode: 'native', round: -1, warmup: true },
    { mode: 'node', round: 0, warmup: false },
    { mode: 'native', round: 0, warmup: false },
    { mode: 'native', round: 1, warmup: false },
    { mode: 'node', round: 1, warmup: false },
    { mode: 'node', round: 2, warmup: false },
    { mode: 'native', round: 2, warmup: false },
  ]);
  assert.deepEqual(
    timedScenarios([
      { name: 'log' },
      { name: 'missing', canonicalError: true },
      { name: 'corrupt', error: true },
      { name: 'json' },
      { name: 'prompt', promptCancellation: true },
      { name: 'built', untimed: true },
    ]),
    ['log', 'json']
  );
});
