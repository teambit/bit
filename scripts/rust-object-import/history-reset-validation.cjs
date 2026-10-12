const assert = require('node:assert/strict');

// Acceptance is checked for each public flow, so an unrelated successful kernel
// cannot hide a canonical-only reset path. Callback failures retain their prefix.
function validateHistoryResetDiagnostics(diagnostics) {
  assert.ok(diagnostics.length, 'real Native reset diagnostics are required');
  const totals = {};
  for (const row of diagnostics) {
    const metrics = row.trace.mergeState;
    const retiredRead = ['missing-local-version', 'corrupt-local-version'].includes(row.scenario);
    const required = ['historyResetBegin', 'historyResetReceipt'];
    if (!retiredRead) required.push('historyResetFinish');
    const soft = row.scenario.startsWith('soft-');
    const never = row.scenario === 'never-exported';
    const batchRejected = row.scenario === 'dependent-blocked';
    const earlyChildRejected = [
      'detached-head',
      'missing-local-version',
      'corrupt-local-version',
      'candidate-dependent-blocked',
    ].includes(row.scenario);
    if (retiredRead) {
      // The verified reader fails before candidate discovery; its engine retires.
      // Healthy token cleanup is therefore forbidden after this exact prefix.
    } else if (soft) required.push('historyResetSoft');
    else if (never) required.push('historyResetNeverExported');
    else if (batchRejected) required.push('historyResetDependents');
    else {
      required.push('historyResetFork');
      if (!['missing-local-version', 'corrupt-local-version'].includes(row.scenario))
        required.push('historyResetLocalVersions');
      if (!earlyChildRejected) required.push('historyResetComponentPlan');
    }
    if (
      batchRejected ||
      [
        'main-head',
        'main-all',
        'dependent-force',
        'snap-dependent-not-indexed',
        'detached-head',
        'detached-all',
        'persist-callback-failure',
      ].includes(row.scenario)
    )
      required.push('historyResetPattern');
    if (row.scenario.startsWith('lane-'))
      required.push('historyResetLocalRead', 'historyResetLaneHistory', 'snapshotSerialize', 'snapshotCommit');
    if (row.scenario === 'detached-all') required.push('historyResetLocalAppend');
    if (row.scenario === 'candidate-dependent-blocked') required.push('historyResetPattern', 'historyResetDependents');
    for (const kind of required) {
      assert.ok(metrics[kind]?.completed > 0, row.scenario + ': missing accepted ' + kind);
      assert.equal(metrics[kind].failed, 0, row.scenario + ': failed required ' + kind);
    }
    if (row.scenario === 'soft-pattern')
      assert.ok(
        metrics.historyResetReceipt.phases.some((phase) => phase.phase === 'softPattern'),
        'soft-pattern: combined Soft selector must acknowledge the public pattern phase'
      );
    if (row.scenario.startsWith('lane-')) {
      assert.ok(
        metrics.snapshotSerialize.acceptedTypes.LaneHistory > 0,
        row.scenario + ': actual LaneHistory metadata must serialize natively'
      );
      assert.ok(
        metrics.snapshotCommit.stepsCompleted > 0,
        row.scenario + ': actual object write prefix must commit natively'
      );
      assert.equal(metrics.snapshotCommit.dataFailed, 0, row.scenario + ': Native object write failed');
    }
    const owners = new Set();
    for (const [kind, metric] of Object.entries(metrics)) {
      if (!kind.startsWith('historyReset')) continue;
      assert.equal(metric.failed, 0, row.scenario + ': failed ' + kind);
      assert.equal(metric.sourceBodyBytes, 0, row.scenario + ': private Source body in ' + kind);
      for (const owner of metric.helperIds) owners.add(owner);
      totals[kind] = (totals[kind] || 0) + metric.completed;
    }
    assert.equal(owners.size, 1, row.scenario + ': all reset frames must use one pinned helper');
    const frames = row.trace.workspaceFrames;
    const beginIndex = frames.findIndex((frame) => frame.kind === 'historyResetBegin');
    const finishIndex = frames.findLastIndex((frame) => frame.kind === 'historyResetFinish');
    const ownedFrames = frames
      .slice(beginIndex, finishIndex < 0 ? frames.length : finishIndex + 1)
      .filter((frame) => ['BMT1', 'BMH1', 'BWS1', 'BWP1', 'BWC0', 'BWC1', 'BCK1'].includes(frame.magic));
    assert.equal(
      new Set(ownedFrames.map((frame) => frame.helperId)).size,
      1,
      row.scenario + ': owned history/workspace/persistence frames must share one physical helper'
    );
    if (retiredRead) {
      assert.deepEqual(
        ownedFrames.map((frame) => [frame.magic, frame.kind]),
        [
          ['BMT1', 'historyResetBegin'],
          ['BMT1', 'historyResetReceipt'],
          ['BMH1', 'graph'],
        ],
        row.scenario + ': exact acknowledged prefix before reader retirement'
      );
      assert.equal(frames.at(-1).magic, 'BMH1');
      assert.equal(frames.at(-1).kind, 'graph');
      assert.equal(row.trace.history.graph.frames, 1);
      assert.equal(row.trace.history.graph.completed, 0);
      assert.equal(row.trace.history.graph.failed, 1);
      assert.equal(row.trace.history.graph.bodyBytes, 0);
      assert.deepEqual(
        metrics.historyResetReceipt.phases.map(({ phase, revision }) => ({ phase, revision })),
        [{ phase: 'captureLane', revision: 0 }]
      );
      for (const [kind, metric] of Object.entries(metrics))
        if (kind.startsWith('historyReset') && !['historyResetBegin', 'historyResetReceipt'].includes(kind))
          assert.equal(metric.frames, 0, row.scenario + ': no private suffix after failed verified read');
    }
    const fork = metrics.historyResetFork;
    if (!soft && !never && !batchRejected && !retiredRead) {
      assert.ok(fork.children.length, row.scenario + ': Fork must expose actual child tokens');
      const children = new Set(fork.children.map((child) => child.token));
      const phases = metrics.historyResetReceipt.phases.filter((phase) => children.has(phase.token));
      assert.ok(phases.length, row.scenario + ': child receipts must be accepted on child tokens');
      for (const token of children) {
        const revisions = phases.filter((phase) => phase.token === token).map((phase) => phase.revision);
        assert.deepEqual(
          revisions,
          revisions.map((_, index) => index),
          row.scenario + ': independent monotonic child revisions'
        );
      }
    }
  }
  return { commands: diagnostics.length, accepted: totals };
}
module.exports = { validateHistoryResetDiagnostics };
