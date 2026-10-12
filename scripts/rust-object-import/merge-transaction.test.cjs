const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installed, source } = require('./load-source.cjs');
const api =
  process.env.BIT_TEST_MERGE_TRANSACTION_COMPILED === '1'
    ? installed('@teambit/objects/dist/objects/rust-merge-transaction.js')
    : source('scopes/scope/objects/objects/rust-merge-transaction.ts');
const materializer = installed('@teambit/component.sources/dist/rust-workspace-materializer.js');
function owner(t, respond) {
  const flag = process.env.BIT_RUST_CLIENT_VCS;
  const original = materializer.acquireWorkspaceSession;
  const frames = [];
  let disposed = 0,
    leases = 0;
  const session = {
    usable: true,
    async dispose() {
      if (!this.usable) return;
      this.usable = false;
      disposed++;
    },
    async request(build, count, validate) {
      const input = JSON.parse(build(frames.length + 1).subarray(12));
      frames.push(input);
      const data = await respond(input);
      if (data !== undefined) {
        const response = { version: 1, id: frames.length, completed: count, skipped: [], failed: false, data };
        return validate(response) ? response : undefined;
      }
    },
  };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  materializer.acquireWorkspaceSession = () => {
    leases++;
    return { session, executable: '/qualification/merge-helper', release: async () => {} };
  };
  t.after(() => {
    materializer.acquireWorkspaceSession = original;
    if (flag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = flag;
  });
  return {
    frames,
    session,
    get disposed() {
      return disposed;
    },
    get leases() {
      return leases;
    },
  };
}

test('merge owner serializes frames while nested public callbacks stay concurrent', async (t) => {
  let active = 0,
    maximum = 0;
  const mock = owner(t, async (input) => {
    maximum = Math.max(maximum, ++active);
    await new Promise(setImmediate);
    active--;
    return { value: input.value };
  });
  const callbacks = [];
  await api.withRustMergeTransactionOperation(async () => {
    await Promise.all(
      [1, 2, 3].map((value) =>
        api.withRustMergeTransactionOperation(async () => {
          callbacks.push(value);
          const result = await api.requestRustMergeTransaction({ kind: 'mergeTest', value }, (d) => d.value === value);
          assert.equal(result.value, value);
        })
      )
    );
  });
  assert.deepEqual(callbacks, [1, 2, 3]);
  assert.equal(maximum, 1);
  assert.equal(mock.leases, 1);
});

test('lost merge receipt preserves observed public prefix and never reacquires', async (t) => {
  const effects = [];
  const mock = owner(t, async () => undefined);
  await api.withRustMergeTransactionOperation(async () => {
    effects.push('public-import');
    assert.equal(await api.requestRustMergeTransaction({ kind: 'mergeReceipt' }, () => true), undefined);
    effects.push('canonical-apply');
    assert.equal(await api.requestRustMergeTransaction({ kind: 'mergeReceipt' }, () => true), undefined);
  });
  assert.deepEqual(effects, ['public-import', 'canonical-apply']);
  assert.equal(mock.frames.length, 1);
  assert.equal(mock.leases, 1);
});

test('retained merge finish runs after public rejection and preserves exact error identity', async (t) => {
  const mock = owner(t, async () => ({ finished: true }));
  const error = { message: 'public callback rejected' };
  await assert.rejects(
    api.withRustMergeTransactionOperation(async () => {
      assert.equal(api.retainRustMergeTransactionToken('mergeStatusFinish', 'a'.repeat(40)), true);
      throw error;
    }),
    (thrown) => thrown === error
  );
  assert.deepEqual(
    mock.frames.map((f) => f.kind),
    ['mergeStatusFinish']
  );
});

test('merge metadata rejects custom hooks and proxy traps before private encoding', async (t) => {
  const mock = owner(t, async () => {
    throw Error('must not request');
  });
  let reads = 0;
  await api.withRustMergeTransactionOperation(async () => {
    const input = {};
    Object.defineProperty(input, 'field', {
      enumerable: true,
      get() {
        reads++;
        throw Error('getter');
      },
    });
    assert.equal(await api.requestRustMergeTransaction(input, () => true), undefined);
    const proxy = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          reads++;
          throw Error('proxy');
        },
      }
    );
    assert.equal(await api.requestRustMergeTransaction(proxy, () => true), undefined);
    assert.equal(await api.requestRustMergeTransaction({ values: [, 'sparse'] }, () => true), undefined);
  });
  assert.equal(reads, 0);
  assert.equal(mock.frames.length, 0);
});

test('closing merge owner rejects delayed sibling receipts while retained Finish awaits ACK', async (t) => {
  let enterFinish, releaseFinish;
  const entered = new Promise((resolve) => {
    enterFinish = resolve;
  });
  const finish = new Promise((resolve) => {
    releaseFinish = resolve;
  });
  const mock = owner(t, async (input) => {
    if (input.kind === 'mergeStatusFinish') {
      enterFinish();
      await finish;
    }
    return { finished: true };
  });
  let releaseSibling;
  const siblingGate = new Promise((resolve) => {
    releaseSibling = resolve;
  });
  const effects = [];
  let sibling;
  const error = new Error('first public callback failure');
  const operation = api.withRustMergeTransactionOperation(async () => {
    api.retainRustMergeTransactionToken('mergeStatusFinish', 'b'.repeat(40));
    sibling = (async () => {
      await siblingGate;
      effects.push('observed canonical sibling');
      assert.equal(await api.requestRustMergeTransaction({ kind: 'mergeStatusReceipt' }, () => true), undefined);
      effects.push('canonical sibling suffix');
    })();
    throw error;
  });
  const rejected = assert.rejects(operation, (thrown) => thrown === error);
  await entered;
  releaseSibling();
  await sibling;
  assert.deepEqual(
    mock.frames.map((f) => f.kind),
    ['mergeStatusFinish']
  );
  releaseFinish();
  await rejected;
  assert.deepEqual(effects, ['observed canonical sibling', 'canonical sibling suffix']);
  assert.equal(mock.leases, 1);
});

