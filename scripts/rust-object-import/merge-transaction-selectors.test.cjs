const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installed, source } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_MERGE_TRANSACTION_COMPILED === '1';
const selectors = compiled
  ? installed('@teambit/merging/dist/rust-merge-apply.js')
  : source('scopes/component/merging/rust-merge-apply.ts');
// The selectors import Objects by package name; use its genuine defining owner in both loader modes.
const api = installed('@teambit/objects/dist/objects/rust-merge-transaction.js');
const { MergingMain } = installed('@teambit/merging/dist/merging.main.runtime.js');
const { ComponentID } = installed('@teambit/component-id');
// Actual merge status loads model Versions before applying selectors; load that defining module here too.
assert.equal(typeof installed('@teambit/objects').Version, 'function');
const materializer = installed('@teambit/component.sources/dist/rust-workspace-materializer.js');
function fixture(t, respond) {
  const original = materializer.acquireWorkspaceSession,
    flag = process.env.BIT_RUST_CLIENT_VCS;
  const frames = [];
  const session = {
    usable: true,
    async dispose() {
      this.usable = false;
    },
    async request(build, count, validate) {
      const input = JSON.parse(build(frames.length + 1).subarray(12));
      frames.push(input);
      const data =
        input.kind === 'mergeTransactionBegin'
          ? { token: 'e'.repeat(40), revision: 0, directive: { phase: 'results', index: 0, count: 2 } }
          : input.kind === 'mergeTransactionFinish'
            ? { finished: true }
            : await respond(input);
      if (data !== undefined) {
        const response = { version: 1, id: frames.length, completed: count, skipped: [], failed: false, data };
        return validate(response) ? response : undefined;
      }
    },
  };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  materializer.acquireWorkspaceSession = () => ({
    session,
    executable: '/qualification/merge-helper',
    release: async () => {},
  });
  t.after(() => {
    materializer.acquireWorkspaceSession = original;
    if (flag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = flag;
  });
  const receiver = new MergingMain(...Array(13).fill(undefined));
  return {
    frames,
    receiver,
    run: (mode, action) =>
      api.withRustMergeTransactionOperation(() => api.withRustMergeTransactionJournal({ mode, count: 2 }, action)),
  };
}

test('genuine default merging class consumes apply and lane decisions without public callback replay', async (t) => {
  const f = fixture(t, (input) =>
    input.kind === 'mergeLaneBucketDecision'
      ? { laneBucket: 'hidden' }
      : {
          action: input.strategy === 'ours' ? 'oursConflict' : 'unrelatedOurs',
          keepLocalVersion: true,
          pending: false,
          manualPaths: false,
          shouldSquash: false,
        }
  );
  await f.run('apply', async () => {
    const merge = { hasConflicts: true };
    const current = {};
    const ours = await selectors.tryRustMergeApplyDecision(f.receiver, 0, {
      currentComponent: current,
      mergeResults: merge,
      mergeStrategy: 'ours',
    });
    assert.equal(ours.action, 'oursConflict');
    assert.equal(merge.hasConflicts, true);
    assert.equal(Object.keys(current).length, 0);
    const unrelated = await selectors.tryRustMergeApplyDecision(f.receiver, 1, {
      resolvedUnrelated: { strategy: 'ours' },
      mergeStrategy: 'theirs',
    });
    assert.equal(unrelated.action, 'unrelatedOurs');
    assert.equal(
      await selectors.tryRustMergeLaneBucket(f.receiver, 0, {
        otherIsMain: true,
        currentOnLane: false,
        currentHidden: true,
      }),
      'hidden'
    );
  });
  assert.equal(f.frames.filter((frame) => frame.kind === 'mergeApplyDecision').length, 2);
});

test('wrong journal mode and result descriptor getters decline before selector requests', async (t) => {
  const f = fixture(t, () => {
    throw Error('selector must not request');
  });
  let reads = 0;
  const merge = {};
  Object.defineProperty(merge, 'hasConflicts', {
    enumerable: true,
    get() {
      reads++;
      throw Error('getter');
    },
  });
  await f.run('status', async () =>
    assert.equal(await selectors.tryRustMergeApplyDecision(f.receiver, 0, { mergeResults: merge }), undefined)
  );
  await f.run('apply', async () =>
    assert.equal(await selectors.tryRustMergeApplyDecision(f.receiver, 0, { mergeResults: merge }), undefined)
  );
  assert.equal(reads, 0);
  assert.equal(f.frames.filter((frame) => frame.kind === 'mergeApplyDecision').length, 0);
});

test('results selection post-ACK does not invoke a late JSON stringify hook and retains ID aliases', async (t) => {
  const original = JSON.stringify;
  let calls = 0;
  const f = fixture(t, () => {
    JSON.stringify = () => {
      calls++;
      throw Error('late stringify');
    };
    return { failed: [], remove: [], succeeded: [0], visible: [0] };
  });
  const id = ComponentID.fromString('qualification.checkout/component@1.0.0');
  const rows = [{}],
    hidden = [],
    results = [id];
  try {
    await f.run('apply', async () => {
      const selected = await selectors.tryRustMergeResultsSelection(f.receiver, rows, hidden, results);
      assert.deepEqual(selected, { failed: [], remove: [], succeeded: [0], visible: [0] });
      assert.equal(results[0], id);
    });
  } finally {
    JSON.stringify = original;
  }
  assert.equal(calls, 0);
});

test('same-valued result row replacement after ACK declines before applying native index selection', async (t) => {
  const rows = [{ shouldBeRemoved: false }];
  const f = fixture(t, () => {
    rows[0] = { shouldBeRemoved: false };
    return { failed: [], remove: [], succeeded: [0], visible: [] };
  });
  await f.run('apply', async () =>
    assert.equal(await selectors.tryRustMergeResultsSelection(f.receiver, rows), undefined)
  );
  assert.equal(f.frames.filter((frame) => frame.kind === 'mergeResultsSelect').length, 1);
});

test('healthy load directive preserves input aliases and rejects a late accessor without reading it', async (t) => {
  const current = {},
    merge = { hasConflicts: false };
  let reads = 0,
    mutate = false;
  const f = fixture(t, () => {
    if (mutate)
      Object.defineProperty(merge, 'hasConflicts', {
        configurable: true,
        enumerable: true,
        get() {
          reads++;
          throw Error('late conflicts getter');
        },
      });
    return {
      action: 'load',
      load: 'remote',
      keepLocalVersion: false,
      pending: true,
      manualPaths: false,
      shouldSquash: false,
      headUpdate: 'main',
    };
  });
  await f.run('apply', async () => {
    const decision = await selectors.tryRustMergeApplyDecision(f.receiver, 0, {
      currentComponent: current,
      mergeResults: merge,
    });
    assert.equal(decision.action, 'load');
    assert.equal(decision.load, 'remote');
    assert.equal(Object.keys(current).length, 0);
    mutate = true;
    assert.equal(
      await selectors.tryRustMergeApplyDecision(f.receiver, 1, { currentComponent: current, mergeResults: merge }),
      undefined
    );
  });
  assert.equal(reads, 0);
  assert.equal(f.frames.filter((frame) => frame.kind === 'mergeApplyDecision').length, 2);
});
test('main result selection rejects late Set.has accessor without private getter calls or replay', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(Set.prototype, 'has');
  let reads = 0;
  t.after(() => Object.defineProperty(Set.prototype, 'has', descriptor));
  const f = fixture(t, () => {
    Object.defineProperty(Set.prototype, 'has', {
      configurable: true,
      get() {
        reads++;
        return descriptor.value;
      },
    });
    return { failed: [], remove: [], succeeded: [0], visible: [] };
  });
  const rows = [{ id: ComponentID.fromString('qualification/component'), hasConflicts: false }];
  await f.run('apply', async () => {
    assert.equal(await selectors.tryRustMergeResultsSelection(f.receiver, rows), undefined);
  });
  assert.equal(reads, 0);
  assert.equal(f.frames.filter((frame) => frame.kind === 'mergeResultsSelect').length, 1);
});
test('main result selection rejects initial Set.has accessor before sending policy or invoking it', async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(Set.prototype, 'has');
  let reads = 0;
  t.after(() => Object.defineProperty(Set.prototype, 'has', descriptor));
  const f = fixture(t, () => {
    throw new Error('policy must decline before request');
  });
  await f.run('apply', async () => {
    Object.defineProperty(Set.prototype, 'has', {
      configurable: true,
      get() {
        reads++;
        return descriptor.value;
      },
    });
    assert.equal(await selectors.tryRustMergeResultsSelection(f.receiver, [{ shouldBeRemoved: false }]), undefined);
  });
  assert.equal(reads, 0);
  assert.equal(f.frames.filter((frame) => frame.kind === 'mergeResultsSelect').length, 0);
});
test('acquired apply decision exposes a pure late witness for DATA and accessor conflict mutations', async (t) => {
  const f = fixture(t, () => ({
    action: 'load',
    load: 'remote',
    manualPaths: true,
    keepLocalVersion: false,
    pending: true,
    shouldSquash: false,
  }));
  await f.run('apply', async () => {
    const merge = { hasConflicts: true };
    const decision = await selectors.tryRustMergeApplyDecision(f.receiver, 0, {
      currentComponent: {},
      mergeResults: merge,
      mergeStrategy: 'manual',
    });
    assert.ok(decision);
    assert.equal(decision.isCurrent(), true);
    merge.hasConflicts = false;
    assert.equal(decision.isCurrent(), false);
    merge.hasConflicts = true;
    assert.equal(decision.isCurrent(), true);
    let reads = 0;
    Object.defineProperty(merge, 'hasConflicts', {
      configurable: true,
      enumerable: true,
      get() {
        reads++;
        return true;
      },
    });
    assert.equal(decision.isCurrent(), false);
    assert.equal(reads, 0);
  });
});
