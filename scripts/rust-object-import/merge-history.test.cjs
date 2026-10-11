const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { root, source, installed } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_MERGE_HISTORY_COMPILED === '1';
const objectsRoot = path.dirname(installed.resolve('@teambit/objects'));
const adapter = compiled
  ? require(path.join(objectsRoot, 'objects/rust-merge-history.js'))
  : source('scopes/scope/objects/objects/rust-merge-history.ts');
const Ref = (
  compiled ? require(path.join(objectsRoot, 'objects/ref.js')) : source('scopes/scope/objects/objects/ref.ts')
).default;
const snapshot = compiled
  ? require(path.join(objectsRoot, 'objects/rust-snapshot.js'))
  : source('scopes/scope/objects/objects/rust-snapshot.ts');
const canonical = compiled
  ? installed('@teambit/component.snap-distance')
  : source('scopes/component/snap-distance/get-diverge-data.ts');
const persistence = require(
  path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-persistence.js')
);
const originalSession = persistence.withWorkspaceSession;
const helper =
  process.env.BIT_TEST_OBJECT_IMPORT ||
  path.join(root, 'native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));
function setup(t) {
  const previous = { flag: process.env.BIT_RUST_CLIENT_VCS, helper: process.env.BIT_RUST_OBJECT_IMPORT };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  t.after(() => {
    persistence.withWorkspaceSession = originalSession;
    for (const [key, value] of [
      ['BIT_RUST_CLIENT_VCS', previous.flag],
      ['BIT_RUST_OBJECT_IMPORT', previous.helper],
    ])
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  });
}
const hash = (index) => (index + 1).toString(16).padStart(40, '0');
function records(rows) {
  return rows.map(([id, parents, unrelated, squashed]) => ({
    hash: new Ref(hash(id)),
    parents: parents.map((index) => new Ref(hash(index))),
    unrelated: unrelated === undefined ? undefined : new Ref(hash(unrelated)),
    squashed: squashed?.map((index) => new Ref(hash(index))),
  }));
}
function project(value) {
  return {
    sourceOnly: value.snapsOnSourceOnly.map((ref) => ref.toString()),
    targetOnly: value.snapsOnTargetOnly.map((ref) => ref.toString()),
    common: value.commonSnapBeforeDiverge?.toString(),
    noCommon: Boolean(value.err),
  };
}
async function parity(rows, sourceId, targetId, unrelated = false) {
  const versions = records(rows);
  const sourceHead = new Ref(hash(sourceId));
  const targetHead = new Ref(hash(targetId));
  const expected = canonical.getDivergeDataBetweenTwoSnaps(
    'qualification/graph',
    versions,
    sourceHead,
    targetHead,
    unrelated ? { unrelated: {}, head: sourceHead } : undefined,
    false
  );
  const actual = await snapshot.withRustSnapshotOperation(() =>
    adapter.getRustDivergence(versions, sourceHead, targetHead, unrelated)
  );
  assert.ok(actual, 'eligible divergence must actually produce a native response');
  assert.deepEqual({ ...actual, common: actual.common }, project(expected));
}

test('native divergence preserves canonical ordering across randomized DAGs and record insertion orders', async (t) => {
  setup(t);
  for (let seed = 1; seed <= 48; seed++) {
    let state = seed;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 2 ** 32;
    };
    const rows = [];
    for (let node = 0; node < 18; node++) {
      const parents = node ? [Math.floor(random() * node)] : [];
      if (node > 2 && random() < 0.6) {
        const second = Math.floor(random() * node);
        if (!parents.includes(second)) parents.push(second);
      }
      rows.push([
        node,
        parents,
        random() < 0.2 && node > 1 ? Math.floor(random() * node) : undefined,
        random() < 0.2 && node > 1 ? [Math.floor(random() * node)] : undefined,
      ]);
    }
    for (let index = rows.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [rows[index], rows[other]] = [rows[other], rows[index]];
    }
    await parity(rows, 16, 17);
  }
});

test('squashed, unrelated, disconnected and cyclic histories match canonical graph semantics', async (t) => {
  setup(t);
  for (const [rows, a, b, unrelated] of [
    [
      [
        [0, []],
        [1, [0]],
        [2, [0]],
        [3, [1, 2]],
        [4, [2, 1]],
      ],
      3,
      4,
      false,
    ],
    [
      [
        [0, []],
        [1, [], undefined, [0]],
        [2, [0]],
      ],
      1,
      2,
      false,
    ],
    [
      [
        [0, []],
        [1, [], 0],
        [2, [0]],
      ],
      1,
      2,
      false,
    ],
    [
      [
        [0, []],
        [1, []],
      ],
      0,
      1,
      false,
    ],
    [
      [
        [0, []],
        [1, []],
      ],
      0,
      1,
      true,
    ],
    [
      [
        [0, [1]],
        [1, [0]],
        [2, [0]],
      ],
      0,
      2,
      false,
    ],
  ])
    await parity(rows, a, b, unrelated);
});

