const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { source, installed } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_SNAPSHOT_TAG_COMPILED === '1';
const adapter = compiled
  ? require(path.join(path.dirname(installed.resolve('@teambit/objects')), 'objects/rust-snapshot.js'))
  : source('scopes/scope/objects/objects/rust-snapshot.ts');
const sources = require(
  path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-persistence.js')
);
const Ref = compiled ? installed('@teambit/objects').Ref : source('scopes/scope/objects/objects/ref.ts').default;
const originalWorkspaceSession = sources.withWorkspaceSession;
const originalClientVcsFlag = process.env.BIT_RUST_CLIENT_VCS;
class Version {
  constructor(hash, body = 'body') {
    this.reference = hash;
    this.body = Buffer.from(body);
  }
  hash() {
    return new Ref(this.reference);
  }
  id() {
    return this.body.toString();
  }
  toBuffer() {
    return this.body;
  }
}
adapter.registerRustSnapshotModels({ Version });
function setup(t, responder) {
  const flag = originalClientVcsFlag;
  const original = originalWorkspaceSession;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  const observed = { requests: [], recorded: [], disposals: 0 };
  const session = {
    async request(build, count, validate) {
      const bytes = build(1);
      assert.equal(bytes.subarray(0, 4).toString(), 'BSS1');
      const input = JSON.parse(bytes.subarray(12));
      observed.requests.push(input);
      const ack = await responder(input, count, observed);
      observed.accepted = validate({ version: 1, id: 1, skipped: [], ...ack });
      return ack.completed;
    },
    async dispose() {
      observed.disposals++;
    },
  };
  sources.withWorkspaceSession = async (action) => action(session);
  t.after(() => {
    sources.withWorkspaceSession = original;
    if (flag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = flag;
  });
  const repository = {
    canPersistSnapshotsNatively: () => true,
    getPath: () => path.resolve('/tmp/snapshot-adapter-objects'),
    recordNativeObjectWrite: (object, inflatedSize, compressedSize) =>
      observed.recorded.push({ object, inflatedSize, compressedSize }),
  };
  return { repository, observed };
}
const ack = (input, count) => ({
  completed: count,
  failed: false,
  data: { written: input.objects.map((object) => ({ hash: object.hash, inflatedSize: 128, compressedSize: 64 })) },
});
const object = (char, body) => new Version(char.repeat(40), body);

test('snapshot writes require a tag/snap operation scope and reuse nested ownership', async (t) => {
  const { repository, observed } = setup(t, ack);
  const objects = [object('a')];
  assert.equal(await adapter.persistRustSnapshotObjects(repository, objects, undefined, null), undefined);
  assert.equal(observed.requests.length, 0);
  await adapter.withRustSnapshotOperation(async () => {
    assert.equal(adapter.isRustSnapshotOperation(), true);
    await adapter.withRustSnapshotOperation(async () => {
      assert.equal(await adapter.persistRustSnapshotObjects(repository, objects, undefined, null), 1);
    });
  });
  assert.equal(adapter.isRustSnapshotOperation(), false);
  assert.equal(observed.requests.length, 1);
  assert.equal(observed.requests[0].objects[0].body, Buffer.from('body').toString('hex'));
  assert.equal(observed.recorded[0].object, objects[0]);
});

test('custom serialization and raw-object overrides retain canonical persistence without helper requests', async (t) => {
  const { repository, observed } = setup(t, ack);
  await adapter.withRustSnapshotOperation(async () => {
    const custom = object('a');
    let calls = 0;
    custom.toBuffer = () => {
      calls++;
      return Buffer.from('custom');
    };
    assert.equal(await adapter.persistRustSnapshotObjects(repository, [custom], undefined, null), undefined);
    assert.equal(calls, 0);
    const raw = object('b');
    assert.equal(
      await adapter.persistRustSnapshotObjects(repository, [raw], new Map([[raw, Buffer.from('raw')]]), null),
      undefined
    );
  });
  assert.equal(observed.requests.length, 0);
  assert.equal(observed.recorded.length, 0);
});

test('a native committed prefix records only completed objects and reaps failure before returning for suffix replay', async (t) => {
  const { repository, observed } = setup(t, (input) => ({
    completed: 1,
    failed: true,
    data: { written: [{ hash: input.objects[0].hash, inflatedSize: 128, compressedSize: 64 }] },
  }));
  const objects = [object('a'), object('b')];
  const completed = await adapter.withRustSnapshotOperation(() =>
    adapter.persistRustSnapshotObjects(repository, objects, undefined, null)
  );
  assert.equal(completed, 1);
  assert.equal(observed.disposals, 1);
  assert.equal(observed.recorded.length, 1);
  assert.equal(observed.recorded[0].object, objects[0]);
});

test('wrong committed identities and malformed sizes never mark pending objects as persisted', async (t) => {
  for (const written of [
    { hash: 'b'.repeat(40), inflatedSize: 128, compressedSize: 64 },
    { hash: 'a'.repeat(40), inflatedSize: 0, compressedSize: 64 },
  ]) {
    const { repository, observed } = setup(t, () => ({ completed: 1, failed: false, data: { written: [written] } }));
    assert.equal(
      await adapter.withRustSnapshotOperation(() =>
        adapter.persistRustSnapshotObjects(repository, [object('a')], undefined, null)
      ),
      undefined
    );
    assert.equal(observed.accepted, false);
    assert.equal(observed.recorded.length, 0);
  }
});

test('in-flight object and pending-array mutations force complete canonical replay without recording stale writes', async (t) => {
  for (const mutate of [
    (objects) => {
      objects[0].body[0] = 120;
    },
    (objects) => {
      objects.push(object('c'));
    },
  ]) {
    const objects = [object('a'), object('b')];
    const { repository, observed } = setup(t, (input, count) => {
      mutate(objects);
      return ack(input, count);
    });
    assert.equal(
      await adapter.withRustSnapshotOperation(() =>
        adapter.persistRustSnapshotObjects(repository, objects, undefined, null)
      ),
      0
    );
    assert.equal(observed.recorded.length, 0);
  }
});

test('invalid native plan identities leave tag, head and Version parents untouched', async (t) => {
  for (const invalid of [
    { parent: 'f'.repeat(40), detached: false, tag: true },
    { parent: 'a'.repeat(40), detached: false, tag: false },
    { detached: false, tag: true },
    { parent: 'a'.repeat(40), detached: true, tag: true },
  ]) {
    const { observed } = setup(t, () => ({ completed: 1, failed: false, data: invalid }));
    const changes = [];
    const head = new Ref('a'.repeat(40));
    const component = {
      canAddSnapshotVersionNatively: () => true,
      getHead: () => head,
      getRef: () => undefined,
      hasTag: () => false,
      toBuffer: () => Buffer.from('model'),
      setHead: () => changes.push('head'),
      setVersion: () => changes.push('tag'),
      markVersionAsLocal: () => changes.push('local'),
      detachedHeads: { setHead: () => changes.push('detached'), clearCurrent: () => changes.push('clear') },
    };
    const version = object('b');
    version.isLegacy = false;
    version.addAsOnlyParent = () => changes.push('parent');
    assert.equal(
      await adapter.withRustSnapshotOperation(() => adapter.addRustSnapshotVersion(component, version, '1.0.0')),
      undefined
    );
    assert.equal(observed.requests[0].kind, 'plan');
    assert.deepEqual(changes, []);
  }
});

test('model changes during native planning decline before applying parent or tag updates', async (t) => {
  let modelBody = 'initial';
  const changes = [];
  const { observed } = setup(t, () => {
    modelBody = 'changed by hook';
    return { completed: 1, failed: false, data: { parent: 'a'.repeat(40), detached: false, tag: true } };
  });
  const component = {
    canAddSnapshotVersionNatively: () => true,
    getHead: () => new Ref('a'.repeat(40)),
    getRef: () => undefined,
    hasTag: () => false,
    toBuffer: () => Buffer.from(modelBody),
    setHead: () => changes.push('head'),
    setVersion: () => changes.push('tag'),
    markVersionAsLocal: () => changes.push('local'),
    detachedHeads: { setHead: () => changes.push('detached'), clearCurrent: () => changes.push('clear') },
  };
  const version = object('b');
  version.isLegacy = false;
  version.addAsOnlyParent = () => changes.push('parent');
  assert.equal(
    await adapter.withRustSnapshotOperation(() => adapter.addRustSnapshotVersion(component, version, '1.0.0')),
    undefined
  );
  assert.equal(observed.requests.length, 1);
  assert.deepEqual(changes, []);
});

test('snapshot index eligibility preserves custom paths and captured prototype write hooks', () => {
  const module = compiled
    ? require(path.join(path.dirname(installed.resolve('@teambit/objects')), 'objects/scope-index.js'))
    : source('scopes/scope/objects/objects/scope-index.ts');
  const directory = path.resolve('/tmp/snapshot-index-guard/objects');
  const index = new module.ScopeIndex(path.join(path.dirname(directory), 'index.json'));
  assert.equal(module.canPersistSnapshotIndexNatively(index, directory), true);
  index.indexPath = path.join(path.dirname(directory), 'custom-index.json');
  assert.equal(module.canPersistSnapshotIndexNatively(index, directory), false);
  index.indexPath = path.join(path.dirname(directory), 'index.json');
  const original = module.ScopeIndex.prototype.write;
  try {
    module.ScopeIndex.prototype.write = function (...args) {
      return original.apply(this, args);
    };
    assert.equal(module.canPersistSnapshotIndexNatively(index, directory), false);
  } finally {
    module.ScopeIndex.prototype.write = original;
  }
  assert.equal(module.canPersistSnapshotIndexNatively(index, directory), true);
});

test('hydrated workspace Sources remain eligible for ordinary snapshot bodies after in-place mutation', async (t) => {
  const { repository, observed } = setup(t, ack);
  const { createHash } = require('node:crypto');
  const componentSources = installed('@teambit/component.sources');
  const Source = installed('@teambit/objects').Source;
  adapter.registerRustSnapshotModels({ Source });
  const contents = Buffer.from('source\r\n');
  const filename = path.resolve('/tmp/snapshot-source-provenance/source.js');
  const file = new componentSources.SourceFile({ base: path.dirname(filename), path: filename, contents });
  const sha1 = (bytes) => createHash('sha1').update(bytes).digest('hex');
  componentSources.registerRustWorkspaceFile(file, {
    path: filename,
    contents,
    hash: sha1(contents),
    linuxHash: sha1(Buffer.from('source\n')),
  });
  const sourceObject = componentSources.getRustWorkspaceSource(file);
  assert.ok(componentSources.getRustSnapshotSourceDescriptor(sourceObject));
  const hydrated = sourceObject.contents;
  assert.ok(
    componentSources.getRustSnapshotSourceDescriptor(sourceObject),
    'read-only hydration must retain snapshot provenance'
  );
  assert.equal(sourceObject.hash, Source.prototype.hash, 'hydration must restore canonical hash method identity');
  assert.equal(Object.hasOwn(sourceObject, 'hash'), false);
  hydrated[0] = 120;
  assert.equal(componentSources.getRustSnapshotSourceDescriptor(sourceObject), undefined);
  assert.equal(
    await adapter.withRustSnapshotOperation(() =>
      adapter.persistRustSnapshotObjects(repository, [sourceObject], undefined, null)
    ),
    1
  );
  const projected = observed.requests[0].objects[0];
  assert.equal(projected.workspace, undefined);
  assert.equal(projected.body, Buffer.from('xource\n').toString('hex'));
  assert.equal(projected.hash, sha1(Buffer.from('xource\n')));
});

function planFixture(head, parent) {
  const changes = [];
  const component = {
    canAddSnapshotVersionNatively: () => true,
    getHead: () => head,
    getRef: () => parent,
    hasTag: () => false,
    toBuffer: () => Buffer.from('model'),
    setHead: () => changes.push('head'),
    setVersion: () => changes.push('tag'),
    markVersionAsLocal: () => changes.push('local'),
    detachedHeads: { setHead: () => changes.push('detached'), clearCurrent: () => changes.push('clear') },
  };
  const version = object('b');
  version.isLegacy = false;
  version.addAsOnlyParent = (reference) => changes.push(reference);
  return { component, version, changes };
}

test('snapshot planning rejects custom Ref methods, accessors and subclasses without invoking them', async (t) => {
  for (const customization of ['ownEqual', 'ownString', 'getter', 'subclass', 'prototypeEqual', 'prototypeString']) {
    const { observed } = setup(t, () => {
      throw new Error('custom Ref must decline before invoking the helper');
    });
    let calls = 0;
    const custom = () => {
      calls++;
      return 'a'.repeat(40);
    };
    const head = new Ref('a'.repeat(40));
    let parent = new Ref('a'.repeat(40));
    const originalEqual = Object.getOwnPropertyDescriptor(Ref.prototype, 'isEqual');
    const originalString = Object.getOwnPropertyDescriptor(Ref.prototype, 'toString');
    try {
      if (customization === 'ownEqual') parent.isEqual = custom;
      if (customization === 'ownString') head.toString = custom;
      if (customization === 'getter') Object.defineProperty(head, 'toString', { get: custom });
      if (customization === 'subclass') parent = new (class extends Ref {})('a'.repeat(40));
      if (customization === 'prototypeEqual') Ref.prototype.isEqual = custom;
      if (customization === 'prototypeString') Ref.prototype.toString = custom;
      const { component, version, changes } = planFixture(head, parent);
      assert.equal(
        await adapter.withRustSnapshotOperation(() =>
          adapter.addRustSnapshotVersion(component, version, '1.0.0', undefined, '0.0.1')
        ),
        undefined
      );
      assert.equal(calls, 0, customization);
      assert.equal(observed.requests.length, 0, customization);
      assert.deepEqual(changes, [], customization);
    } finally {
      Object.defineProperty(Ref.prototype, 'isEqual', originalEqual);
      Object.defineProperty(Ref.prototype, 'toString', originalString);
    }
  }
});

test('snapshot planning rechecks Ref methods after awaiting the helper', async (t) => {
  const head = new Ref('a'.repeat(40));
  const parent = new Ref('a'.repeat(40));
  let calls = 0;
  const { observed } = setup(t, () => {
    Object.defineProperty(parent, 'isEqual', {
      get() {
        calls++;
        return () => false;
      },
    });
    return { completed: 1, failed: false, data: { parent: 'a'.repeat(40), detached: false, tag: true } };
  });
  const { component, version, changes } = planFixture(head, parent);
  assert.equal(
    await adapter.withRustSnapshotOperation(() =>
      adapter.addRustSnapshotVersion(component, version, '1.0.0', undefined, '0.0.1')
    ),
    undefined
  );
  assert.equal(observed.requests.length, 1);
  assert.equal(calls, 0);
  assert.deepEqual(changes, []);
});

test('snapshot parent policy preserves distinct Ref identity when parent and head hashes match', async (t) => {
  for (const setHeadAsParent of [true, false]) {
    const { observed } = setup(t, () => ({
      completed: 1,
      failed: false,
      data: { parent: 'a'.repeat(40), detached: false, tag: true },
    }));
    const head = new Ref('a'.repeat(40));
    const parent = new Ref('a'.repeat(40));
    const { component, version, changes } = planFixture(head, parent);
    assert.equal(
      await adapter.withRustSnapshotOperation(() =>
        adapter.addRustSnapshotVersion(component, version, '1.0.0', undefined, '0.0.1', { setHeadAsParent })
      ),
      '1.0.0'
    );
    assert.equal(observed.requests.length, 1);
    assert.equal(changes[0], setHeadAsParent ? head : parent);
  }
});
