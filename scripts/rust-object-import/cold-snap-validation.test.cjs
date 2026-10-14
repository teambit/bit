const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSnap } = require('./cold-snap-validation.cjs');
const names = ['commandSnapPrepare', 'commandSnapPlan', 'commandSnapFinalize', 'commandSnapApply'];
const receipt = () => ({
  workspaceFrames: names.map((kind) => ({ kind, helperId: 1 })),
  workspace: Object.fromEntries(
    names.map((name) => [name, { frames: 1, failed: 0, applied: name.endsWith('Apply') ? 1 : 0 }])
  ),
  loadedCommandModels: [],
  postPersistNotifications: 1,
});
test('snap ownership requires an accepted apply receipt, clean metadata bridge and retained helper', () => {
  validateSnap(receipt(), {});
  for (const mutate of [
    (trace) => {
      trace.postPersistNotifications = 0;
    },
    (trace) => {
      trace.workspace.commandSnapFinalize.failed = 1;
    },
    (trace) => {
      trace.workspace.commandSnapApply.applied = 0;
    },
    (trace) => {
      trace.workspace.commandSnapApply.failed = 1;
    },
    (trace) => {
      trace.workspace.commandSnapPlan.sourceBodyBytes = 1;
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
    assert.throws(() => validateSnap(trace, {}));
  }
});
test('fallback and wrapper claims cannot hide partial native publication or cold phases', () => {
  const trace = receipt();
  trace.loadedCommandModels = ['consumer-component.js'];
  assert.throws(() => validateSnap(trace, { error: true }));
  assert.throws(() => validateSnap(trace, {}, { wrapper: true }));
  trace.workspaceFrames = [{ kind: 'commandSnapApply' }];
  assert.throws(() => validateSnap(trace, { canonicalFallback: true }));
  trace.workspaceFrames = [];
  validateSnap(trace, {}, { wrapper: true });
  validateSnap(trace, { error: true });
});

test('snap no-op owns apply without allocating a finalization phase or emitting persistence', () => {
  const trace = receipt();
  trace.workspaceFrames = trace.workspaceFrames.filter((row) => row.kind !== 'commandSnapFinalize');
  delete trace.workspace.commandSnapFinalize;
  trace.postPersistNotifications = 0;
  validateSnap(trace, { noop: true });
  trace.workspace.commandSnapApply.applied = 0;
  assert.throws(() => validateSnap(trace, { noop: true }));
});