test('custom Ref methods and record accessors decline before invoking hooks', async (t) => {
  setup(t);
  let calls = 0;
  const versions = records([
    [0, []],
    [1, [0]],
  ]);
  versions[0].hash.toString = () => {
    calls++;
    return hash(0);
  };
  assert.equal(
    await snapshot.withRustSnapshotOperation(() =>
      adapter.getRustDivergence(versions, new Ref(hash(1)), new Ref(hash(0)), false)
    ),
    undefined
  );
  assert.equal(calls, 0);
  const own = records([
    [0, []],
    [1, [0]],
  ]);
  Object.defineProperty(own[0], 'parents', {
    get() {
      calls++;
      return [];
    },
  });
  assert.equal(
    await snapshot.withRustSnapshotOperation(() =>
      adapter.getRustDivergence(own, new Ref(hash(1)), new Ref(hash(0)), false)
    ),
    undefined
  );
  assert.equal(calls, 0);
});

function mock(response, onRequest = () => {}) {
  const observed = { calls: 0, disposed: 0 };
  persistence.withWorkspaceSession = async (action) =>
    action({
      async request(build, count, validate) {
        observed.calls++;
        assert.equal(build(1).subarray(0, 4).toString(), 'BMH1');
        onRequest();
        observed.accepted = validate({ version: 1, id: 1, skipped: [], completed: 1, failed: false, data: response });
        return 1;
      },
      async dispose() {
        observed.disposed++;
      },
    });
  return observed;
}

test('stale history mutations decline native divergence after awaiting the helper', async (t) => {
  setup(t);
  const versions = records([
    [0, []],
    [1, [0]],
  ]);
  const observed = mock(
    { sourceOnly: [hash(1)], targetOnly: [], common: hash(0), noCommon: false },
    () => (versions[1].parents = [])
  );
  assert.equal(
    await snapshot.withRustSnapshotOperation(() =>
      adapter.getRustDivergence(versions, new Ref(hash(1)), new Ref(hash(0)), false)
    ),
    undefined
  );
  assert.equal(observed.calls, 1);
});

test('malformed and invented native graph identities decline without exposing untrusted results', async (t) => {
  setup(t);
  for (const result of [
    { sourceOnly: ['bad'], targetOnly: [], noCommon: false },
    { sourceOnly: [hash(88)], targetOnly: [], common: hash(0), noCommon: false },
    { sourceOnly: [hash(1), hash(1)], targetOnly: [], common: hash(0), noCommon: false },
    { sourceOnly: [hash(1)], targetOnly: [], common: hash(0), noCommon: true },
  ]) {
    mock(result);
    assert.equal(
      await snapshot.withRustSnapshotOperation(() =>
        adapter.getRustDivergence(
          records([
            [0, []],
            [1, [0]],
          ]),
          new Ref(hash(1)),
          new Ref(hash(0)),
          false
        )
      ),
      undefined
    );
  }
});

