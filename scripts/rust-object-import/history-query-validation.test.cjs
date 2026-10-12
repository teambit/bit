const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateHistoryQueryDiagnostics } = require('./history-query-validation.cjs');

function positive(name = 'log') {
  const kinds = [
    'historyQueryBegin',
    ...(name === 'blame' ? ['historyQueryFiles', 'historyQueryBlame'] : []),
    'historyQueryFinish',
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
          verifiedReads:
            kind === 'historyQueryBegin'
              ? [
                  {
                    versionObjects: 3,
                    versionInflatedBytes: 1200,
                    sourceObjects: 0,
                    sourceBodyBytes: 0,
                    overlayVersions: 0,
                  },
                ]
              : kind === 'historyQueryBlame'
                ? [
                    {
                      versionObjects: 0,
                      versionInflatedBytes: 0,
                      sourceObjects: 2,
                      sourceBodyBytes: 40,
                      overlayVersions: 0,
                    },
                  ]
                : [],
        },
      ])
    ),
  };
}

test('command acceptance rejects fallback-only history, replacement helper and body input', () => {
  validateHistoryQueryDiagnostics(positive(), { name: 'log' });
  for (const mutate of [
    (trace) => {
      trace.mergeState.historyQueryBegin.completed = 0;
    },
    (trace) => {
      trace.workspaceFrames[1].helperId = 2;
    },
    (trace) => {
      trace.workspaceFrames.splice(1, 0, { magic: 'BWS1', kind: 'read', helperId: 2 });
    },
    (trace) => {
      trace.mergeState.historyQueryBegin.sourceBodyBytes = 10;
    },
    (trace) => {
      trace.mergeState.historyQueryBegin.verifiedReads = [];
    },
    (trace) => {
      trace.mergeState.historyQueryFinish.failed = 1;
    },
  ]) {
    const trace = positive();
    mutate(trace);
    assert.throws(() => validateHistoryQueryDiagnostics(trace, { name: 'log' }));
  }
});

test('accepted blame metadata cannot substitute for verified native Source reads', () => {
  const trace = positive('blame');
  validateHistoryQueryDiagnostics(trace, { name: 'blame', file: 'stable.txt' });
  trace.mergeState.historyQueryBlame.verifiedReads = [{ sourceObjects: 0, sourceBodyBytes: 0, overlayVersions: 9 }];
  assert.throws(() => validateHistoryQueryDiagnostics(trace, { name: 'blame', file: 'stable.txt' }));
});

test('stateless show requires Toposort while JSON serialization is explicitly parity-only', () => {
  const trace = {
    workspaceFrames: [{ magic: 'BMT1', kind: 'historyQueryToposort', helperId: 1 }],
    mergeState: { historyQueryToposort: { completed: 1, failed: 0, sourceBodyBytes: 0, verifiedReads: [] } },
  };
  validateHistoryQueryDiagnostics(trace, { name: 'version-history-show', nativeExpectation: 'stateless-toposort' });
  trace.mergeState.historyQueryToposort.completed = 0;
  assert.throws(() =>
    validateHistoryQueryDiagnostics(trace, { name: 'version-history-show', nativeExpectation: 'stateless-toposort' })
  );
  validateHistoryQueryDiagnostics(
    { workspaceFrames: [], mergeState: {} },
    { name: 'version-history-json', nativeExpectation: 'parity-only' }
  );
  assert.throws(() =>
    validateHistoryQueryDiagnostics(trace, { name: 'version-history-json', nativeExpectation: 'parity-only' })
  );
});

test('planned Show construction/ranking does not invent a second Toposort or token lifecycle', () => {
  const trace = {
    workspaceFrames: [{ magic: 'BMT1', kind: 'historyQueryShow', helperId: 1 }],
    mergeState: { historyQueryShow: { completed: 1, failed: 0, sourceBodyBytes: 0, verifiedReads: [] } },
  };
  validateHistoryQueryDiagnostics(trace, { name: 'version-history-show', nativeExpectation: 'stateless-show' });
  trace.mergeState.historyQueryShow.completed = 0;
  assert.throws(() =>
    validateHistoryQueryDiagnostics(trace, { name: 'version-history-show', nativeExpectation: 'stateless-show' })
  );
});

test('public log-file requires raw Diff reads but does not invent file-lineage callbacks', () => {
  const trace = positive();
  trace.workspaceFrames.splice(1, 0, { magic: 'BMT1', kind: 'historyQueryDiff', helperId: 1 });
  trace.mergeState.historyQueryDiff = {
    completed: 1,
    failed: 0,
    sourceBodyBytes: 0,
    verifiedReads: [{ sourceObjects: 2, sourceBodyBytes: 40 }],
  };
  const scenario = { name: 'log-file', file: 'stable.txt', command: ['log-file'] };
  validateHistoryQueryDiagnostics(trace, scenario);
  trace.mergeState.historyQueryDiff.completed = 0;
  assert.throws(() => validateHistoryQueryDiagnostics(trace, scenario), /raw diff/);
});

test('missing current Version permits only the observed pre-engine lookup error prefix', () => {
  const scenario = { name: 'missing-version-log', canonicalError: true };
  validateHistoryQueryDiagnostics({ workspaceFrames: [] }, scenario);
  validateHistoryQueryDiagnostics({ workspaceFrames: [] }, { name: 'corrupt-version-log', canonicalError: true });
  assert.throws(() => validateHistoryQueryDiagnostics(positive(), scenario), /before any engine/);
  assert.throws(
    () =>
      validateHistoryQueryDiagnostics({ workspaceFrames: [{ magic: 'BMH1', kind: 'graph', helperId: 1 }] }, scenario),
    /before any engine/
  );
  assert.throws(() => validateHistoryQueryDiagnostics({ workspaceFrames: [] }, { name: 'log' }), /no history-query/);
});

test('missing Source accepts only the observed retired Blame prefix with no callback or helper replay', () => {
  const scenario = { name: 'missing-source-blame', canonicalError: true, command: ['blame'] };
  const trace = positive('blame');
  trace.workspaceFrames.pop();
  trace.mergeState.historyQueryBlame.completed = 0;
  trace.mergeState.historyQueryBlame.failed = 1;
  validateHistoryQueryDiagnostics(trace, scenario);
  for (const change of [
    (t) => {
      t.workspaceFrames.push({ magic: 'BMT1', kind: 'historyQueryFinish', helperId: 1 });
    },
    (t) => {
      t.workspaceFrames[2].helperId = 2;
    },
    (t) => {
      t.mergeState.historyQueryBlame.failed = 0;
    },
    (t) => {
      t.mergeState.historyQueryFiles.completed = 0;
    },
    (t) => {
      t.mergeState.historyQueryBegin.sourceBodyBytes = 1;
    },
    (t) => {
      t.workspaceFrames.push({ magic: 'BWC0', helperId: 1 });
    },
  ]) {
    const changed = structuredClone(trace);
    change(changed);
    assert.throws(() => validateHistoryQueryDiagnostics(changed, scenario));
  }
  assert.throws(() => validateHistoryQueryDiagnostics(trace, { name: 'blame', command: ['blame'] }), /declined/);
});
