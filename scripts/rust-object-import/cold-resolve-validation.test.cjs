const test = require('node:test');
const assert = require('node:assert/strict');
const { validateResolve } = require('./cold-resolve-validation.cjs');
const names = ['commandResolvePrepare', 'commandResolvePlan', 'commandResolveFinalize', 'commandResolveApply'];
const receipt = () => ({
  workspaceFrames: names.map((kind) => ({ kind, helperId: 1 })),
  workspace: Object.fromEntries(
    names.map((name) => [name, { frames: 1, failed: 0, applied: name.endsWith('Apply') ? 1 : 0 }])
  ),
  loadedCommandModels: [],
  postPersistNotifications: 1,
});
test('resolve ownership requires an accepted apply receipt, clean metadata bridge and retained helper', () => {
  validateResolve(receipt(), {});
  for (const mutate of [
    (trace) => {
      trace.postPersistNotifications = 0;
    },
    (trace) => {
      trace.workspace.commandResolveFinalize.failed = 1;
    },
    (trace) => {
      trace.workspace.commandResolveApply.applied = 0;
    },
    (trace) => {
      trace.workspace.commandResolveApply.failed = 1;
    },
    (trace) => {
      trace.workspace.commandResolvePlan.sourceBodyBytes = 1;
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
    assert.throws(() => validateResolve(trace, {}));
  }
});
test('fallback and wrapper claims cannot hide partial native publication or cold phases', () => {
  const trace = receipt();
  trace.loadedCommandModels = ['consumer-component.js'];
  assert.throws(() => validateResolve(trace, { error: true }));
  assert.throws(() => validateResolve(trace, {}, { wrapper: true }));
  trace.workspaceFrames = [{ kind: 'commandResolveApply' }];
  assert.throws(() => validateResolve(trace, { canonicalFallback: true }));
  trace.workspaceFrames = [];
  validateResolve(trace, {}, { wrapper: true });
  validateResolve(trace, { error: true });
});
