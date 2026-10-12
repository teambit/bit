const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installed, source } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_MERGE_TRANSACTION_COMPILED === '1';
const policy = compiled
  ? installed('@teambit/merge-lanes/dist/rust-merge-lane-policy.js')
  : source('scopes/lanes/merge-lanes/rust-merge-lane-policy.ts');
// The selectors import Objects by package name; use its genuine defining owner in both loader modes.
const api = installed('@teambit/objects/dist/objects/rust-merge-transaction.js');
const { MergeLanesMain } = installed('@teambit/merge-lanes/dist/merge-lanes.main.runtime.js');
const { ComponentID, ComponentIdList } = installed('@teambit/component-id');
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
  const receiver = new MergeLanesMain(...Array(9).fill(undefined));
  return {
    frames,
    receiver,
    run: (mode, action) =>
      api.withRustMergeTransactionOperation(() => api.withRustMergeTransactionJournal({ mode, count: 2 }, action)),
  };
}

const id = (name, version) => ComponentID.fromString(`qualification.scope/${name}${version ? '@' + version : ''}`);
test('actual default MergeLanesMain consumes pattern, candidate and missing selections while retaining input aliases', async (t) => {
  const hash = 'a'.repeat(40);
  const f = fixture(t, (input) =>
    input.kind === 'mergePatternDependencies'
      ? { selected: [0] }
      : input.kind === 'mergeDependencyCandidates'
        ? { selected: [0], checked: [hash] }
        : { missing: [0] }
  );
  const dependency = id('dependency', hash);
  const dependencies = ComponentIdList.fromArray([dependency]);
  await f.run('lane', async () => {
    assert.deepEqual(
      await policy.tryRustMergePatternDependencies(
        f.receiver,
        ComponentIdList.fromArray([id('excluded')]),
        dependencies
      ),
      [0]
    );
    assert.deepEqual(await policy.tryRustMergeDependencyCandidates(f.receiver, id('owner'), [], dependencies), {
      selected: [0],
      checked: [hash],
    });
    assert.deepEqual(await policy.tryRustMergeDependencyMissing(f.receiver, [hash], []), [0]);
  });
  assert.equal(
    f.frames.filter((frame) => frame.kind.startsWith('mergeDependency') || frame.kind === 'mergePatternDependencies')
      .length,
    3
  );
});
test('own ID getter and uppercase snap candidate decline with no speculative getter or policy request', async (t) => {
  const f = fixture(t, () => {
    throw new Error('unexpected policy request');
  });
  let reads = 0;
  const dependency = id('dependency');
  Object.defineProperty(dependency, 'version', {
    get() {
      reads++;
      return 'a'.repeat(40);
    },
    configurable: true,
  });
  await f.run('lane', async () => {
    assert.equal(await policy.tryRustMergePatternDependencies(f.receiver, [], [dependency]), undefined);
    assert.equal(
      await policy.tryRustMergeDependencyCandidates(f.receiver, id('owner'), [], [id('dependency', 'A'.repeat(40))]),
      undefined
    );
  });
  assert.equal(reads, 0);
  assert.equal(
    f.frames.filter((frame) => frame.kind !== 'mergeTransactionBegin' && frame.kind !== 'mergeTransactionFinish')
      .length,
    0
  );
});
test('equal-valued dependency ID replacement during ACK invalidates selection before public alias consumption', async (t) => {
  const dependencies = [id('dependency')];
  const original = dependencies[0];
  const f = fixture(t, () => {
    dependencies[0] = id('dependency');
    return { selected: [0] };
  });
  await f.run('lane', async () =>
    assert.equal(await policy.tryRustMergePatternDependencies(f.receiver, [], dependencies), undefined)
  );
  assert.notStrictEqual(dependencies[0], original);
  assert.equal(f.frames.filter((frame) => frame.kind === 'mergePatternDependencies').length, 1);
});
test('late Set method mutation refuses candidate result without invoking replacement or replaying requests', async (t) => {
  const original = Set.prototype.has;
  let calls = 0;
  t.after(() => {
    Set.prototype.has = original;
  });
  const hash = 'b'.repeat(40);
  const f = fixture(t, () => {
    Set.prototype.has = function () {
      calls++;
      return true;
    };
    return { selected: [0], checked: [hash] };
  });
  await f.run('lane', async () =>
    assert.equal(
      await policy.tryRustMergeDependencyCandidates(f.receiver, id('owner'), [], [id('dependency', hash)]),
      undefined
    )
  );
  assert.equal(calls, 0);
  assert.equal(f.frames.filter((frame) => frame.kind === 'mergeDependencyCandidates').length, 1);
});
test('late Set method accessor declines without reading it or replaying candidate callback', async (t) => {
  const original = Object.getOwnPropertyDescriptor(Set.prototype, 'has');
  let reads = 0;
  t.after(() => Object.defineProperty(Set.prototype, 'has', original));
  const hash = 'c'.repeat(40);
  const f = fixture(t, () => {
    Object.defineProperty(Set.prototype, 'has', {
      configurable: true,
      get() {
        reads++;
        return original.value;
      },
    });
    return { selected: [0], checked: [hash] };
  });
  await f.run('lane', async () =>
    assert.equal(
      await policy.tryRustMergeDependencyCandidates(f.receiver, id('owner'), [], [id('dependency', hash)]),
      undefined
    )
  );
  assert.equal(reads, 0);
  assert.equal(f.frames.filter((frame) => frame.kind === 'mergeDependencyCandidates').length, 1);
});
