const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateMeasurementProof,
  measurementEntries,
  timedScenarios,
} = require('./merge-transaction-qualification.cjs');

test('measurement requires exact complete four-mode proof and fixture bindings', () => {
  const expected = {
    helperSha256: 'helper',
    nativeSourceDigest: 'source',
    bindings: { driver: 'sha' },
    cliProvenance: { revision: 'production' },
    fixtureDimensions: { nodeBaseline: 'object-helper', extraFiles: 260, scenarios: ['log', 'missing'] },
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
      p.fixtureDimensions.nodeBaseline = 'javascript';
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

test('lane measurement domain is fixed independently of diagnostic route subsets', () => {
  const { qualificationScenarios } = require('./merge-transaction-qualification.cjs');
  const scenarios = [
    { name: 'component', target: 'component' },
    { name: 'lane', target: 'lane' },
    { name: 'main', target: 'main' },
    { name: 'edge', target: 'lane', coldOnly: true },
  ];
  assert.deepEqual(
    qualificationScenarios(scenarios, {}).map((row) => row.name),
    ['component', 'lane', 'main']
  );
  assert.deepEqual(
    qualificationScenarios(scenarios, { coldLane: true, scenarioDomain: 'lane' }).map((row) => row.name),
    ['lane', 'main', 'edge']
  );
  assert.throws(() => qualificationScenarios(scenarios, { scenarioDomain: 'lane' }), /cold ownership/);
  assert.throws(() => qualificationScenarios(scenarios, { scenarioDomain: 'chosen' }), /unknown/);
});

test('wrapper baseline enables native kernels while bypassing only the cold owner', () => {
  const { commandBackend, validateWrapperBaseline } = require('./merge-transaction-qualification.cjs');
  assert.deepEqual(commandBackend('node', 'native-wrapper', 'helper'), {
    wrapper: true,
    env: { BIT_RUST_CLIENT_VCS: 'on', BIT_RUST_OBJECT_IMPORT: 'helper', BIT_COLD_COMMAND_WRAPPER_BASELINE: '1' },
  });
  assert.equal(commandBackend('node', 'javascript', 'helper').env.BIT_RUST_OBJECT_IMPORT, 'off');
  assert.equal(commandBackend('native', 'native-wrapper', 'helper').wrapper, false);
  assert.equal(commandBackend('missing-helper', 'native-wrapper', 'absent').env.BIT_RUST_OBJECT_IMPORT, 'absent');
  assert.equal(commandBackend('node', 'javascript', 'helper', {}).env.BIT_RUST_CLIENT_VCS, 'off');
  assert.equal(commandBackend('node', 'javascript', 'helper', {}).env.BIT_RUST_OBJECT_IMPORT, 'off');
  assert.equal(commandBackend('native', 'javascript', 'helper', {}).wrapper, true);
  validateWrapperBaseline({ workspaceFrames: [{ kind: 'dependencyPolicy' }] });
  for (const kind of ['commandPrepare', 'commandPolicyPrepare', 'commandDependencyDetect', 'commandDependencyComplete'])
    assert.throws(() => validateWrapperBaseline({ workspaceFrames: [{ kind }] }), /bypass/);
});
