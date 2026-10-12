const assert = require('node:assert/strict');

// Acceptance is command-specific: aggregate coverage must not hide a fallback-only route.
function validateHistoryQueryDiagnostics(trace, scenario) {
  const frames = trace.workspaceFrames || [];
  const owned = frames.filter((frame) => String(frame.kind || frame.magic || '').includes('historyQuery'));
  if (['missing-version-log', 'corrupt-version-log'].includes(scenario.name) && scenario.canonicalError) {
    assert.deepEqual(frames, [], 'damaged current Version fails public lookup before any engine request');
    return;
  }
  if (scenario.nativeExpectation === 'parity-only') {
    assert.equal(owned.length, 0, `${scenario.name}: parity-only JSON route unexpectedly uses query engine`);
    return;
  }
  assert.ok(owned.length, `${scenario.name}: no history-query engine frames`);
  const owners = new Set(owned.map((frame) => frame.helperId));
  assert.equal(owners.size, 1, `${scenario.name}: more than one history-query owner`);
  assert.ok(!owners.has(undefined), 'physical helper identity must be recorded');
  const first = frames.findIndex((frame) => owned.includes(frame));
  const last = frames.findLastIndex((frame) => owned.includes(frame));
  const workspaceKinds = new Set(['BMT1', 'BMH1', 'BWS1', 'BWP1', 'BWC0', 'BWC1', 'BCK1']);
  const workspace = frames.slice(first, last + 1).filter((frame) => workspaceKinds.has(frame.magic));
  assert.equal(
    new Set(workspace.map((frame) => frame.helperId)).size,
    1,
    `${scenario.name}: workspace frames inside the owned query used another helper`
  );
  const metrics = trace.mergeState || {};
  if (scenario.name === 'missing-source-blame' && scenario.canonicalError) {
    assert.deepEqual(
      owned.map((frame) => frame.kind),
      ['historyQueryBegin', 'historyQueryFiles', 'historyQueryBlame']
    );
    assert.deepEqual(frames, owned, 'retired reader prefix must have no replacement or later workspace request');
    for (const kind of ['historyQueryBegin', 'historyQueryFiles']) {
      assert.equal(metrics[kind]?.completed, 1);
      assert.equal(metrics[kind]?.failed, 0);
    }
    assert.equal(metrics.historyQueryBlame?.completed, 0);
    assert.equal(metrics.historyQueryBlame?.failed, 1);
    for (const frame of owned) assert.equal(metrics[frame.kind]?.sourceBodyBytes, 0);
    assert.ok(
      metrics.historyQueryBegin.verifiedReads.some((read) => read.versionObjects > 0 && read.versionInflatedBytes > 0)
    );
    return;
  }

  for (const kind of new Set(owned.map((frame) => frame.kind))) {
    assert.equal(metrics[kind]?.failed, 0, `${scenario.name}: ${kind} declined`);
    assert.equal(metrics[kind]?.sourceBodyBytes || 0, 0, 'Source bodies must not enter private metadata RPC');
  }
  const accepted = (kind) => owned.some((frame) => frame.kind === kind) && metrics[kind]?.completed > 0;
  if (scenario.nativeExpectation === 'stateless-toposort') {
    assert.ok(accepted('historyQueryToposort'), `${scenario.name}: stateless native ordering required`);
    return;
  }
  if (scenario.nativeExpectation === 'stateless-show') {
    assert.ok(accepted('historyQueryShow'), `${scenario.name}: native graph construction and ranking required`);
    return;
  }
  const begins = scenario.name.includes('history-build') ? 'historyQueryPopulateBegin' : 'historyQueryBegin';
  assert.ok(accepted(begins), `${scenario.name}: required ${begins}`);
  assert.ok(accepted('historyQueryFinish'), `${scenario.name}: missing successful token cleanup`);
  const blame = scenario.command?.[0] === 'blame' || scenario.name === 'blame';
  const diff =
    (scenario.command?.[0] === 'log-file' && !scenario.suffix?.includes('--one-line')) || scenario.name === 'log-file';
  if (blame) {
    assert.ok(accepted('historyQueryFiles'), `${scenario.name}: missing native file lineage`);
    assert.ok(accepted('historyQueryBlame'), 'blame must accept native Source reads');
  }
  if (diff) assert.ok(accepted('historyQueryDiff'), 'log-file must accept native raw diff');
  const reads = Object.entries(metrics)
    .filter(([kind]) => kind.startsWith('historyQuery'))
    .flatMap(([, metric]) => metric.verifiedReads || []);
  if (!scenario.canonicalError) {
    assert.ok(
      reads.some((row) => row.versionObjects > 0 && row.versionInflatedBytes > 0),
      `${scenario.name}: no verified fresh native Version reads`
    );
    if (blame || diff)
      assert.ok(
        reads.some((row) => row.sourceObjects > 0 && row.sourceBodyBytes > 0),
        `${scenario.name}: no verified fresh native Source reads`
      );
  }
}

module.exports = { validateHistoryQueryDiagnostics };
