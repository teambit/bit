const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTag } = require('./cold-tag-validation.cjs');
const names = ['commandTagPrepare', 'commandTagPlan', 'commandTagFinalize', 'commandTagApply'];
const receipt = () => ({
  workspaceFrames: names.map((kind) => ({ kind, helperId: 1 })),
  workspace: Object.fromEntries(
    names.map((name) => [name, { frames: 1, failed: 0, applied: name.endsWith('Apply') ? 1 : 0 }])
  ),
  loadedCommandModels: [],
  postPersistNotifications: 1,
});
test('tag ownership requires an accepted apply receipt, clean metadata bridge and retained helper', () => {
  validateTag(receipt(), {});
  for (const mutate of [
    (trace) => {
      trace.postPersistNotifications = 0;
    },
    (trace) => {
      trace.workspace.commandTagFinalize.failed = 1;
    },
    (trace) => {
      trace.workspace.commandTagApply.applied = 0;
    },
    (trace) => {
      trace.workspace.commandTagApply.failed = 1;
    },
    (trace) => {
      trace.workspace.commandTagPlan.sourceBodyBytes = 1;
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
    assert.throws(() => validateTag(trace, {}));
  }
});
test('fallback and wrapper claims cannot hide partial native publication or cold phases', () => {
  const trace = receipt();
  trace.loadedCommandModels = ['consumer-component.js'];
  assert.throws(() => validateTag(trace, { error: true }));
  assert.throws(() => validateTag(trace, {}, { wrapper: true }));
  trace.workspaceFrames = [{ kind: 'commandTagApply' }];
  assert.throws(() => validateTag(trace, { canonicalFallback: true }));
  trace.workspaceFrames = [];
  validateTag(trace, {}, { wrapper: true });
  validateTag(trace, { error: true });
});

test('tag no-op owns apply without allocating a finalization phase or emitting persistence', () => {
  const trace = receipt();
  trace.workspaceFrames = trace.workspaceFrames.filter((row) => row.kind !== 'commandTagFinalize');
  delete trace.workspace.commandTagFinalize;
  trace.postPersistNotifications = 0;
  validateTag(trace, { noop: true });
  trace.workspace.commandTagApply.applied = 0;
  assert.throws(() => validateTag(trace, { noop: true }));
});
