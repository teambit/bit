const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { source, installed } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_SQUASH_HISTORY_COMPILED === '1';
const objectsRoot = path.dirname(installed.resolve('@teambit/objects'));
const at = (name) =>
  compiled ? require(path.join(objectsRoot, name + '.js')) : source('scopes/scope/objects/' + name + '.ts');
const adapter = at('objects/rust-squash-history');
const snapshot = at('objects/rust-snapshot');
const Ref = at('objects/ref').default;
const Version = at('models/version').default;
const ModelComponent = at('models/model-component').default;
const VersionHistory = at('models/version-history').default;
const { SnapsDistance } = installed('@teambit/component.snap-distance');
const persistence = require(
  path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-persistence.js')
);
const actualSession = persistence.withWorkspaceSession;
adapter.registerRustSquashModels({ Version, ModelComponent, VersionHistory });
const ref = (n) => new Ref(String(n).padStart(40, '0'));
function version(n, parents = []) {
  const value = new Version({
    mainFile: 'index.js',
    files: [{ name: 'index.js', relativePath: 'index.js', test: false, file: ref(99) }],
    parents,
    schema: '1.0.0',
    log: { message: 'test', date: '1700000000000' },
  });
  value._hash = ref(n).hash;
  return value;
}
function setup(t, respond) {
  const original = persistence.withWorkspaceSession;
  const flag = process.env.BIT_RUST_CLIENT_VCS;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  const calls = [];
  persistence.withWorkspaceSession = async (action) =>
    action({
      async request(build, count, validate) {
        const frame = build(1);
        assert.equal(frame.subarray(0, 4).toString(), 'BMT1');
        const input = JSON.parse(frame.subarray(12));
        calls.push(input);
        const response = respond(input);
        calls.valid = validate({ version: 1, id: 1, completed: 1, skipped: [], failed: false, data: response });
        return 1;
      },
      async dispose() {
        calls.disposed = true;
      },
    });
  t.after(() => {
    persistence.withWorkspaceSession = original;
    if (flag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = flag;
  });
  return calls;
}
test('single incoming snap with any sole parent skips rewrite; detached divergence still rewrites', async (t) => {
  const v = version(5, [ref(77)]);
  const calls = setup(t, (input) =>
    input.targetOnly.length === 1 && !input.sourceOnly.length
      ? { action: 'skip' }
      : { action: 'rewrite', parentChoice: 'common', parents: [ref(1).hash], previousParents: [ref(77).hash] }
  );
  await snapshot.withRustSnapshotOperation(async () => {
    assert.deepEqual(await adapter.planRustSquash(new SnapsDistance([], [ref(5)], ref(1)), true, false, v), {
      action: 'skip',
    });
    assert.deepEqual(
      await adapter.planRustSquash(new SnapsDistance([ref(6)], [ref(5), ref(4)], ref(1)), true, true, v),
      { action: 'rewrite', parentChoice: 'common', parents: [ref(1).hash], previousParents: [ref(77).hash] }
    );
  });
  assert.equal(calls.length, 2);
  assert.equal(v.parents[0].hash, ref(77).hash);
});
test('history rebase updates only first existing incoming record and preserves aliases and dirty state', async (t) => {
  const model = ModelComponent.from({ name: 'component', scope: 'qualification.squash', versions: {} });
  const first = { hash: ref(2), parents: [ref(1)] };
  const second = { hash: ref(3), parents: [ref(2)] };
  const history = new VersionHistory({ name: 'component', scope: 'qualification.squash', versions: [first, second] });
  const incoming = [version(9), version(2, [ref(7)]), version(3, [ref(8)])];
  incoming[1].unrelated = { head: ref(6), laneId: {} };
  incoming[1].squashed = { previousParents: [ref(4)], laneId: {} };
  const calls = setup(t, () => ({ incomingIndex: 1, existingIndex: 0 }));
  assert.equal(
    await snapshot.withRustSnapshotOperation(() => adapter.rebaseRustVersionHistory(model, history, incoming)),
    true
  );
  assert.equal(calls.valid, true);
  assert.equal(history.versions[0], first);
  assert.equal(history.versions[1], second);
  assert.equal(first.parents, incoming[1].parents);
  assert.equal(first.unrelated, incoming[1].unrelated.head);
  assert.equal(first.squashed, incoming[1].squashed.previousParents);
  assert.equal(second.parents[0].hash, ref(2).hash);
  assert.equal(history.hasChanged, false);
});
test('wrong first-match acknowledgement and in-flight ancestry changes decline without mutation', async (t) => {
  const model = ModelComponent.from({ name: 'component', scope: 'qualification.squash', versions: {} });
  const record = { hash: ref(2), parents: [ref(1)] };
  const history = new VersionHistory({ name: 'component', scope: 'qualification.squash', versions: [record] });
  const originalParents = record.parents;
  const incoming = [version(2, [ref(7)]), version(2, [ref(8)])];
  const calls = setup(t, () => ({ incomingIndex: 1, existingIndex: 0 }));
  assert.equal(
    await snapshot.withRustSnapshotOperation(() => adapter.rebaseRustVersionHistory(model, history, incoming)),
    undefined
  );
  assert.equal(calls.valid, false);
  assert.equal(calls.disposed, true);
  assert.equal(record.parents, originalParents);
});

const UnmergedComponents = (
  compiled
    ? require(path.join(path.dirname(installed.resolve('@teambit/legacy.scope')), 'lanes/unmerged-components.js'))
    : source('components/legacy/scope/lanes/unmerged-components.ts')
).UnmergedComponents;
test('public clear-all always replaces array and marks empty owners dirty', async (t) => {
  const oldFlag = process.env.BIT_RUST_CLIENT_VCS;
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  t.after(() => {
    if (oldFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = oldFlag;
  });
  for (const entries of [[], [{ id: { scope: 'qualification.squash', name: 'component' }, head: ref(2) }]]) {
    const owner = new UnmergedComponents('/unused-disposable-unit-path', entries);
    await owner.removeAllComponentsNative();
    assert.notEqual(owner.getComponents(), entries);
    assert.deepEqual(owner.getComponents(), []);
    assert.equal(owner.hasChanged, true);
    assert.equal(entries.length, entries[0] ? 1 : 0);
  }
});
test('custom clear-all hook runs once through canonical fallback without opening helper', async (t) => {
  const calls = setup(t, () => {
    throw new Error('custom owner must not enter helper');
  });
  const entries = [{ id: { scope: 'qualification.squash', name: 'component' }, head: ref(2) }];
  const owner = new UnmergedComponents('/unused-disposable-unit-path', entries);
  let customCalls = 0;
  owner.removeAllComponents = function () {
    customCalls++;
    this.unmerged = [];
    this.hasChanged = true;
  };
  await snapshot.withRustSnapshotOperation(() => owner.removeAllComponentsNative());
  assert.equal(customCalls, 1);
  assert.equal(calls.length, 0);
  assert.equal(owner.hasChanged, true);
  assert.equal(entries.length, 1);
});

test('history misses return false without touching dictionary, records or hasChanged', async (t) => {
  const model = ModelComponent.from({ name: 'component', scope: 'qualification.squash', versions: {} });
  const record = { hash: ref(1), parents: [] };
  const history = new VersionHistory({ name: 'component', scope: 'qualification.squash', versions: [record] });
  history.hasChanged = true;
  const dictionary = history.versionsObj;
  const parents = record.parents;
  const calls = setup(t, () => ({}));
  assert.equal(
    await snapshot.withRustSnapshotOperation(() =>
      adapter.rebaseRustVersionHistory(model, history, [version(7), version(8)])
    ),
    false
  );
  assert.equal(calls.valid, true);
  assert.equal(history.versionsObj, dictionary);
  assert.equal(history.versions[0], record);
  assert.equal(record.parents, parents);
  assert.equal(history.hasChanged, true);
});

test('mutated record hash declines before helper while canonical lookup retains original dictionary key', async (t) => {
  const model = ModelComponent.from({ name: 'component', scope: 'qualification.squash', versions: {} });
  const record = { hash: ref(1), parents: [] };
  const history = new VersionHistory({ name: 'component', scope: 'qualification.squash', versions: [record] });
  record.hash = ref(9);
  const incoming = version(1, [ref(2)]);
  const calls = setup(t, () => {
    throw Error('mismatched cache key must decline');
  });
  assert.equal(
    await snapshot.withRustSnapshotOperation(() => adapter.rebaseRustVersionHistory(model, history, [incoming])),
    undefined
  );
  assert.equal(calls.length, 0);
  assert.equal(history.getVersionData(ref(1)), record);
  history.addFromVersionsObjects([incoming]);
  assert.equal(record.parents, incoming.parents);
  assert.equal(history.versions[0], record);
});
test('in-flight parent replacement invalidates history result without overwriting concurrent change', async (t) => {
  const model = ModelComponent.from({ name: 'component', scope: 'qualification.squash', versions: {} });
  const record = { hash: ref(1), parents: [] };
  const history = new VersionHistory({ name: 'component', scope: 'qualification.squash', versions: [record] });
  const incoming = version(1, [ref(2)]);
  const concurrent = [ref(3)];
  setup(t, () => {
    incoming.parents = concurrent;
    return { incomingIndex: 0, existingIndex: 0 };
  });
  assert.equal(
    await snapshot.withRustSnapshotOperation(() => adapter.rebaseRustVersionHistory(model, history, [incoming])),
    undefined
  );
  assert.equal(incoming.parents, concurrent);
  assert.deepEqual(record.parents, []);
});
test('custom Version hash hook declines before evaluating hook or requesting plan', async (t) => {
  const model = ModelComponent.from({ name: 'component', scope: 'qualification.squash', versions: {} });
  const history = new VersionHistory({ name: 'component', scope: 'qualification.squash', versions: [] });
  const incoming = version(1);
  let hooks = 0;
  incoming.hash = () => {
    hooks++;
    return ref(1);
  };
  const calls = setup(t, () => {
    throw Error('unexpected helper');
  });
  assert.equal(
    await snapshot.withRustSnapshotOperation(() => adapter.rebaseRustVersionHistory(model, history, [incoming])),
    undefined
  );
  assert.equal(hooks, 0);
  assert.equal(calls.length, 0);
});

const fs = require('node:fs/promises');
const os = require('node:os');
const Repository = at('objects/repository').default;
adapter.registerRustSquashRepository(Repository, at('objects/object').default);
async function diskMessages(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-squash-messages-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const fixture = await require('./merge-history-fixture.cjs').createMergeFixture(
    process.env.BIT_LEGACY_ROOT,
    directory
  );
  const head = await fixture.publishRemoteSibling();
  const repo = new Repository(directory, JSON.parse(await fs.readFile(path.join(directory, 'scope.json'), 'utf8')));
  const types = installed('@teambit/legacy.scope').typesObj;
  const previous = types.Version;
  types.Version = Version;
  t.after(() => {
    types.Version = previous;
  });
  return { repo, refs: [new Ref(fixture.baseRef), new Ref(head)] };
}
test('remote messages preserve ref ordering, null and multiline text without canonical body loads', async (t) => {
  const { repo, refs } = await diskMessages(t);
  const calls = setup(t, (input) => {
    assert.deepEqual(
      input.refs,
      refs.map((r) => r.hash)
    );
    return { messages: [null, 'line one\nline two'] };
  });
  const result = await snapshot.withRustSnapshotOperation(() => adapter.readRustSquashMessages(repo, refs));
  assert.deepEqual(result, [null, 'line one\nline two']);
  assert.equal(calls.length, 1);
  assert.equal(repo.getCache(refs[0]), undefined);
  assert.equal(repo.getCache(refs[1]), undefined);
});
test('cached remote Version message mismatch declines and preserves canonical cache identity', async (t) => {
  const { repo, refs } = await diskMessages(t);
  const cached = await repo.load(refs[0]);
  cached.log.message = 'locally changed cached log';
  const calls = setup(t, () => ({ messages: ['disk log', 'other log'] }));
  assert.equal(await snapshot.withRustSnapshotOperation(() => adapter.readRustSquashMessages(repo, refs)), undefined);
  assert.equal(calls.length, 1);
  assert.equal(repo.getCache(refs[0]), cached);
  assert.equal(cached.log.message, 'locally changed cached log');
});

function native(t, helper) {
  const previous = { flag: process.env.BIT_RUST_CLIENT_VCS, helper: process.env.BIT_RUST_OBJECT_IMPORT };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT =
    helper ||
    process.env.BIT_TEST_OBJECT_IMPORT ||
    path.resolve(
      __dirname,
      '../../native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : '')
    );
  persistence.withWorkspaceSession = actualSession;
  t.after(() => {
    for (const [key, value] of [
      ['BIT_RUST_CLIENT_VCS', previous.flag],
      ['BIT_RUST_OBJECT_IMPORT', previous.helper],
    ])
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  });
}
test('actual native reader accepts fresh disk messages in repeated ref order without loading bodies into cache', async (t) => {
  const { repo, refs } = await diskMessages(t);
  native(t);
  const ordered = [refs[1], refs[0], refs[1]];
  const result = await snapshot.withRustSnapshotOperation(() => adapter.readRustSquashMessages(repo, ordered));
  assert.deepEqual(result, ['merge fixture 1.0.1', 'merge fixture 1.0.0', 'merge fixture 1.0.1']);
  for (const r of refs) assert.equal(repo.getCache(r), undefined);
});
test('actual corrupt and missing remote messages decline whole batch before canonical typed load failure', async (t) => {
  const { repo, refs } = await diskMessages(t);
  native(t);
  const filename = repo.objectPath(refs[1]);
  await fs.writeFile(filename, Buffer.from('invalid compressed object'));
  assert.equal(await snapshot.withRustSnapshotOperation(() => adapter.readRustSquashMessages(repo, refs)), undefined);
  await assert.rejects(() => repo.load(refs[1]));
  await fs.rm(filename);
  assert.equal(await snapshot.withRustSnapshotOperation(() => adapter.readRustSquashMessages(repo, refs)), undefined);
  await assert.rejects(
    () => repo.load(refs[1], true),
    (error) => error.message.includes(filename)
  );
  assert.equal(repo.getCache(refs[0]), undefined);
});
test('missing helper declines messages and permits canonical cached load after session disposal', async (t) => {
  const { repo, refs } = await diskMessages(t);
  native(t, path.join(os.tmpdir(), 'bit-qualification-absent-helper'));
  assert.equal(await snapshot.withRustSnapshotOperation(() => adapter.readRustSquashMessages(repo, refs)), undefined);
  const result = await Promise.all(refs.map((r) => repo.load(r)));
  assert.deepEqual(
    result.map((v) => v.log.message),
    ['merge fixture 1.0.0', 'merge fixture 1.0.1']
  );
});

function privateSquash() {
  const Module = require('node:module');
  const fsSync = require('node:fs');
  const filename = compiled
    ? path.join(
        path.join(process.env.BIT_LEGACY_ROOT, 'node_modules/@teambit/merge-lanes/dist'),
        'merge-lanes.main.runtime.js'
      )
    : path.resolve(__dirname, '../../scopes/lanes/merge-lanes/merge-lanes.main.runtime.ts');
  let code = fsSync.readFileSync(filename, 'utf8');
  if (!compiled)
    code = installed('typescript').transpileModule(code, {
      compilerOptions: {
        target: installed('typescript').ScriptTarget.ES2022,
        module: installed('typescript').ModuleKind.CommonJS,
        esModuleInterop: true,
      },
      fileName: filename,
    }).outputText;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = [
    ...Module._nodeModulePaths(process.env.BIT_LEGACY_ROOT),
    ...Module._nodeModulePaths(path.dirname(filename)),
  ];
  loaded._compile(code + '\nmodule.exports.__squashOneComp=squashOneComp;\n', filename);
  return loaded.exports.__squashOneComp;
}
test('canonical and native fallback preserve parent rewrite before import failure and original parents alias', async (t) => {
  const squash = privateSquash();
  const operation = require(path.join(objectsRoot, 'objects/rust-snapshot.js'));
  const { ComponentID } = installed('@teambit/component-id');
  const { LaneId } = installed('@teambit/lane-id');
  const flag = process.env.BIT_RUST_CLIENT_VCS;
  native(t);
  t.after(() => {
    if (flag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = flag;
  });
  for (const mode of ['off', 'on']) {
    process.env.BIT_RUST_CLIENT_VCS = mode;
    const v = version(5, [ref(4), ref(3)]),
      alias = v.parents,
      common = ref(1);
    const failure = new Error('isolated remote importer failure');
    const scope = {
      scopeImporter: {
        async importManyObjects() {
          throw failure;
        },
      },
      objects: {
        async load() {
          throw Error('must not load after importer fails');
        },
      },
    };
    await assert.rejects(
      () =>
        operation.withRustSnapshotOperation(() =>
          squash(
            'main',
            new LaneId({ scope: 'qualification.squash', name: 'other' }),
            ComponentID.fromObject({ scope: 'qualification.squash', name: 'component' }),
            new SnapsDistance([], [ref(5), ref(4)], common),
            { message: 'squash', date: '1700000000000' },
            scope,
            v,
            { messageTitle: 'title' }
          )
        ),
      (error) => error === failure
    );
    assert.equal(v.parents[0], common);
    assert.deepEqual(
      alias.map((r) => r.hash),
      [ref(4).hash, ref(3).hash]
    );
    assert.equal(v.squashed, undefined);
    assert.equal(v.log.message, 'test');
  }
});

test('actual native squash policy matches canonical operation across main/lane, ancestry, legacy and detached cases', async (t) => {
  const squash = privateSquash();
  const { ComponentID } = installed('@teambit/component-id');
  const { LaneId } = installed('@teambit/lane-id');
  native(t);
  const id = ComponentID.fromObject({ scope: 'qualification.squash', name: 'component' });
  const other = new LaneId({ scope: 'qualification.squash', name: 'other' });
  for (const lane of ['main', 'destination'])
    for (const legacy of [false, true])
      for (const ancestry of ['common', 'mainHead', 'empty', 'equal', 'sourceAhead', 'diverged']) {
        const make = () => {
          const v = version(5, [ref(4), ref(3)]);
          if (legacy) v.schema = undefined;
          return v;
        };
        const distance = new SnapsDistance(
          ancestry === 'sourceAhead' || ancestry === 'diverged' ? [ref(6)] : [],
          ancestry === 'equal' || ancestry === 'sourceAhead' ? [] : [ref(5), ref(4)],
          ancestry === 'common' || ancestry === 'diverged' ? ref(1) : undefined
        );
        const mainHead = ancestry === 'mainHead' ? ref(9) : undefined;
        const canonical = make();
        process.env.BIT_RUST_CLIENT_VCS = 'off';
        const result = await squash(
          lane,
          other,
          id,
          distance,
          { message: 'squash', date: '1700000000000' },
          {
            async getModelComponentIfExist() {
              return { head: mainHead };
            },
          },
          canonical,
          { detachHead: ancestry === 'diverged' }
        );
        process.env.BIT_RUST_CLIENT_VCS = 'on';
        const v = make();
        const plan = await snapshot.withRustSnapshotOperation(() =>
          adapter.planRustSquash(distance, lane === 'main', ancestry === 'diverged', v, true, mainHead)
        );
        assert.ok(plan, `${lane}/${legacy}/${ancestry} must execute actual helper`);
        if (!result) assert.equal(plan.action, 'skip');
        else {
          assert.equal(plan.action, 'rewrite');
          assert.deepEqual(
            plan.parents,
            canonical.parents.map((r) => r.hash)
          );
          assert.deepEqual(
            plan.previousParents,
            v.parents.map((r) => r.hash)
          );
        }
      }
});

test('Ref and distance prototype hooks installed before adapter reload decline without speculative calls', async (t) => {
  const calls = setup(t, () => {
    throw Error('must not request');
  });
  const adapterFile = compiled
    ? path.join(objectsRoot, 'objects/rust-squash-history.js')
    : path.resolve(__dirname, '../../scopes/scope/objects/objects/rust-squash-history.ts');
  let hooks = 0;
  for (const [owner, key] of [
    [Ref.prototype, 'toString'],
    [Ref.prototype, 'isEqual'],
    [Ref, 'from'],
    [SnapsDistance.prototype, 'isDiverged'],
  ]) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, key);
    Object.defineProperty(owner, key, {
      configurable: true,
      writable: true,
      value() {
        hooks++;
        throw Error('hook');
      },
    });
    try {
      delete require.cache[adapterFile];
      const fresh = require(adapterFile);
      fresh.registerRustSquashModels({ Version, ModelComponent, VersionHistory });
      const v = version(5, [ref(4), ref(3)]);
      assert.equal(
        await snapshot.withRustSnapshotOperation(() =>
          fresh.planRustSquash(new SnapsDistance([], [ref(5), ref(4)], ref(1)), true, false, v)
        ),
        undefined
      );
    } finally {
      Object.defineProperty(owner, key, descriptor);
      delete require.cache[adapterFile];
    }
  }
  assert.equal(hooks, 0);
  assert.equal(calls.length, 0);
});
test('pending-object getters and custom cache/live hooks decline before any getter or helper invocation', async (t) => {
  const { repo, refs } = await diskMessages(t);
  const calls = setup(t, () => {
    throw Error('must not request');
  });
  let hooks = 0;
  Object.defineProperty(repo.objects, refs[0].hash, {
    configurable: true,
    get() {
      hooks++;
      throw Error('pending getter');
    },
  });
  assert.equal(await snapshot.withRustSnapshotOperation(() => adapter.readRustSquashMessages(repo, refs)), undefined);
  delete repo.objects[refs[0].hash];
  for (const owner of [repo.cache, repo.liveObjects]) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, 'get');
    Object.defineProperty(owner, 'get', {
      configurable: true,
      value() {
        hooks++;
        throw Error('cache hook');
      },
    });
    try {
      assert.equal(
        await snapshot.withRustSnapshotOperation(() => adapter.readRustSquashMessages(repo, refs)),
        undefined
      );
    } finally {
      if (descriptor) Object.defineProperty(owner, 'get', descriptor);
      else delete owner.get;
    }
  }
  assert.equal(hooks, 0);
  assert.equal(calls.length, 0);
});

