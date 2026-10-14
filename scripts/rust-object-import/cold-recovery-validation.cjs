const assert = require('node:assert/strict');

function validateRecovery(trace, scenario, { wrapper = false } = {}) {
  const frames = trace.workspaceFrames || [];
  const commands = frames.filter((frame) => typeof frame.kind === 'string' && frame.kind.startsWith('command'));
  if (wrapper) {
    assert.equal(commands.length, 0, 'wrapper baseline must not execute any cold phase');
    assert.ok(trace.loadedCommandModels.length, 'wrapper baseline must exercise canonical lifecycle');
    return;
  }
  const names =
    scenario.operation === 'reset'
      ? ['commandPrepare', 'commandPlan', 'commandApply']
      : scenario.operation === 'laneAbort'
        ? ['commandRecoveryPrepare', 'commandRecoveryPlan', 'commandRecoveryRestore', 'commandRecoveryApply']
        : ['commandRecoveryPrepare', 'commandRecoveryPlan', 'commandRecoveryApply'];
  if (scenario.error || scenario.canonicalFallback) {
    assert.ok(!commands.some((frame) => /(?:Apply|Restore)$/.test(frame.kind)), 'decline cannot publish');
    assert.ok(trace.loadedCommandModels.length, 'explicit fallback must execute canonical lifecycle');
    return;
  }
  assert.deepEqual(
    commands.map((frame) => frame.kind),
    names,
    'exact retained recovery phase order'
  );
  for (const name of names) {
    const metric = trace.workspace[name];
    assert.equal(metric?.frames, 1, `${name}: one request`);
    assert.equal(metric.failed, 0, `${name}: accepted response`);
  }
  assert.equal(trace.workspace[names.at(-1)].applied, 1, 'actual accepted publication receipt required');
  if (scenario.operation === 'laneAbort')
    assert.equal(trace.workspace.commandRecoveryRestore.restored, 1, 'accepted restoration receipt required');
  assert.deepEqual(trace.loadedCommandModels, [], 'cold recovery must not hydrate canonical model classes');
  for (const metric of Object.values(trace.workspace))
    assert.equal(metric.sourceBodyBytes || 0, 0, 'Source bodies cannot cross the metadata bridge');
  for (const frame of frames) assert.ok(Number.isSafeInteger(frame.helperId) && frame.helperId > 0);
  assert.equal(new Set(frames.map((frame) => frame.helperId)).size, 1, 'one retained helper owns recovery');
}

module.exports = { validateRecovery };
