const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateMergeTransactionDiagnostics } = require('./merge-transaction-validation.cjs');
function positive() {
  const kinds = [
    'mergeTransactionBegin',
    'mergeStatusBegin',
    'mergeStatusReceipt',
    'mergeTransactionReceipt',
    'mergeResultsSelect',
    'mergeApplyDecision',
    'mergePrepare',
    'mergePlanOrder',
    'mergeApply',
    'mergeMaterialize',
    'mergeTransactionFinish',
  ];
  return {
    workspaceFrames: kinds.map((kind) => ({ magic: 'BMT1', kind, helperId: 1 })),
    mergeState: Object.fromEntries(
      kinds.map((kind) => [
        kind,
        {
          completed: 1,
          failed: 0,
          sourceBodyBytes: 0,
          dataFailed: 0,
          retainedBodies: kind === 'mergePrepare' ? 2 : 0,
          retainedBytes: kind === 'mergePrepare' ? 40 : 0,
          stepsCompleted: kind === 'mergeMaterialize' ? 2 : 0,
          verifiedReads: kind === 'mergePrepare' ? [{ sourceReads: 2, sourceBodyBytes: 40 }] : [],
        },
      ])
    ),
  };
}
test('merge acceptance rejects aggregate-only fallback, replacement owners and no-op write ACKs', () => {
  const scenario = { name: 'lane-clean-diverge' };
  validateMergeTransactionDiagnostics(positive(), scenario);
  for (const mutate of [
    (t) => {
      t.mergeState.mergeStatusReceipt.completed = 0;
    },
    (t) => {
      t.mergeState.mergeMaterialize.stepsCompleted = 0;
    },
    (t) => {
      t.mergeState.mergePrepare.retainedBodies = 0;
    },
    (t) => {
      t.mergeState.mergePrepare.verifiedReads = [];
    },
    (t) => {
      t.mergeState.mergePrepare.sourceBodyBytes = 5;
    },
    (t) => {
      t.workspaceFrames[1].helperId = 2;
    },
    (t) => {
      t.workspaceFrames.splice(2, 0, { magic: 'BWP1', helperId: 2 });
    },
    (t) => {
      t.mergeState.mergeTransactionReceipt.failed = 1;
    },
  ]) {
    const trace = positive();
    mutate(trace);
    assert.throws(() => validateMergeTransactionDiagnostics(trace, scenario));
  }
});
test('cancellation permits the observed policy prefix but cannot authorize ordinary direct writes', () => {
  const trace = positive();
  trace.workspaceFrames = trace.workspaceFrames.filter(
    (f) =>
      ![
        'mergeApplyDecision',
        'mergeResultsSelect',
        'mergeApply',
        'mergeMaterialize',
        'mergeTransactionFinish',
      ].includes(f.kind)
  );
  for (const kind of [
    'mergeApplyDecision',
    'mergeResultsSelect',
    'mergeApply',
    'mergeMaterialize',
    'mergeTransactionFinish',
  ])
    trace.mergeState[kind] = { frames: 0, completed: 0 };
  validateMergeTransactionDiagnostics(trace, { name: 'prompt-cancel', promptCancellation: true });
  assert.throws(() => validateMergeTransactionDiagnostics(trace, { name: 'clean' }));
  assert.throws(
    () => validateMergeTransactionDiagnostics(positive(), { name: 'typed-error', error: true }),
    /evidence-specific/
  );
});
test('fast-forward requires existing verified Source writer effects rather than a nonexistent three-way plan', () => {
  const trace = positive();
  trace.workspaceFrames = trace.workspaceFrames.filter(
    (frame) => !['mergePrepare', 'mergeMaterialize'].includes(frame.kind)
  );
  trace.mergeState.mergePrepare = { frames: 0, completed: 0, failed: 0 };
  trace.checkout = { preflight: { completed: 5 }, write: { completed: 5, failed: 0, helperIds: [1] } };
  validateMergeTransactionDiagnostics(trace, { name: 'main-fast-forward', topology: 'fast-forward' });
  trace.checkout.write.completed = 0;
  assert.throws(
    () => validateMergeTransactionDiagnostics(trace, { name: 'main-fast-forward', topology: 'fast-forward' }),
    /materialization/
  );
  trace.checkout.write.completed = 5;
  trace.checkout.write.helperIds = [2];
  assert.throws(
    () => validateMergeTransactionDiagnostics(trace, { name: 'main-fast-forward', topology: 'fast-forward' }),
    /escaped owner/
  );
});
test('unrelated error acceptance requires exact healthy status prefix and forbids apply work', () => {
  function prefix() {
    const trace = positive();
    trace.workspaceFrames = trace.workspaceFrames.filter((frame) =>
      [
        'mergeTransactionBegin',
        'mergeTransactionReceipt',
        'mergeTransactionFinish',
        'mergeStatusBegin',
        'mergeStatusReceipt',
      ].includes(frame.kind)
    );
    trace.mergeState.mergeTransactionBegin.completed = 2;
    trace.mergeState.mergeTransactionFinish.completed = 2;
    trace.mergeState.mergeTransactionReceipt.phases = [
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
    ].map((phase) => ({ phase }));
    trace.mergeState.mergeStatusReceipt.phases = [
      'model',
      'unmerged',
      'incoming',
      'currentId',
      'locallyRemoved',
      'current',
      'modified',
    ].map((phase) => ({ phase }));
    for (const key of ['mergeApplyDecision', 'mergeResultsSelect', 'mergePrepare', 'mergeApply', 'mergeMaterialize'])
      trace.mergeState[key].frames = 0;
    return trace;
  }
  const scenario = { name: 'lane-unrelated-error', unrelated: true, error: true };
  validateMergeTransactionDiagnostics(prefix(), scenario);
  for (const change of [
    (trace) => trace.mergeState.mergeStatusReceipt.phases.push({ phase: 'divergence' }),
    (trace) => (trace.mergeState.mergePrepare.frames = 1),
    (trace) => (trace.mergeState.mergeTransactionFinish.completed = 1),
    (trace) => (trace.mergeState.mergeStatusReceipt.failed = 1),
  ]) {
    const trace = prefix();
    change(trace);
    assert.throws(() => validateMergeTransactionDiagnostics(trace, scenario));
  }
});

