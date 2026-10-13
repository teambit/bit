const assert = require('node:assert/strict');
const graphFrame = (frame) =>
  frame.magic === 'BWS1' && ['dependencyScan', 'dependencyResolve'].includes(frame.kind);

// Healthy command acceptance requires the new transaction and body engines independently.
// Genuine error prefixes are added only from retained command traces; fallback-only is never sufficient.
function validateMergeTransactionDiagnostics(trace, scenario, options = {}) {
  const frames = trace.workspaceFrames || [];
  if (options.fileStatuses && ['component-main-theirs', 'main-fast-forward', 'lane-bom-crlf'].includes(scenario.name)) {
    const status = trace.workspace?.fileStatus;
    assert.ok(
      status?.frames > 0 && status.completed > 0 && status.files === status.completed && status.failed === 0,
      `${scenario.name}: completed native file status decisions required`
    );
  }
  if (options.sourceBodies && trace.checkout?.preflight?.completed > 0)
    assert.ok(trace.checkout.preflight.bodyFrames > 0, `${scenario.name}: completed native Source body reads required`);
  const owned = frames.filter((frame) => frame.magic === 'BMT1' && String(frame.kind || '').startsWith('merge'));
  assert.ok(owned.length, `${scenario.name}: no merge transaction engine frames`);
  const owners = new Set(owned.map((frame) => frame.helperId));
  assert.equal(owners.size, 1, `${scenario.name}: more than one merge owner`);
  assert.ok(!owners.has(undefined), 'physical helper identity required');
  const first = frames.findIndex((frame) => owned.includes(frame));
  const last = frames.findLastIndex((frame) => owned.includes(frame));
  const workspace = new Set(['BMT1', 'BMH1', 'BWS1', 'BWP1', 'BWC0', 'BWC2', 'BWC1', 'BCK1']);
  assert.equal(
    new Set(
      frames
        .slice(first, last + 1)
        // Dependency parsing owns a graph cache on the shared pool, not transaction state.
        .filter((frame) => workspace.has(frame.magic) && !graphFrame(frame))
        .map((frame) => frame.helperId)
    ).size,
    1,
    `${scenario.name}: owned workspace frames used a replacement helper`
  );
  const metrics = trace.mergeState || {};
  for (const kind of new Set(owned.map((frame) => frame.kind))) {
    assert.equal(metrics[kind]?.failed, 0, `${scenario.name}: ${kind} declined`);
    assert.equal(metrics[kind]?.sourceBodyBytes, 0, `${scenario.name}: private RPC transported Source bytes`);
    assert.equal(metrics[kind]?.dataFailed || 0, 0, `${scenario.name}: Native effects reported failure`);
  }
  const accepted = (kind) => owned.some((frame) => frame.kind === kind) && metrics[kind]?.completed > 0;
  if (scenario.includeDeps) {
    assert.ok(accepted('mergePatternDependencies'), `${scenario.name}: flattened dependency policy fell back`);
    // Main-born dependencies are outside the incoming lane candidate pool, so the
    // canonical pattern callback skips their outcome before referenced-dependency import.
    if (scenario.topology === 'dependency')
      assert.ok(accepted('mergePatternOutcome'), `${scenario.name}: dependency inclusion policy fell back`);
    if (scenario.target === 'main') {
      assert.ok(accepted('mergeDependencyCandidates'), `${scenario.name}: snap candidate policy fell back`);
      assert.ok(accepted('mergeDependencyMissing'), `${scenario.name}: missing dependency policy fell back`);
      if (scenario.candidatesRequired)
        assert.ok(
          metrics.mergeDependencyCandidates.selections?.some((selection) => selection.checked?.length > 0),
          `${scenario.name}: genuine snap candidates required`
        );
    }
  }
  if (scenario.fault) {
    const phases = [
      'validateFlags',
      'context',
      'upToDate',
      'status',
      'importGap',
      'plans',
      'clearTemps',
      'status',
      'pattern',
      'workspaceFilter',
      'throwForFailures',
      'squash',
      'artifacts',
      'lastMergedSnapshot',
      'prompt',
    ];
    const resultLoss = scenario.fault.kind === 'mergeResultsSelect';
    if (!resultLoss)
      phases.push(
        'results',
        'apply',
        'writeMany',
        'workspaceConfig',
        'configConflict',
        'configFiles',
        'laneHistory',
        'persist',
        'pendingWrite'
      );
    if (scenario.fault.phase === 'snap')
      phases.push(
        'bitmap',
        'workspacePolicy',
        'componentRemove',
        'conflicts',
        'install',
        'updatedComponents',
        'bitmapSnapBeforeAutoSnap',
        'snap'
      );
    assert.ok(resultLoss || ['pendingWrite', 'snap'].includes(scenario.fault.phase), 'unknown fault prefix');
    assert.deepEqual(
      metrics.mergeTransactionReceipt.phases.map((row) => row.phase),
      phases
    );
    assert.equal(metrics.mergeTransactionBegin.completed, 3);
    assert.equal(metrics.mergeStatusBegin.completed, 1);
    assert.equal(metrics.mergeStatusReceipt.completed, 8);
    assert.equal(metrics.mergeTransactionFinish?.frames || 0, 0, 'retired owner cannot send Finish');
    assert.equal(metrics.mergeResultsSelect.completed, resultLoss ? 1 : 2);
    assert.ok(accepted('mergePrepare') && accepted('mergePlanOrder'));
    assert.ok(metrics.mergePrepare.verifiedReads.some((read) => read.sourceReads > 0 && read.sourceBodyBytes > 0));
    for (const kind of ['mergeApplyDecision', 'mergeApply', 'mergeMaterialize']) {
      if (resultLoss) assert.equal(metrics[kind]?.frames || 0, 0, 'work escaped lost results receipt');
      else assert.ok(accepted(kind), `${scenario.name}: missing completed ${kind} prefix`);
    }
    if (!resultLoss) assert.ok(metrics.mergeMaterialize.stepsCompleted > 0);
    const terminal = frames.filter((frame) => !graphFrame(frame)).at(-1);
    assert.equal(terminal.kind, scenario.fault.kind, 'no transaction or workspace effects after discarded receipt');
    if (scenario.fault.phase) assert.equal(terminal.phase, scenario.fault.phase);
    return;
  }
  if (scenario.promptCancellation) {
    for (const kind of [
      'mergeTransactionBegin',
      'mergeTransactionReceipt',
      'mergeStatusBegin',
      'mergeStatusReceipt',
      'mergePrepare',
      'mergePlanOrder',
    ])
      assert.ok(accepted(kind), `${scenario.name}: missing prompt prefix ${kind}`);
    for (const kind of [
      'mergeApplyDecision',
      'mergeResultsSelect',
      'mergeApply',
      'mergeMaterialize',
      'mergeTransactionFinish',
    ])
      assert.equal(metrics[kind]?.frames || 0, 0, 'prompt must release native ownership before stdin EOF');
    return;
  }
  for (const kind of [
    'mergeTransactionBegin',
    'mergeTransactionReceipt',
    'mergeTransactionFinish',
    'mergeStatusBegin',
    'mergeStatusReceipt',
  ])
    assert.ok(accepted(kind), `${scenario.name}: missing accepted ${kind}`);
  if (scenario.error && scenario.unrelated) {
    const expected = [
      'validateFlags',
      'context',
      'upToDate',
      'status',
      'importGap',
      'plans',
      'clearTemps',
      'status',
      'pattern',
      'workspaceFilter',
    ];
    assert.deepEqual(
      metrics.mergeTransactionReceipt.phases.map((row) => row.phase),
      expected,
      `${scenario.name}: unrelated error must stop at the observed canonical throw boundary`
    );
    assert.deepEqual(
      metrics.mergeStatusReceipt.phases.map((row) => row.phase),
      ['model', 'unmerged', 'incoming', 'currentId', 'locallyRemoved', 'current', 'modified']
    );
    assert.equal(metrics.mergeTransactionBegin.completed, 2);
    assert.equal(metrics.mergeTransactionFinish.completed, 2);
    assert.equal(metrics.mergeStatusBegin.completed, 1);
    for (const kind of ['mergeApplyDecision', 'mergeResultsSelect', 'mergePrepare', 'mergeApply', 'mergeMaterialize'])
      assert.equal(metrics[kind]?.frames || 0, 0, `${scenario.name}: work escaped the failed status prefix`);
    return;
  }
  if (scenario.name === 'lane-dependency-required-error') {
    assert.deepEqual(
      metrics.mergeTransactionReceipt.phases.map((row) => row.phase),
      ['validateFlags', 'context', 'upToDate', 'status', 'status', 'importGap', 'plans', 'clearTemps', 'status']
    );
    assert.equal(metrics.mergeTransactionBegin.completed, 2);
    assert.equal(metrics.mergeTransactionFinish.completed, 2);
    assert.equal(metrics.mergeStatusBegin.completed, 2);
    assert.equal(metrics.mergeStatusReceipt.completed, 16);
    assert.ok(accepted('mergePatternDependencies') && accepted('mergePatternOutcome'));
    assert.ok(accepted('mergePrepare') && accepted('mergePlanOrder'));
    for (const kind of ['mergeApplyDecision', 'mergeResultsSelect', 'mergeApply', 'mergeMaterialize'])
      assert.equal(metrics[kind]?.frames || 0, 0, 'dependency rejection must stop before apply');
    return;
  }
  if (scenario.error || scenario.canonicalError)
    assert.fail(`${scenario.name}: canonical error prefix requires evidence-specific acceptance rules`);
  assert.ok(accepted('mergeApplyDecision'), `${scenario.name}: apply policy fell back`);
  assert.ok(accepted('mergeResultsSelect'), `${scenario.name}: result selection fell back`);
  if (scenario.resolveUnrelated === 'ours') {
    assert.ok(accepted('mergeLaneBucketDecision'), `${scenario.name}: unrelated lane bucket policy fell back`);
    for (const phase of ['writeMany', 'pendingWrite', 'bitmap', 'importReferencedDeps', 'destroy'])
      assert.ok(
        metrics.mergeTransactionReceipt.phases.some((row) => row.phase === phase),
        `${scenario.name}: missing accepted ${phase} boundary`
      );
    for (const kind of ['mergePrepare', 'mergeApply', 'mergeMaterialize'])
      assert.equal(metrics[kind]?.frames || 0, 0, `${scenario.name}: ours must retain the canonical current files`);
    assert.equal(trace.checkout?.write?.completed || 0, 0);
    return;
  }
  if (scenario.resolveUnrelated === 'theirs') {
    assert.ok(accepted('mergeLaneBucketDecision'), `${scenario.name}: unrelated lane bucket policy fell back`);
    for (const kind of ['mergePrepare', 'mergeApply', 'mergeMaterialize'])
      assert.equal(
        metrics[kind]?.frames || 0,
        0,
        `${scenario.name}: whole-source replacement must not pretend three-way work`
      );
    assert.ok(trace.checkout?.preflight?.completed > 0);
    assert.ok(trace.checkout?.write?.completed > 0, `${scenario.name}: verified incoming Source writes required`);
    assert.equal(trace.checkout.write.failed, 0);
    assert.deepEqual(trace.checkout.write.helperIds, [...owners]);
    return;
  }
  if (scenario.hidden) {
    assert.equal(metrics.mergeStatusBegin.completed, 2, 'visible and hidden statuses must both be considered');
    assert.equal(metrics.mergeApplyDecision.completed, 1, 'hidden component cannot become a visible apply');
    assert.equal(metrics.mergeResultsSelect.completed, 2);
    if (options.repositorySourcePlans) {
      for (const kind of ['mergePrepare', 'mergePlanOrder', 'mergeApply'])
        assert.ok(accepted(kind), `${scenario.name}: repository Source body planning fell back`);
      assert.ok(metrics.mergePrepare.retainedBodies > 0);
      assert.ok(metrics.mergePrepare.verifiedReads?.some((read) => read.sourceReads > 0));
    } else {
      for (const kind of ['mergePrepare', 'mergeApply'])
        assert.equal(metrics[kind]?.frames || 0, 0, 'historical hidden route used canonical body planning');
    }
    assert.equal(metrics.mergeMaterialize?.frames || 0, 0, 'hidden-only history update cannot write workspace bodies');
    assert.equal(trace.checkout?.write?.completed || 0, 0);
    return;
  }
  if (
    (scenario.topology === 'fast-forward' && !scenario.noSnap) ||
    scenario.detachHead ||
    scenario.topology === 'deletion'
  ) {
    assert.equal(
      metrics.mergePrepare?.frames || 0,
      0,
      `${scenario.name}: fast-forward unexpectedly used three-way prepare`
    );
    assert.ok(trace.checkout?.preflight?.completed > 0, `${scenario.name}: verified Source preflight required`);
    assert.ok(trace.checkout?.write?.completed > 0, `${scenario.name}: native Source materialization required`);
    assert.equal(trace.checkout.write.failed, 0, `${scenario.name}: Source materialization failed`);
    assert.deepEqual(trace.checkout.write.helperIds, [...owners], `${scenario.name}: direct writer escaped owner`);
    return;
  }
  assert.ok(accepted('mergePrepare'), `${scenario.name}: retained Source plan required`);
  assert.ok(accepted('mergePlanOrder'), `${scenario.name}: logical Source order policy fell back`);
  assert.ok(
    metrics.mergePrepare.retainedBodies > 0 && metrics.mergePrepare.retainedBytes > 0,
    `${scenario.name}: retained Source bodies required`
  );
  assert.ok(
    metrics.mergePrepare.verifiedReads?.some((read) => read.sourceReads > 0 && read.sourceBodyBytes > 0),
    `${scenario.name}: no verified Native Source decoder reads`
  );
  if (scenario.strategy !== 'ours') {
    assert.ok(accepted('mergeApply'), `${scenario.name}: retained apply fell back`);
    assert.ok(accepted('mergeMaterialize'), `${scenario.name}: direct materialization required`);
    assert.ok(metrics.mergeMaterialize.stepsCompleted > 0, `${scenario.name}: request ACK is not a completed write`);
  }
}
module.exports = { validateMergeTransactionDiagnostics };
