const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { root, source, installed } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_MERGE_STATE_COMPILED === '1';
const objectsRoot = path.dirname(installed.resolve('@teambit/objects'));
const moduleAt = (filename) =>
  compiled ? require(path.join(objectsRoot, filename + '.js')) : source('scopes/scope/objects/' + filename + '.ts');
const adapter = moduleAt('objects/rust-lane-snapshot');
const snapshot = moduleAt('objects/rust-snapshot');
const Ref = moduleAt('objects/ref').default;
const ModelComponent = moduleAt('models/model-component').default;
const Version = moduleAt('models/version').default;
const Lane = moduleAt('models/lane').default;
const { ComponentID } = installed('@teambit/component-id');
const persistence = require(
  path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-persistence.js')
);
const originalSession = persistence.withWorkspaceSession;
adapter.registerRustLaneSnapshotModels({ ModelComponent, Version, Lane });
const hash = (n) => String(n).padStart(40, '0');
function fixture({ visible = false, hidden = false, readme = false, parent = true, legacy = false } = {}) {
  const id = ComponentID.fromObject({ scope: 'qualification.policy', name: 'component' });
  const ref = new Ref(hash(1));
  const model = ModelComponent.from({
    name: 'component',
    scope: 'qualification.policy',
    versions: parent ? { '1.0.0': ref } : {},
    head: parent ? ref : undefined,
  });
  const version = new Version({
    mainFile: 'index.js',
    files: [{ name: 'index.js', relativePath: 'index.js', test: false, file: new Ref(hash(4)) }],
    parents: [],
    schema: legacy ? undefined : '1.0.0',
    log: { message: 'policy', date: '1700000000000' },
  });
  version._hash = hash(2);
  const lane = new Lane({
    name: 'dev',
    scope: 'qualification.policy',
    hash: hash(3),
    log: { date: '1700000000000' },
    components: visible ? [{ id, head: ref }] : [],
    updateDependents: hidden ? [id.changeVersion(hash(1))] : undefined,
    readmeComponent: readme ? { id, head: ref } : undefined,
  });
  return { model, version, lane, ref, previous: parent ? '1.0.0' : undefined };
}
function shape({ model, version, lane }) {
  return {
    lane: lane.toObject(),
    parents: version.parents.map((ref) => ref.toString()),
    head: model.laneHeadLocal?.toString(),
  };
}
function setup(t, responder) {
  const before = process.env.BIT_RUST_CLIENT_VCS;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  const observed = { calls: 0 };
  persistence.withWorkspaceSession = async (action) =>
    action({
      async request(build, count, validate) {
        observed.calls++;
        const frame = build(1);
        assert.equal(frame.subarray(0, 4).toString(), 'BMT1');
        const request = JSON.parse(frame.subarray(12));
        observed.request = request;
        const hidden = request.explicitHidden ?? (request.existingHidden && !request.existingVisibleHead);
        let data = {
          parent: !request.isLegacy && request.parent !== request.version ? request.parent : undefined,
          bucket: hidden ? 'hidden' : 'visible',
          overrideUpdateDependents: hidden && !request.existingHidden,
          updateReadme: request.readmeSameName,
        };
        if (request.kind === 'reconcileSnap') {
          const e = request.entry;
          const mode = e.unrelated ? 'unrelated' : e.shouldSquash ? 'squashed' : 'merge';
          let parents = request.currentParents;
          if (!request.isLegacy && mode === 'unrelated')
            parents = [typeof e.unrelated === 'object' ? e.unrelated.headOnCurrentLane : e.head];
          if (!request.isLegacy && mode === 'merge' && !parents.includes(e.head)) parents = [...parents, e.head];
          data = { mode, parents, setMergeMessage: mode !== 'unrelated' && !request.currentMessage };
          if (mode === 'unrelated')
            data.unrelated = {
              head: typeof e.unrelated === 'object' ? e.unrelated.unrelatedHead : request.previouslyUsedVersion,
              lane: typeof e.unrelated === 'object' ? e.unrelated.unrelatedLane : e.lane,
            };
          if (mode === 'squashed')
            data.squashed = { previousParents: [request.currentParents[0], e.head], lane: e.lane };
        }
        observed.valid = validate({
          version: 1,
          id: 1,
          completed: 1,
          skipped: [],
          failed: false,
          data: responder ? responder(data, request) : data,
        });
        return 1;
      },
      async dispose() {
        observed.disposed = true;
      },
    });
  t.after(() => {
    persistence.withWorkspaceSession = originalSession;
    if (before === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = before;
  });
  return observed;
}
async function apply(f, options = {}) {
  return snapshot.withRustSnapshotOperation(() =>
    adapter.addRustLaneSnapshotVersion(f.model, f.version, hash(2), f.lane, f.previous, options)
  );
}
test('lane snapshot policies preserve canonical visible/hidden buckets, parent order and readme semantics', async (t) => {
  const observed = setup(t);
  for (const visible of [false, true])
    for (const hidden of [false, true])
      for (const readme of [false, true])
        for (const explicit of [undefined, false, true]) {
          const inputs = { visible, hidden, readme };
          const canonical = fixture(inputs);
          const native = fixture(inputs);
          const options = { addToUpdateDependentsInLane: explicit };
          canonical.model.addVersion(canonical.version, hash(2), canonical.lane, canonical.previous, options);
          assert.equal(await apply(native, options), hash(2));
          assert.deepEqual(shape(native), shape(canonical));
          assert.equal(native.version.parents[0], native.ref, 'parent retains existing canonical Ref identity');
          if (native.lane.components.length) assert.equal(native.lane.components[0].head, native.model.laneHeadLocal);
        }
  assert.equal(observed.calls, 24);
});
test('first lane snapshot without a parent and legacy source decline/preserve canonical behavior', async (t) => {
  setup(t);
  for (const legacy of [false, true]) {
    const native = fixture({ parent: false, legacy });
    const canonical = fixture({ parent: false, legacy });
    canonical.model.addVersion(canonical.version, hash(2), canonical.lane, undefined);
    assert.equal(await apply(native), hash(2));
    assert.deepEqual(shape(native), shape(canonical));
  }
});
test('malformed lane policy acknowledgements leave all canonical objects untouched', async (t) => {
  let wrong;
  const observed = setup(t, (data) => ({ ...data, ...wrong }));
  for (wrong of [
    { bucket: 'other' },
    { parent: hash(999) },
    { overrideUpdateDependents: true },
    { updateReadme: true },
  ]) {
    const f = fixture();
    const before = shape(f);
    assert.equal(await apply(f), undefined);
    assert.deepEqual(shape(f), before);
    assert.ok(observed.calls > 0);
  }
});
test('in-flight mutations decline before any native policy mutations are applied', async (t) => {
  const f = fixture({ visible: true });
  setup(t, (data) => {
    f.lane.components[0].head = new Ref(hash(8));
    return data;
  });
  assert.equal(await apply(f), undefined);
  assert.equal(f.lane.components[0].head.toString(), hash(8));
  assert.deepEqual(f.version.parents, []);
  assert.equal(f.model.laneHeadLocal, undefined);
});
test('custom model and Ref hooks decline without invoking user callbacks', async (t) => {
  const observed = setup(t);
  let calls = 0;
  for (const change of [
    (f) => {
      f.model.getRef = () => {
        calls++;
        return f.ref;
      };
    },
    (f) => {
      f.ref.toString = () => {
        calls++;
        return hash(1);
      };
    },
    (f) => {
      f.lane.getComponent = () => {
        calls++;
        return undefined;
      };
    },
  ]) {
    const f = fixture({ visible: true });
    change(f);
    assert.equal(await apply(f), undefined);
  }
  assert.equal(calls, 0);
  assert.equal(observed.calls, 0);
});

const { LaneId } = installed('@teambit/lane-id');
function pending(mode, legacy = false, message = '') {
  const f = fixture({ legacy });
  f.version.parents = [f.ref];
  f.version.log.message = message;
  const entry = {
    id: { scope: 'qualification.policy', name: 'component' },
    head: new Ref(hash(5)),
    laneId: new LaneId({ scope: 'qualification.policy', name: 'other' }),
  };
  if (mode === 'squashed') entry.shouldSquash = true;
  if (mode === 'legacy-unrelated') entry.unrelated = true;
  if (mode === 'unrelated')
    entry.unrelated = {
      unrelatedHead: new Ref(hash(6)),
      headOnCurrentLane: new Ref(hash(7)),
      unrelatedLaneId: new LaneId({ scope: 'qualification.policy', name: 'abandoned' }),
    };
  return { ...f, entry };
}
async function reconcile(f, getLog = async () => ({ date: '1700000000999', message: 'squash log' })) {
  return snapshot.withRustSnapshotOperation(() =>
    adapter.reconcileRustMergeSnapshot(f.version, f.entry, hash(1), getLog)
  );
}
function canonicalPending(f, mode) {
  if (mode === 'unrelated') {
    f.version.setUnrelated({ head: f.entry.unrelated.unrelatedHead, laneId: f.entry.unrelated.unrelatedLaneId });
    f.version.addAsOnlyParent(f.entry.unrelated.headOnCurrentLane);
  } else if (mode === 'legacy-unrelated') {
    f.version.setUnrelated({ head: new Ref(hash(1)), laneId: f.entry.laneId });
    f.version.addAsOnlyParent(f.entry.head);
  } else if (mode === 'squashed') {
    f.version.setSquashed(
      { previousParents: [f.version.parents[0], f.entry.head], laneId: f.entry.laneId },
      { date: '1700000000999', message: 'squash log' }
    );
    f.version.log.message = f.version.log.message || 'merge qualification.policy/other';
  } else {
    f.version.addParent(f.entry.head);
    f.version.log.message = f.version.log.message || 'merge qualification.policy/other';
  }
}
test('pending merge reconciliation matches canonical parent/squash/unrelated metadata and log behavior', async (t) => {
  setup(t);
  for (const mode of ['merge', 'squashed', 'unrelated', 'legacy-unrelated'])
    for (const legacy of [false, true])
      for (const message of ['', 'custom message']) {
        const f = pending(mode, legacy, message),
          expected = pending(mode, legacy, message);
        canonicalPending(expected, mode);
        assert.equal(await reconcile(f), true);
        assert.deepEqual(f.version.toObject(), expected.version.toObject());
        if (!legacy && mode === 'merge') {
          assert.equal(f.version.parents[0], f.ref);
          assert.equal(f.version.parents[1], f.entry.head);
        }
        if (!legacy && mode === 'unrelated') assert.equal(f.version.parents[0], f.entry.unrelated.headOnCurrentLane);
        if (mode === 'squashed') {
          assert.equal(f.version.squashed.previousParents[0], f.ref);
          assert.equal(f.version.squashed.previousParents[1], f.entry.head);
        }
      }
});
test('pending reconciliation rejects reordered parent or wrong metadata replies without mutation', async (t) => {
  let wrong;
  setup(t, (data) => ({ ...data, ...wrong }));
  for (wrong of [
    { parents: [hash(5), hash(1)] },
    { mode: 'unrelated' },
    { setMergeMessage: false },
    { unrelated: { head: hash(1), lane: { name: 'wrong' } } },
  ]) {
    const f = pending('merge');
    const body = f.version.toBuffer().toString();
    assert.equal(await reconcile(f), false);
    assert.equal(f.version.toBuffer().toString(), body);
  }
});
test('pending entry changes while awaiting refuse reconciliation and preserve external changes', async (t) => {
  const f = pending('unrelated');
  const body = f.version.toBuffer().toString();
  setup(t, (data) => {
    f.entry.unrelated.headOnCurrentLane = new Ref(hash(8));
    return data;
  });
  assert.equal(await reconcile(f), false);
  assert.equal(f.version.toBuffer().toString(), body);
  assert.equal(f.entry.unrelated.headOnCurrentLane.toString(), hash(8));
});
test('pending custom mutation hooks decline before native requests or log callbacks', async (t) => {
  const observed = setup(t);
  let calls = 0;
  const f = pending('squashed');
  f.version.setSquashed = () => {
    calls++;
  };
  assert.equal(
    await reconcile(f, async () => {
      calls++;
      return { date: '1' };
    }),
    false
  );
  assert.equal(calls, 0);
  assert.equal(observed.calls, 0);
});

const fs = require('node:fs/promises');
const os = require('node:os');
const stateAdapter = moduleAt('objects/rust-merge-state');
const UnmergedComponents = (
  compiled
    ? require(path.join(path.dirname(installed.resolve('@teambit/legacy.scope')), 'lanes/unmerged-components.js'))
    : source('components/legacy/scope/lanes/unmerged-components.ts')
).UnmergedComponents;
stateAdapter.registerRustUnmergedComponents(UnmergedComponents);
const storeSetups = new WeakSet();
async function pendingStore(t, entries = []) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-native-pending-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const flags = { flag: process.env.BIT_RUST_CLIENT_VCS, helper: process.env.BIT_RUST_OBJECT_IMPORT };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT =
    process.env.BIT_TEST_OBJECT_IMPORT ||
    path.join(root, 'native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));
  persistence.withWorkspaceSession = originalSession;
  if (!storeSetups.has(t)) {
    storeSetups.add(t);
    t.after(() => {
      persistence.withWorkspaceSession = originalSession;
      for (const [k, v] of [
        ['BIT_RUST_CLIENT_VCS', flags.flag],
        ['BIT_RUST_OBJECT_IMPORT', flags.helper],
      ])
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
    });
  }
  return new UnmergedComponents(path.join(directory, 'unmerged.json'), entries);
}
const pendingEntry = (name, head = hash(5)) => ({
  id: { scope: 'qualification.policy', name },
  head: new Ref(head),
  laneId: new LaneId({ scope: 'qualification.policy', name: 'other' }),
  mergedConfig: { policy: { dependencies: [{ name: 'a', version: '1.0.0', force: true }] } },
  unmergedPaths: ['index.js'],
});
test('actual native pending transitions preserve ordering, alias identities and exact persisted JSON', async (t) => {
  const first = pendingEntry('first'),
    second = pendingEntry('second'),
    third = pendingEntry('third');
  const owner = await pendingStore(t, [first, second]);
  await snapshot.withRustSnapshotOperation(async () => {
    assert.equal(await stateAdapter.transitionRustUnmergedState(owner, { kind: 'add', entry: third }), true);
    assert.equal(owner.unmerged[0], first);
    assert.equal(owner.unmerged[1], second);
    assert.equal(owner.unmerged[2], third);
    assert.equal(await stateAdapter.transitionRustUnmergedState(owner, { kind: 'remove', ids: [first.id] }), true);
    assert.deepEqual(owner.unmerged, [second, third]);
    assert.equal(owner.unmerged[0], second);
    assert.equal(await stateAdapter.transitionRustUnmergedState(owner, { kind: 'remove', ids: [first.id] }), false);
    assert.equal(owner.hasChanged, true);
    if (process.platform !== 'win32') assert.equal(await stateAdapter.persistRustUnmergedState(owner), true);
    else await owner.write();
  });
  assert.equal(await fs.readFile(owner.filePath, 'utf8'), JSON.stringify(owner.toObject(), null, 2));
});
test('native duplicate additions decline and canonical fallback preserves duplicate error and original aliases', async (t) => {
  const first = pendingEntry('duplicate');
  const owner = await pendingStore(t, [first]);
  const duplicate = pendingEntry('duplicate', hash(8));
  assert.equal(
    await snapshot.withRustSnapshotOperation(() =>
      stateAdapter.transitionRustUnmergedState(owner, { kind: 'add', entry: duplicate })
    ),
    undefined
  );
  assert.throws(() => owner.addEntry(duplicate), /component with the same name already exists/);
  assert.equal(owner.unmerged[0], first);
  assert.equal(owner.hasChanged, false);
});
test('alternating pending owners reinitialize helper context without mixing state', async (t) => {
  const a = await pendingStore(t, [pendingEntry('a')]);
  const b = await pendingStore(t, [pendingEntry('b')]);
  await snapshot.withRustSnapshotOperation(async () => {
    assert.equal(await stateAdapter.transitionRustUnmergedState(a, { kind: 'add', entry: pendingEntry('a2') }), true);
    assert.equal(await stateAdapter.transitionRustUnmergedState(b, { kind: 'removeAll' }), true);
    assert.equal(
      await stateAdapter.transitionRustUnmergedState(a, {
        kind: 'remove',
        ids: [{ scope: 'qualification.policy', name: 'a' }],
      }),
      true
    );
  });
  assert.deepEqual(
    a.unmerged.map((e) => e.id.name),
    ['a2']
  );
  assert.deepEqual(b.unmerged, []);
});
test('custom pending serialization hooks and non-JSON metadata decline before callbacks', async (t) => {
  const owner = await pendingStore(t, [pendingEntry('custom')]);
  let calls = 0;
  owner.toObject = () => {
    calls++;
    return [];
  };
  assert.equal(
    await snapshot.withRustSnapshotOperation(() =>
      stateAdapter.transitionRustUnmergedState(owner, { kind: 'removeAll' })
    ),
    undefined
  );
  assert.equal(calls, 0);
  delete owner.toObject;
  owner.unmerged[0].mergedConfig.custom = () => {
    calls++;
  };
  assert.equal(
    await snapshot.withRustSnapshotOperation(() =>
      stateAdapter.transitionRustUnmergedState(owner, { kind: 'removeAll' })
    ),
    undefined
  );
  assert.equal(calls, 0);
  assert.equal(owner.unmerged.length, 1);
});

function fakeStateSession(t, response) {
  const observed = { requests: [], disposed: 0 };
  const session = {
    async request(build, count, validate) {
      const frame = build(1);
      const request = JSON.parse(frame.subarray(12));
      observed.requests.push(request);
      const ack = response(request);
      observed.accepted = validate({ version: 1, id: 1, skipped: [], ...ack });
      return ack.completed;
    },
    async dispose() {
      observed.disposed++;
    },
  };
  persistence.withWorkspaceSession = async (action) => action(session);
  t.after(() => {
    persistence.withWorkspaceSession = originalSession;
  });
  return observed;
}
test('incorrect native state selections or revisions cannot remove another pending component', async (t) => {
  const first = pendingEntry('first'),
    second = pendingEntry('second');
  const owner = await pendingStore(t, [first, second]);
  fakeStateSession(t, (request) => ({
    completed: 1,
    failed: false,
    data:
      request.kind === 'initialize'
        ? { token: hash(90), revision: 0 }
        : { token: hash(91), revision: 1, changed: true, added: false, indices: [0] },
  }));
  assert.equal(
    await snapshot.withRustSnapshotOperation(() =>
      stateAdapter.transitionRustUnmergedState(owner, { kind: 'remove', ids: [first.id] })
    ),
    undefined
  );
  assert.deepEqual(owner.unmerged, [first, second]);
  assert.equal(owner.hasChanged, false);
});
test('live pending mutation while initializing invalidates native context before transition', async (t) => {
  const first = pendingEntry('first');
  const owner = await pendingStore(t, [first]);
  const observed = fakeStateSession(t, () => {
    owner.unmerged.push(pendingEntry('external'));
    return { completed: 1, failed: false, data: { token: hash(90), revision: 0 } };
  });
  assert.equal(
    await snapshot.withRustSnapshotOperation(() =>
      stateAdapter.transitionRustUnmergedState(owner, { kind: 'removeAll' })
    ),
    undefined
  );
  assert.equal(observed.requests.length, 1);
  assert.deepEqual(
    owner.unmerged.map((e) => e.id.name),
    ['first', 'external']
  );
  assert.equal(owner.hasChanged, false);
});
test('failed native commits retire the helper before canonical write and retain exact canonical JSON', async (t) => {
  const owner = await pendingStore(t, [pendingEntry('first')]);
  owner.hasChanged = true;
  const observed = fakeStateSession(t, (request) =>
    request.kind === 'initialize'
      ? { completed: 1, failed: false, data: { token: hash(90), revision: 0 } }
      : { completed: 0, failed: true }
  );
  assert.equal(await snapshot.withRustSnapshotOperation(() => stateAdapter.persistRustUnmergedState(owner)), false);
  assert.equal(observed.disposed, 1);
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  await owner.write();
  assert.equal(await fs.readFile(owner.filePath, 'utf8'), JSON.stringify(owner.toObject(), null, 2));
  assert.equal(owner.hasChanged, true);
});
test('merge message hooks retain canonical truthy-message short circuit and synchronous ordering', async (t) => {
  setup(t);
  let calls = 0;
  for (const message of ['', 'already provided']) {
    const f = pending('merge', false, message);
    assert.equal(
      await snapshot.withRustSnapshotOperation(() =>
        adapter.reconcileRustMergeSnapshot(
          f.version,
          f.entry,
          hash(1),
          async () => ({ date: '1' }),
          () => {
            calls++;
            assert.equal(f.version.parents[1], f.entry.head);
            return 'custom merge message';
          }
        )
      ),
      true
    );
    assert.equal(f.version.log.message, message || 'custom merge message');
  }
  assert.equal(calls, 1);
});

test('bad state tokens or revisions retire native sessions and leave pending entries intact', async (t) => {
  const first = pendingEntry('first');
  const owner = await pendingStore(t, [first]);
  let wrong;
  const observed = fakeStateSession(t, (request) => ({
    completed: 1,
    failed: false,
    data:
      request.kind === 'initialize'
        ? { token: hash(90), revision: 0 }
        : { token: hash(91), revision: 1, changed: true, added: false, indices: [], ...wrong },
  }));
  for (wrong of [{ token: 'invalid' }, { revision: 7 }]) {
    assert.equal(
      await snapshot.withRustSnapshotOperation(() =>
        stateAdapter.transitionRustUnmergedState(owner, { kind: 'removeAll' })
      ),
      undefined
    );
    assert.equal(owner.unmerged[0], first);
    assert.equal(owner.hasChanged, false);
  }
  assert.equal(observed.disposed, 2);
});
test('successful native commit remains authoritative after live path changes and is not replayed', async (t) => {
  const owner = await pendingStore(t, [pendingEntry('first')]);
  const initial = owner.filePath;
  owner.hasChanged = true;
  const observed = fakeStateSession(t, (request) => {
    if (request.kind === 'initialize') return { completed: 1, failed: false, data: { token: hash(90), revision: 0 } };
    assert.equal(request.path, initial);
    owner.filePath = path.join(path.dirname(initial), 'changed', 'unmerged.json');
    return { completed: 1, failed: false, data: { saved: true } };
  });
  assert.equal(await snapshot.withRustSnapshotOperation(() => stateAdapter.persistRustUnmergedState(owner)), true);
  assert.equal(observed.requests.length, 2);
  await assert.rejects(fs.stat(owner.filePath), { code: 'ENOENT' });
});
test('pending nested metadata getters and custom lane names decline without triggering hooks', async (t) => {
  const owner = await pendingStore(t, [pendingEntry('first')]);
  let calls = 0;
  Object.defineProperty(owner.unmerged[0].mergedConfig, 'policy', {
    configurable: true,
    get() {
      calls++;
      return {};
    },
  });
  assert.equal(
    await snapshot.withRustSnapshotOperation(() =>
      stateAdapter.transitionRustUnmergedState(owner, { kind: 'removeAll' })
    ),
    undefined
  );
  assert.equal(calls, 0);
  delete owner.unmerged[0].mergedConfig.policy;
  owner.unmerged[0].laneId = Object.create(LaneId.prototype);
  Object.defineProperty(owner.unmerged[0].laneId, 'name', {
    get() {
      calls++;
      return 'custom';
    },
  });
  assert.equal(
    await snapshot.withRustSnapshotOperation(() =>
      stateAdapter.transitionRustUnmergedState(owner, { kind: 'removeAll' })
    ),
    undefined
  );
  assert.equal(calls, 0);
});

test('pending identifier projection refuses legacy scope getters without invoking them', async (t) => {
  await pendingStore(t);
  let calls = 0;
  const id = ComponentID.fromObject({ scope: 'qualification.policy', name: 'component' });
  assert.deepEqual(await snapshot.withRustSnapshotOperation(() => stateAdapter.projectRustUnmergedIds([id])), [
    { scope: 'qualification.policy', name: 'component' },
  ]);
  const legacy = { name: 'component' };
  Object.defineProperty(legacy, 'scope', {
    get() {
      calls++;
      return 'qualification.policy';
    },
  });
  const hooked = Object.create(ComponentID.prototype);
  Object.defineProperty(hooked, '_legacy', { value: legacy });
  Object.defineProperty(hooked, '_scope', { value: 'qualification.policy' });
  assert.equal(
    await snapshot.withRustSnapshotOperation(() => stateAdapter.projectRustUnmergedIds([hooked])),
    undefined
  );
  assert.equal(calls, 0);
});

test('lane policy declines custom removal lookups without invoking hooks or helper', async (t) => {
  const observed = setup(t);
  const { ExtensionDataList } = installed('@teambit/legacy.extension-data');
  const original = Object.getOwnPropertyDescriptor(ExtensionDataList.prototype, 'findCoreExtension');
  let calls = 0;
  const replacement = () => {
    calls++;
    return { config: { removed: true } };
  };
  for (const hidden of [false, true]) {
    const f = fixture({ visible: !hidden, hidden });
    const before = shape(f);
    f.version.extensions.findCoreExtension = replacement;
    assert.equal(await apply(f), undefined);
    assert.deepEqual(shape(f), before);
  }
  Object.defineProperty(ExtensionDataList.prototype, 'findCoreExtension', { ...original, value: replacement });
  try {
    const f = fixture({ visible: true });
    assert.equal(await apply(f), undefined);
  } finally {
    Object.defineProperty(ExtensionDataList.prototype, 'findCoreExtension', original);
  }
  assert.equal(calls, 0);
  assert.equal(observed.calls, 0);
});