test(
  'installed public clear-all uses native initialize/transition/commit once and closes helper',
  {
    skip:
      process.platform === 'win32' ||
      (!compiled &&
        'mixed source/installed constructor registration; compiled public-operation lane proves native lifecycle'),
  },
  async (t) => {
    const cp = require('node:child_process');
    const { UnmergedComponents: PublicOwner } = require(
      path.join(path.dirname(installed.resolve('@teambit/legacy.scope')), 'lanes/unmerged-components.js')
    );
    const publicSnapshot = require(path.join(objectsRoot, 'objects/rust-snapshot.js'));
    const PublicRef = require(path.join(objectsRoot, 'objects/ref.js')).default;
    const { LaneId } = installed('@teambit/lane-id');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-native-clearall-'));
    t.after(() => fs.rm(directory, { recursive: true, force: true }));
    native(t);
    const entries = [
      {
        id: { scope: 'qualification.squash', name: 'component' },
        head: new PublicRef(ref(2).hash),
        laneId: new LaneId({ scope: 'qualification.squash', name: 'other' }),
      },
    ];
    const owner = new PublicOwner(path.join(directory, 'unmerged.json'), entries);
    const spawn = cp.spawn;
    const children = [],
      requests = [],
      acks = [];
    cp.spawn = function (executable, ...args) {
      const child = spawn.call(this, executable, ...args);
      if (executable === path.toNamespacedPath(process.env.BIT_RUST_OBJECT_IMPORT)) {
        children.push(child);
        const write = child.stdin.write;
        child.stdin.write = function (bytes, ...rest) {
          if (Buffer.isBuffer(bytes) && bytes.subarray(0, 4).toString() === 'BMT1')
            requests.push(JSON.parse(bytes.subarray(12)));
          return write.call(this, bytes, ...rest);
        };
        let pending = '';
        child.stdout.on('data', (bytes) => {
          pending += bytes;
          let end;
          while ((end = pending.indexOf('\n')) >= 0) {
            const line = pending.slice(0, end);
            pending = pending.slice(end + 1);
            try {
              acks.push(JSON.parse(line));
            } catch {}
          }
        });
      }
      return child;
    };
    t.after(() => {
      cp.spawn = spawn;
    });
    await publicSnapshot.withRustSnapshotOperation(async () => {
      await owner.removeAllComponentsNative();
      await owner.write();
      const emptyAlias = [];
      const empty = new PublicOwner(path.join(directory, 'empty', 'unmerged.json'), emptyAlias);
      await empty.removeAllComponentsNative();
      assert.equal(empty.hasChanged, true);
      assert.notEqual(empty.getComponents(), emptyAlias);
      await empty.write();
      assert.deepEqual(JSON.parse(await fs.readFile(empty.filePath, 'utf8')), []);
    });
    assert.deepEqual(
      requests.map((r) => r.kind),
      ['initialize', 'transition', 'commit', 'initialize', 'transition', 'commit']
    );
    assert.equal(requests[1].action.kind, 'removeAll');
    assert.equal(children.length, 1);
    assert.ok(children.every((child) => child.exitCode !== null || child.signalCode !== null));
    assert.equal(acks.length, 6);
    for (const ack of acks) {
      assert.equal(ack.completed, 1);
      assert.equal(ack.failed, false);
    }
    assert.deepEqual(owner.getComponents(), []);
    assert.equal(entries.length, 1);
    assert.deepEqual(JSON.parse(await fs.readFile(owner.filePath, 'utf8')), []);
  }
);
