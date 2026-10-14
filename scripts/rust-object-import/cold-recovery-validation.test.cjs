const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRecovery } = require('./cold-recovery-validation.cjs');
const names = ['commandRecoveryPrepare', 'commandRecoveryPlan', 'commandRecoveryRestore', 'commandRecoveryApply'];
const receipt = () => ({
  workspaceFrames: names.map((kind) => ({ kind, helperId: 1 })),
  workspace: Object.fromEntries(
    names.map((name) => [
      name,
      { frames: 1, failed: 0, applied: name.endsWith('Apply') ? 1 : 0, restored: name.endsWith('Restore') ? 1 : 0 },
    ])
  ),
  loadedCommandModels: [],
});
test('recovery ownership requires an accepted apply receipt, clean metadata bridge and retained helper', () => {
  validateRecovery(receipt(), { operation: 'laneAbort' });
  for (const mutate of [
    (trace) => {
      trace.workspace.commandRecoveryRestore.restored = 0;
    },
    (trace) => {
      trace.workspace.commandRecoveryApply.applied = 0;
    },
    (trace) => {
      trace.workspace.commandRecoveryApply.failed = 1;
    },
    (trace) => {
      trace.workspace.commandRecoveryPlan.sourceBodyBytes = 1;
    },
    (trace) => {
      trace.workspaceFrames[2].helperId = 2;
    },
    (trace) => {
      delete trace.workspaceFrames[2].helperId;
    },
    (trace) => {
      trace.loadedCommandModels.push('consumer-component.js');
    },
    (trace) => {
      trace.workspaceFrames.reverse();
    },
  ]) {
    const trace = receipt();
    mutate(trace);
    assert.throws(() => validateRecovery(trace, { operation: 'laneAbort' }));
  }
});
test('fallback and wrapper claims cannot hide partial native publication or cold phases', () => {
  const trace = receipt();
  trace.loadedCommandModels = ['consumer-component.js'];
  assert.throws(() => validateRecovery(trace, { error: true }));
  assert.throws(() => validateRecovery(trace, {}, { wrapper: true }));
  trace.workspaceFrames = [{ kind: 'commandRecoveryRestore' }];
  assert.throws(() => validateRecovery(trace, { canonicalFallback: true }));
  trace.workspaceFrames = [];
  validateRecovery(trace, {}, { wrapper: true });
  validateRecovery(trace, { error: true });
});
