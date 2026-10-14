const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateColdLane } = require('./cold-lane-validation.cjs');
const scenario = { name: 'lane-clean-diverge', target: 'lane' };
function receipt() {
  const kinds = [
    'commandPrepare',
    'commandPlan',
    'commandPolicyPrepare',
    'commandDependencyDetect',
    'commandDependencyComplete',
    'commandLaneFinalize',
    'commandFinalize',
    'commandApply',
  ];
  return {
    workspaceFrames: kinds.map((kind) => ({
      magic: 'BWS1',
      kind,
      helperId: 1,
      receipt: { failed: false, completed: 1, applied: kind === 'commandApply' },
    })),
    workspace: Object.fromEntries(
      kinds.map((kind) => [kind, { failed: 0, sourceBodyBytes: 0, ...(kind === 'commandApply' ? { applied: 1 } : {}) }])
    ),
    loadedCommandModels: [],
  };
}
test('cold lane proof requires accepted publication, retained phases and no legacy classes or Source bridge', () => {
  validateColdLane(receipt(), scenario);
  for (const mutate of [
    (trace) => {
      trace.workspace.commandApply.applied = 0;
    },
    (trace) => {
      trace.workspaceFrames.at(-1).receipt.applied = false;
    },
    (trace) => {
      trace.workspaceFrames[2].receipt.failed = true;
    },
    (trace) => {
      trace.workspaceFrames[2].helperId = 2;
    },
    (trace) => {
      trace.loadedCommandModels.push('/scope/models/version.js');
    },
    (trace) => {
      trace.workspace.commandPlan.sourceBodyBytes = 3;
    },
    (trace) => {
      trace.workspaceFrames.splice(5, 1);
    },
    (trace) => {
      trace.workspaceFrames.reverse();
    },
  ]) {
    const trace = receipt();
    mutate(trace);
    assert.throws(() => validateColdLane(trace, scenario));
  }
});

test('explicit fallback proof rejects publication and cannot substitute for positive ownership', () => {
  const { validateColdLaneFallback } = require('./cold-lane-validation.cjs');
  const fallback = () => ({
    workspaceFrames: [{ magic: 'BWS1', kind: 'commandPrepare', helperId: 1, receipt: { failed: true } }],
    workspace: { commandPrepare: { sourceBodyBytes: 0 } },
    loadedCommandModels: ['/scope/models/version.js'],
  });
  const errorScenario = { ...scenario, error: true };
  validateColdLaneFallback(fallback(), errorScenario);
  assert.throws(() => validateColdLaneFallback(fallback(), scenario));
  for (const kind of ['commandLaneFinalize', 'commandFinalize', 'commandApply']) {
    const trace = fallback();
    trace.workspaceFrames.push({ magic: 'BWS1', kind, receipt: { failed: true } });
    assert.throws(() => validateColdLaneFallback(trace, errorScenario));
  }
  const trace = fallback();
  trace.loadedCommandModels = [];
  assert.throws(() => validateColdLaneFallback(trace, errorScenario));
  const faultScenario = { ...scenario, fault: { kind: 'mergeResultsSelect' } };
  assert.throws(() => validateColdLaneFallback(fallback(), faultScenario));
  const legacy = fallback();
  legacy.workspaceFrames = [];
  validateColdLaneFallback(legacy, faultScenario);
  assert.throws(() => validateColdLane(legacy, scenario));
});

test('scope-only Finalize requires real snapped receipt and later accepted publication', () => {
  const trace = receipt();
  const final = trace.workspaceFrames.find((frame) => frame.kind === 'commandFinalize');
  final.receipt.completed = 0;
  assert.throws(() => validateColdLane(trace, scenario));
  final.receipt.snapped = 1;
  validateColdLane(trace, scenario);
  trace.workspace.commandApply.applied = 0;
  assert.throws(() => validateColdLane(trace, scenario));
});
