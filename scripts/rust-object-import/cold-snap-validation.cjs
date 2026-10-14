const assert = require('node:assert/strict');

function validateSnap(trace, scenario, { wrapper = false } = {}) {
  const frames = trace.workspaceFrames || [];
  const commands = frames.filter((frame) => typeof frame.kind === 'string' && frame.kind.startsWith('command'));
  if (wrapper) {
    assert.equal(commands.length, 0, 'wrapper baseline must not execute any cold phase');
    assert.ok(trace.loadedCommandModels.length, 'wrapper baseline must exercise canonical lifecycle');
    if (!scenario.error && !scenario.canonicalFallback)
      assert.equal(
        trace.postPersistNotifications,
        scenario.noop ? 0 : 1,
        'canonical snap persists the snapshot batch once'
      );
    return;
  }
  const names = [
    'commandSnapPrepare',
    'commandSnapPlan',
    ...(!scenario.noop ? ['commandSnapFinalize'] : []),
    'commandSnapApply',
  ];
  if (scenario.error || scenario.canonicalFallback) {
    assert.ok(!commands.some((frame) => /(?:Apply|Restore)$/.test(frame.kind)), 'decline cannot publish');
    assert.ok(trace.loadedCommandModels.length, 'explicit fallback must execute canonical lifecycle');
    return;
  }
  assert.deepEqual(
    commands.map((frame) => frame.kind),
    names,
    'exact retained snap phase order'
  );
  for (const name of names) {
    const metric = trace.workspace[name];
    assert.equal(metric?.frames, 1, `${name}: one request`);
    assert.equal(metric.failed, 0, `${name}: accepted response`);
  }
  assert.equal(trace.workspace[names.at(-1)].applied, 1, 'actual accepted publication receipt required');
  assert.equal(
    trace.postPersistNotifications,
    scenario.noop ? 0 : 1,
    'native snap must emit the canonical persistence hook'
  );
  assert.deepEqual(trace.loadedCommandModels, [], 'cold snap must not hydrate canonical model classes');
  for (const metric of Object.values(trace.workspace))
    assert.equal(metric.sourceBodyBytes || 0, 0, 'Source bodies cannot cross the metadata bridge');
  for (const frame of frames) assert.ok(Number.isSafeInteger(frame.helperId) && frame.helperId > 0);
  assert.equal(new Set(frames.map((frame) => frame.helperId)).size, 1, 'one retained helper owns snap');
}

module.exports = { validateSnap };