const fs = require('node:fs/promises');
const os = require('node:os');
const { createMergeFixture } = require('./merge-history-fixture.cjs');
const Repository = (
  compiled
    ? require(path.join(objectsRoot, 'objects/repository.js'))
    : source('scopes/scope/objects/objects/repository.ts')
).default;
const Version = (
  compiled ? require(path.join(objectsRoot, 'models/version.js')) : source('scopes/scope/objects/models/version.ts')
).default;
const VersionHistory = (
  compiled
    ? require(path.join(objectsRoot, 'models/version-history.js'))
    : source('scopes/scope/objects/models/version-history.ts')
).default;
async function diskGraph(t) {
  setup(t);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-native-history-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const fixture = await createMergeFixture(process.env.BIT_LEGACY_ROOT, directory);
  const head = await fixture.publishRemoteSibling();
  const scopeJson = JSON.parse(await fs.readFile(path.join(directory, 'scope.json'), 'utf8'));
  const repo = new Repository(directory, scopeJson);
  // The source loader deliberately uses an independent model namespace. Match the
  // parser namespace to the source repository for this isolated adapter test.
  const types = installed('@teambit/legacy.scope').typesObj;
  const previous = types.Version;
  types.Version = Version;
  t.after(() => {
    types.Version = previous;
  });
  const history = new VersionHistory({ name: 'component', scope: 'qualification.merge', versions: [] });
  return { directory, fixture, head: new Ref(head), repo, history };
}
test('native graph loads a cold stored history in canonical DFS order and retains existing record identities', async (t) => {
  const { fixture, head, repo, history } = await diskGraph(t);
  const added = await snapshot.withRustSnapshotOperation(() => adapter.loadRustVersionParents(repo, history, head));
  assert.ok(added, 'cold stored graph must actually execute natively');
  assert.deepEqual(
    added.map((row) => row.hash.toString()),
    [head.toString(), fixture.baseRef]
  );
  assert.equal(added[0].parents[0].toString(), fixture.baseRef);
  history.addFromVersionParents(added);
  const first = history.versions[0];
  const parent = first.parents[0];
  const more = await snapshot.withRustSnapshotOperation(() => adapter.loadRustVersionParents(repo, history, head));
  assert.deepEqual(more, []);
  assert.equal(history.versions[0], first);
  assert.equal(history.versions[0].parents[0], parent);
});
test('cached Version parents reuse canonical Ref instances; mutated live parents force fallback', async (t) => {
  const { head, repo, history } = await diskGraph(t);
  const cached = await repo.load(head);
  const added = await snapshot.withRustSnapshotOperation(() => adapter.loadRustVersionParents(repo, history, head));
  assert.ok(added);
  assert.equal(added[0].parents, cached.parents);
  assert.equal(added[0].parents[0], cached.parents[0]);
  cached.parents = [new Ref(hash(900))];
  assert.equal(
    await snapshot.withRustSnapshotOperation(() => adapter.loadRustVersionParents(repo, history, head)),
    undefined
  );
  assert.deepEqual(history.versions, []);
});
test('missing and corrupt stored Versions decline without partially changing history', async (t) => {
  const { directory, fixture, head, repo, history } = await diskGraph(t);
  const target = path.join(directory, 'objects', fixture.baseRef.slice(0, 2), fixture.baseRef.slice(2));
  const bytes = await fs.readFile(target);
  for (const replacement of [undefined, Buffer.from('corrupt object')]) {
    if (replacement) await fs.writeFile(target, replacement);
    else await fs.rm(target);
    assert.equal(
      await snapshot.withRustSnapshotOperation(() => adapter.loadRustVersionParents(repo, history, head)),
      undefined
    );
    assert.deepEqual(history.versions, []);
    await fs.writeFile(target, bytes);
  }
  const parse = Version.parse;
  Version.parse = () => {
    throw Error('custom parser must not be called');
  };
  try {
    assert.equal(
      await snapshot.withRustSnapshotOperation(() => adapter.loadRustVersionParents(repo, history, head)),
      undefined
    );
  } finally {
    Version.parse = parse;
  }
});

test('graph acknowledgements reject missing ancestors, duplicates and unreachable additions', async (t) => {
  const { fixture, head, repo, history } = await diskGraph(t);
  const top = { hash: head.toString(), parents: [fixture.baseRef] };
  const base = { hash: fixture.baseRef, parents: [] };
  for (const added of [[top], [base, top], [top, base, base], [top, base, { hash: hash(999), parents: [] }]]) {
    const observed = mock({ added });
    assert.equal(
      await snapshot.withRustSnapshotOperation(() => adapter.loadRustVersionParents(repo, history, head)),
      undefined
    );
    assert.equal(observed.calls, 1);
    assert.equal(observed.accepted, false);
    assert.deepEqual(history.versions, []);
  }
});
test('in-flight custom repository replacement and pending live Versions decline the graph', async (t) => {
  const { fixture, head, repo, history } = await diskGraph(t);
  const original = repo.load;
  mock(
    {
      added: [
        { hash: head.toString(), parents: [fixture.baseRef] },
        { hash: fixture.baseRef, parents: [] },
      ],
    },
    () => {
      repo.load = () => {
        throw Error('custom loader');
      };
    }
  );
  assert.equal(
    await snapshot.withRustSnapshotOperation(() => adapter.loadRustVersionParents(repo, history, head)),
    undefined
  );
  repo.load = original;
  persistence.withWorkspaceSession = originalSession;
  const version = await repo.load(head);
  repo.add(version);
  assert.equal(
    await snapshot.withRustSnapshotOperation(() => adapter.loadRustVersionParents(repo, history, head)),
    undefined
  );
  assert.deepEqual(history.versions, []);
});

test('custom static Ref construction declines graph and divergence without calling the factory', async (t) => {
  const { head, repo, history } = await diskGraph(t);
  const previous = Ref.from;
  let calls = 0;
  Ref.from = () => {
    calls++;
    throw Error('custom ref factory');
  };
  try {
    assert.equal(
      await snapshot.withRustSnapshotOperation(() => adapter.loadRustVersionParents(repo, history, head)),
      undefined
    );
    assert.equal(
      await snapshot.withRustSnapshotOperation(() =>
        adapter.getRustDivergence(
          records([
            [0, []],
            [1, [0]],
          ]),
          new Ref(hash(1)),
          new Ref(hash(0)),
          false
        )
      ),
      undefined
    );
    assert.equal(calls, 0);
  } finally {
    Ref.from = previous;
  }
});