test('retained command failure traces require the exact stopped prefix and reject replay', () => {
  // Projections of actual release-helper traces; full raw trace hashes are retained in each fixture.
  for (const fixture of require('./merge-transaction-prefix-fixtures.json')) {
    validateMergeTransactionDiagnostics(fixture.trace, fixture.scenario);
    for (const mutate of [
      (trace) => {
        trace.workspaceFrames.push({ magic: 'BMT1', kind: 'mergeTransactionFinish', helperId: 2 });
      },
      (trace) => {
        trace.mergeState.mergeTransactionReceipt.phases.pop();
      },
      (trace) => {
        trace.mergeState.mergePrepare.sourceBodyBytes = 1;
      },
      (trace) => {
        trace.mergeState.mergeStatusBegin.completed = 0;
      },
    ]) {
      const trace = structuredClone(fixture.trace);
      mutate(trace);
      assert.throws(() => validateMergeTransactionDiagnostics(trace, fixture.scenario), fixture.scenario.name);
    }
  }
});

test('no-snap fast-forward uses the retained three-way body path', () => {
  const trace = positive();
  validateMergeTransactionDiagnostics(trace, {
    name: 'lane-fast-forward-no-snap',
    topology: 'fast-forward',
    noSnap: true,
  });
  trace.mergeState.mergeMaterialize.stepsCompleted = 0;
  assert.throws(() =>
    validateMergeTransactionDiagnostics(trace, {
      name: 'lane-fast-forward-no-snap',
      topology: 'fast-forward',
      noSnap: true,
    })
  );
});
