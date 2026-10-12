const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { installed, source } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_HISTORY_RESET_COMPILED === '1';
const api = compiled
  ? installed('@teambit/snapping/dist/rust-history-reset.js')
  : source('scopes/component/snapping/rust-history-reset.ts');
const sourcesBase = path.dirname(installed.resolve('@teambit/component.sources'));
const materializer = installed(path.join(sourcesBase, 'rust-workspace-materializer.js'));
const restored = new WeakSet();
const token = 'a'.repeat(40);
function phases(options) {
  if (options.mode === 'neverExported') return ['ids', 'deleteObjects', 'updateBitmap', 'writeBitmap', 'done'];
  if (options.mode === 'soft')
    return [
      'captureLane',
      'softCandidates',
      ...(options.pattern ? ['softPattern'] : []),
      'softApply',
      'markBitmap',
      'destroy',
      'done',
    ];
  return [
    'captureLane',
    'candidates',
    ...(options.pattern ? ['pattern'] : []),
    ...(options.pattern && !options.force && options.head ? ['batchGuard'] : []),
    'components',
    'laneHistory',
    'persist',
    'bitmap',
    'stagedWrite',
    'destroy',
    'done',
  ];
}
function fakeOwner(t, options, lost) {
  if (!restored.has(t)) {
    restored.add(t);
    const original = materializer.acquireWorkspaceSession;
    const flag = process.env.BIT_RUST_CLIENT_VCS;
    t.after(() => {
      materializer.acquireWorkspaceSession = original;
      if (flag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
      else process.env.BIT_RUST_CLIENT_VCS = flag;
    });
  }
  const frames = [],
    effects = { acquisitions: 0, releases: 0, disposals: 0 };
  const sequence = phases(options);
  const session = {
    usable: true,
    async dispose() {
      this.usable = false;
      effects.disposals++;
    },
    async request(build, count, validate) {
      const id = frames.length + 1;
      const input = JSON.parse(build(id).subarray(12));
      frames.push(input);
      if (input.kind === 'historyResetReceipt' && input.phase === lost) return undefined;
      let data;
      if (input.kind === 'historyResetBegin')
        data = { token, revision: 0, directive: { phase: sequence[0], count: 1 } };
      else if (input.kind === 'historyResetReceipt')
        data = {
          token,
          revision: input.revision + 1,
          directive: { phase: sequence[sequence.indexOf(input.phase) + 1], count: input.nextCount ?? 1 },
        };
      else if (input.kind === 'historyResetFinish') data = { finished: true };
      else throw Error('unexpected request ' + input.kind);
      const response = { version: 1, id, completed: 1, skipped: [], failed: false, data };
      assert.equal(validate(response), true, 'fake reply must pass the real transport/schema validator');
      return response;
    },
  };
  materializer.acquireWorkspaceSession = () => {
    effects.acquisitions++;
    return {
      session,
      executable: '/qualification/history-helper',
      async release() {
        effects.releases++;
      },
    };
  };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  return { frames, effects };
}

test('lost history receipts preserve each actual public effect once and never reacquire an owner', async (t) => {
  const options = { mode: 'real', pattern: true, head: true, force: false };
  for (const lost of ['candidates', 'batchGuard', 'components', 'persist', 'bitmap', 'stagedWrite']) {
    const { frames, effects } = fakeOwner(t, options, lost);
    const callbacks = [];
    await api.withRustHistoryResetOperation(options, async () => {
      for (const phase of phases(options).slice(0, -1)) {
        callbacks.push(phase);
        await api.completeRustHistoryResetPhase(phase, phase === 'candidates' ? 3 : undefined);
      }
    });
    assert.deepEqual(callbacks, phases(options).slice(0, -1));
    assert.equal(frames.filter((row) => row.kind === 'historyResetReceipt' && row.phase === lost).length, 1);
    assert.equal(frames.at(-1).phase, lost, 'no private suffix frames after lost receipt');
    assert.equal(effects.acquisitions, 1);
    assert.equal(effects.releases, 1);
    assert.ok(effects.disposals > 0);
  }
});

test('soft and never-exported branches acknowledge only their canonical distinct effects', async (t) => {
  for (const options of [
    { mode: 'soft', pattern: false, head: false, force: false },
    { mode: 'soft', pattern: true, head: false, force: false },
    { mode: 'neverExported', pattern: false, head: false, force: false },
  ]) {
    const { frames, effects } = fakeOwner(t, options);
    const effectsCalled = [];
    await api.withRustHistoryResetOperation(options, async () => {
      for (const phase of phases(options).slice(0, -1)) {
        effectsCalled.push(phase);
        await api.completeRustHistoryResetPhase(phase);
      }
    });
    assert.deepEqual(
      frames.filter((row) => row.kind === 'historyResetReceipt').map((row) => row.phase),
      effectsCalled
    );
    assert.equal(frames.at(-1).kind, 'historyResetFinish');
    assert.equal(effects.acquisitions, 1);
    assert.equal(effects.releases, 1);
    assert.ok(!effectsCalled.includes('persist'), 'these branches never acquire repository persist effects');
  }
});

test('concurrent child callbacks retain Promise.all rejection timing and original error identity', async (t) => {
  const options = { mode: 'real', pattern: false, head: false, force: true };
  const { frames, effects } = fakeOwner(t, options);
  const original = new Error('component effect failed after head mutation');
  let releaseSibling;
  const gate = new Promise((resolve) => {
    releaseSibling = resolve;
  });
  const observed = [];
  let sibling;
  await assert.rejects(
    api.withRustHistoryResetOperation(options, async () => {
      for (const phase of ['captureLane', 'candidates']) await api.completeRustHistoryResetPhase(phase);
      sibling = (async () => {
        observed.push('sibling began');
        await gate;
        observed.push('sibling completed');
      })();
      await Promise.all([
        sibling,
        (async () => {
          observed.push('failing child mutated');
          throw original;
        })(),
      ]);
    }),
    (error) => error === original
  );
  assert.deepEqual(observed, ['sibling began', 'failing child mutated']);
  assert.equal(frames.at(-1).kind, 'historyResetFinish');
  assert.equal(effects.releases, 1);
  releaseSibling();
  await sibling;
  assert.deepEqual(observed, ['sibling began', 'failing child mutated', 'sibling completed']);
});

test('nested public reset callback reuses the outer owner and cannot release it early', async (t) => {
  const options = { mode: 'real', pattern: false, head: true, force: true };
  const { frames, effects } = fakeOwner(t, options);
  await api.withRustHistoryResetOperation(options, async () => {
    await api.withRustHistoryResetOperation({ mode: 'soft', pattern: true, head: false, force: false }, async () => {
      assert.equal(api.isRustHistoryResetOperation(), true);
      assert.equal(effects.releases, 0);
    });
    for (const phase of phases(options).slice(0, -1)) await api.completeRustHistoryResetPhase(phase);
  });
  assert.equal(frames.filter((row) => row.kind === 'historyResetBegin').length, 1);
  assert.equal(frames.filter((row) => row.kind === 'historyResetFinish').length, 1);
  assert.equal(effects.acquisitions, 1);
  assert.equal(effects.releases, 1);
});

test('whole-command acceptance refuses fallback-only components, empty forks and private Source bodies', () => {
  const { validateHistoryResetDiagnostics } = require('./history-reset-validation.cjs');
  const kinds = [
    'historyResetBegin',
    'historyResetReceipt',
    'historyResetFinish',
    'historyResetFork',
    'historyResetLocalVersions',
    'historyResetComponentPlan',
    'historyResetPattern',
  ];
  const mergeState = Object.fromEntries(
    kinds.map((kind) => [
      kind,
      { completed: 1, failed: 0, sourceBodyBytes: 0, helperIds: [1], phases: [], children: [] },
    ])
  );
  mergeState.historyResetFork.children = [{ token: 'child' }];
  mergeState.historyResetReceipt.phases = [{ token: 'child', phase: 'model', revision: 0 }];
  const diagnostics = [
    {
      scenario: 'main-head',
      trace: {
        mergeState,
        workspaceFrames: [
          { magic: 'BMT1', kind: 'historyResetBegin', helperId: 1 },
          { magic: 'BMT1', kind: 'historyResetFinish', helperId: 1 },
        ],
      },
    },
  ];
  mergeState.historyResetComponentPlan.completed = 0;
  assert.throws(() => validateHistoryResetDiagnostics(diagnostics), /missing accepted historyResetComponentPlan/);
  mergeState.historyResetComponentPlan.completed = 1;
  mergeState.historyResetFork.children = [];
  assert.throws(() => validateHistoryResetDiagnostics(diagnostics), /actual child tokens/);
  mergeState.historyResetFork.children = [{ token: 'child' }];
  mergeState.historyResetComponentPlan.sourceBodyBytes = 1;
  assert.throws(() => validateHistoryResetDiagnostics(diagnostics), /private Source body/);
});