test('parent and nested merge journals retain independent cursors and finish child before parent', async (t) => {
  let sequence = 0;
  const mock = owner(t, async (input) => {
    if (input.kind === 'mergeTransactionBegin')
      return {
        token: (++sequence).toString(16).padStart(40, '0'),
        revision: 0,
        directive: { phase: input.mode === 'status' ? 'status' : 'prompt', index: 0, count: input.count },
      };
    if (input.kind === 'mergeTransactionReceipt')
      return { token: input.token, revision: input.revision + 1, directive: { phase: 'done', index: 0, count: 0 } };
    return { finished: true };
  });
  await api.withRustMergeTransactionOperation(() =>
    api.withRustMergeTransactionJournal({ mode: 'apply', count: 1 }, async () => {
      const parent = api.getRustMergeTransactionToken();
      await api.withRustMergeTransactionJournal({ mode: 'status', count: 2 }, async () => {
        assert.notEqual(api.getRustMergeTransactionToken(), parent);
        await api.completeRustMergeTransactionPhase('status', 2);
      });
      assert.equal(api.getRustMergeTransactionToken(), parent);
      await api.completeRustMergeTransactionPhase('prompt');
    })
  );
  const begins = mock.frames.filter((f) => f.kind === 'mergeTransactionBegin');
  assert.equal(begins[1].parentToken, '1'.padStart(40, '0'));
  assert.deepEqual(
    mock.frames.filter((f) => f.kind === 'mergeTransactionReceipt').map((f) => [f.phase, f.completed]),
    [
      ['status', 2],
      ['prompt', 1],
    ]
  );
  assert.deepEqual(
    mock.frames.filter((f) => f.kind === 'mergeTransactionFinish').map((f) => f.token),
    ['2'.padStart(40, '0'), '1'.padStart(40, '0')]
  );
});

test('lost post-import journal receipt continues public suffix once without new owner or Finish', async (t) => {
  const effects = [];
  const mock = owner(t, async (input) =>
    input.kind === 'mergeTransactionBegin'
      ? { token: 'c'.repeat(40), revision: 0, directive: { phase: 'importMain', index: 0, count: 1 } }
      : undefined
  );
  await api.withRustMergeTransactionOperation(() =>
    api.withRustMergeTransactionJournal({ mode: 'status', count: 2, importMain: true }, async () => {
      effects.push('public import succeeded');
      await api.completeRustMergeTransactionPhase('importMain');
      effects.push('public model one');
      effects.push('public model two');
      await api.completeRustMergeTransactionPhase('status', 2);
      effects.push('canonical clear temps');
    })
  );
  assert.deepEqual(effects, [
    'public import succeeded',
    'public model one',
    'public model two',
    'canonical clear temps',
  ]);
  assert.deepEqual(
    mock.frames.map((f) => f.kind),
    ['mergeTransactionBegin', 'mergeTransactionReceipt']
  );
  assert.equal(mock.leases, 1);
});

test('patched transport intrinsics decline before private hooks while canonical actions run once', async (t) => {
  const mock = owner(t, () => {
    throw Error('private request forbidden');
  });
  const stringify = JSON.stringify;
  let calls = 0,
    actions = 0;
  await api.withRustMergeTransactionOperation(async () => {
    JSON.stringify = () => {
      calls++;
      throw Error('private stringify hook');
    };
    try {
      assert.equal(await api.requestRustMergeTransaction({ kind: 'mergeTest' }, () => true), undefined);
      actions++;
    } finally {
      JSON.stringify = stringify;
    }
    Object.defineProperty(Object.prototype, 'toJSON', {
      configurable: true,
      get() {
        calls++;
        throw Error('private toJSON getter');
      },
    });
    try {
      assert.equal(await api.requestRustMergeTransaction({ kind: 'mergeTest' }, () => true), undefined);
      actions++;
    } finally {
      delete Object.prototype.toJSON;
    }
  });
  assert.equal(calls, 0);
  assert.equal(actions, 2);
  assert.equal(mock.frames.length, 0);
});

test('failed retained Finish does not replace the original public callback error', async (t) => {
  const mock = owner(t, () => undefined),
    error = new Error('original post-import failure');
  let effects = 0;
  await assert.rejects(
    api.withRustMergeTransactionOperation(async () => {
      assert.equal(api.retainRustMergeTransactionToken('mergeTransactionFinish', 'f'.repeat(40)), true);
      effects++;
      throw error;
    }),
    (thrown) => thrown === error
  );
  assert.equal(effects, 1);
  assert.equal(mock.frames.length, 1);
  assert.equal(mock.disposed, 1);
  assert.equal(mock.leases, 1);
});
