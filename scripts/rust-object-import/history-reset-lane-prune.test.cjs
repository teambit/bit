const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { installed, source } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_HISTORY_RESET_COMPILED === '1';
const load = (name) =>
  compiled ? installed('@teambit/snapping/dist/' + name + '.js') : source('scopes/component/snapping/' + name + '.ts');
const api = load('rust-history-reset');
const prune = load('rust-history-reset-lane-history');
const { LaneHistory } = installed('@teambit/objects');
const materializer = installed(
  path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
);
const restored = new WeakSet();
const options = { mode: 'real', pattern: false, head: false, force: true };
function fixture() {
  return new LaneHistory({
    name: 'reset',
    scope: 'qualification',
    laneHash: 'c'.repeat(40),
    history: {
      first: { log: { date: '1' }, components: ['qualification/a@' + 'a'.repeat(40)] },
      retained: { log: { date: '2' }, components: [], updateDependents: ['qualification/hidden@' + 'b'.repeat(40)] },
    },
  });
}
function fakeOwner(t, afterRequest) {
  if (!restored.has(t)) {
    restored.add(t);
    const original = materializer.acquireWorkspaceSession,
      flag = process.env.BIT_RUST_CLIENT_VCS;
    t.after(() => {
      materializer.acquireWorkspaceSession = original;
      if (flag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
      else process.env.BIT_RUST_CLIENT_VCS = flag;
    });
  }
  const frames = [];
  materializer.acquireWorkspaceSession = () => ({
    executable: '/qualification/helper',
    async release() {},
    session: {
      usable: true,
      async dispose() {
        this.usable = false;
      },
      async request(build, count, validate) {
        const id = frames.length + 1,
          input = JSON.parse(build(id).subarray(12));
        frames.push(input);
        let data;
        if (input.kind === 'historyResetBegin')
          data = { token: 'a'.repeat(40), revision: 0, directive: { phase: 'captureLane', count: 1 } };
        else if (input.kind === 'historyResetFinish') data = { finished: true };
        else {
          assert.equal(input.kind, 'historyResetLaneHistory');
          data = { remove: [0], retained: [1] };
          afterRequest?.();
        }
        const response = { version: 1, id, completed: 1, skipped: [], failed: false, data };
        assert.equal(validate(response), true);
        return response;
      },
    },
  });
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  return frames;
}

test('acknowledged native lane-history pruning deletes in place and retains untouched row identities', async (t) => {
  const frames = fakeOwner(t),
    value = fixture(),
    map = value.getHistory(),
    row = map.retained;
  await api.withRustHistoryResetOperation(options, async () => {
    assert.equal(await prune.removeRustResetLaneHistoryEntries(value, ['first', 'first', 'absent']), true);
  });
  assert.equal(value.getHistory(), map);
  assert.equal(map.retained, row);
  assert.deepEqual(Object.keys(map), ['retained']);
  assert.equal(frames.filter((frame) => frame.kind === 'historyResetLaneHistory').length, 1);
});

test('custom history/key getters, proxies and nonconfigurable rows decline before private request or traps', async (t) => {
  const frames = fakeOwner(t);
  let reads = 0;
  await api.withRustHistoryResetOperation(options, async () => {
    const value = fixture();
    Object.defineProperty(value.getHistory().first, 'ignored', {
      enumerable: true,
      get() {
        reads++;
        throw Error('get');
      },
    });
    assert.equal(await prune.removeRustResetLaneHistoryEntries(value, ['first']), false);
    const locked = fixture();
    Object.defineProperty(locked.getHistory(), 'first', { configurable: false });
    assert.equal(await prune.removeRustResetLaneHistoryEntries(locked, ['first']), false);
    const keys = ['first'];
    Object.defineProperty(keys, '0', {
      get() {
        reads++;
        throw Error('key');
      },
    });
    assert.equal(await prune.removeRustResetLaneHistoryEntries(fixture(), keys), false);
    const proxy = new Proxy(fixture(), {
      getOwnPropertyDescriptor() {
        reads++;
        throw Error('proxy');
      },
      getPrototypeOf() {
        reads++;
        throw Error('proto');
      },
    });
    assert.equal(await prune.removeRustResetLaneHistoryEntries(proxy, ['first']), false);
  });
  assert.equal(reads, 0);
  assert.equal(frames.filter((frame) => frame.kind === 'historyResetLaneHistory').length, 0);
});

test('equal-JSON replacement aliases and late body/key mutations independently decline without pruning', async (t) => {
  for (const variant of ['row', 'history-map', 'keys', 'nested-body']) {
    const value = fixture(),
      map = value.getHistory(),
      keys = ['first'];
    const frames = fakeOwner(t, () => {
      if (variant === 'row') map.first = JSON.parse(JSON.stringify(map.first));
      if (variant === 'history-map') value.history = JSON.parse(JSON.stringify(map));
      if (variant === 'keys') keys[0] = 'retained';
      if (variant === 'nested-body') map.first.components.push('qualification/new@' + 'd'.repeat(40));
    });
    await api.withRustHistoryResetOperation(options, async () => {
      assert.equal(await prune.removeRustResetLaneHistoryEntries(value, keys), false, variant);
    });
    assert.deepEqual(Object.keys(map), ['first', 'retained']);
    assert.deepEqual(Object.keys(value.getHistory()), ['first', 'retained']);
    assert.equal(frames.filter((frame) => frame.kind === 'historyResetLaneHistory').length, 1);
  }
});
