const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const zlib = require('node:zlib');
const { source, installed, root } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_SNAPSHOT_TRANSACTION_COMPILED === '1';
const base = path.dirname(installed.resolve('@teambit/objects'));
const moduleAt = (name) =>
  compiled ? require(path.join(base, 'objects', name + '.js')) : source('scopes/scope/objects/objects/' + name + '.ts');
if (!compiled) source('scopes/scope/objects/models/index.ts');
const tx = moduleAt('rust-snapshot-transaction');
const store = moduleAt('rust-snapshot-store');
const objects = installed('@teambit/objects');
const Version = compiled ? objects.Version : source('scopes/scope/objects/models/version.ts').default;
const Repository = compiled ? objects.Repository : source('scopes/scope/objects/objects/repository.ts').default;
const Ref = compiled ? objects.Ref : source('scopes/scope/objects/objects/ref.ts').default;
const extensions = installed('@teambit/legacy.extension-data');
if (!compiled) {
  source('scopes/scope/objects/models/index.ts');
  const guards = moduleAt('rust-snapshot-guards');
  const dependencies = installed('@teambit/legacy.consumer-component');
  for (const [name, ctor] of Object.entries({
    Dependencies: dependencies.Dependencies,
    Dependency: dependencies.Dependency,
    ExtensionDataList: extensions.ExtensionDataList,
    ExtensionDataEntry: extensions.ExtensionDataEntry,
  }))
    guards.registerRustSnapshotTransactionClass(
      name,
      ctor,
      name === 'ExtensionDataList' ? ['coreExtensionsNames', 'toModelObjectsHook', 'validateBeforePersistHook'] : []
    );
  // TypeScript's test loader represents namespace path imports with getters; the canonical build owns these DATA functions.
  guards.registerRustSnapshotFunctions('SnapshotRepositoryPath', path, ['join', 'resolve', 'dirname', 'basename']);
  const lodash = installed('lodash');
  guards.registerRustSnapshotFunctions('Dependencies', lodash, ['cloneDeep', 'uniqBy']);
  guards.registerRustSnapshotFunctions('ExtensionDataList', lodash, [
    'sortBy',
    'unionWith',
    'isEmpty',
    'cloneDeep',
    'compact',
  ]);
  guards.registerRustSnapshotFunctions('ExtensionDataEntry', lodash, ['cloneDeep']);
}
function version(hash = 'a') {
  return new Version({
    mainFile: 'index.js',
    files: [{ name: 'index.js', relativePath: 'index.js', file: new Ref('b'.repeat(40)), test: false }],
    log: { message: 'Unicode Ω🌱', date: '123', username: 'q', email: 'q@example.com' },
    hash: hash.repeat(40),
    dependencies: [],
    devDependencies: [],
  });
}
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-snapshot-store-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const repository = await Repository.create({
    scopePath: directory,
    scopeJson: { name: 'qualification', groupName: undefined },
  });
  const oldFlag = process.env.BIT_RUST_CLIENT_VCS,
    oldHelper = process.env.BIT_RUST_OBJECT_IMPORT,
    oldWindowsWrites = process.env.BIT_RUST_OBJECT_IMPORT_WINDOWS_WRITES;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  // The repository intentionally requires a separate Windows write opt-in.
  if (process.platform === 'win32') process.env.BIT_RUST_OBJECT_IMPORT_WINDOWS_WRITES = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT =
    process.env.BIT_TEST_OBJECT_IMPORT ||
    path.join(root, 'native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));
  t.after(() => {
    if (oldFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = oldFlag;
    if (oldHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = oldHelper;
    if (oldWindowsWrites === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT_WINDOWS_WRITES;
    else process.env.BIT_RUST_OBJECT_IMPORT_WINDOWS_WRITES = oldWindowsWrites;
  });
  return repository;
}
test('ordinary empty-extension Version is serialized and committed by the real native writer', async (t) => {
  const repository = await fixture(t),
    value = version();
  const canonical = value.serialize();
  await tx.withRustSnapshotTransaction(async () => {
    const result = await store.persistPreparedRustSnapshotObjects(repository, [value], undefined, null);
    assert.equal(result?.completed, 1, 'ordinary public defining classes must qualify without fake registrations');
  });
  assert.deepEqual(zlib.inflateSync(await fs.readFile(repository.objectPath(value.hash()))), canonical);
});
test('unknown validation callback declines before native preparation and executes once canonically', async (t) => {
  const repository = await fixture(t),
    value = version();
  const previous = extensions.ExtensionDataList.validateBeforePersistHook;
  let calls = 0;
  extensions.ExtensionDataList.validateBeforePersistHook = () => {
    calls++;
    value._hash = 'c'.repeat(40);
  };
  t.after(() => {
    extensions.ExtensionDataList.validateBeforePersistHook = previous;
  });
  await tx.withRustSnapshotTransaction(async () => {
    assert.equal(await store.persistPreparedRustSnapshotObjects(repository, [value], undefined, null), undefined);
    assert.equal(calls, 0);
    await repository.writeObjectsToTheFS([value]);
  });
  assert.equal(calls, 1);
  const bytes = zlib.inflateSync(await fs.readFile(repository.objectPath(value.hash())));
  assert.match(bytes.subarray(0, bytes.indexOf(0)).toString(), /cccccccccccccccccccccccccccccccccccccccc/);
});

test('a late Version mutation resumes its immutable serialization and resolves the live destination ref', async (t) => {
  const repository = await fixture(t),
    value = version();
  const expected = value.serialize();
  const Session = require(
    path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
  ).MaterializationSession;
  const request = Session.prototype.request;
  let serialized = 0;
  Session.prototype.request = async function (build, ...args) {
    const frame = build(1);
    const input = frame.subarray(0, 4).toString() === 'BMT1' ? JSON.parse(frame.subarray(12)) : undefined;
    const result = await request.call(this, build, ...args);
    if (input?.kind === 'snapshotSerialize') {
      serialized++;
      value.log.message = 'queued late mutation';
      value._hash = 'd'.repeat(40);
    }
    return result;
  };
  t.after(() => {
    Session.prototype.request = request;
  });
  await tx.withRustSnapshotTransaction(async () => {
    const result = await store.persistPreparedRustSnapshotObjects(repository, [value], undefined, null);
    assert.equal(serialized, 1, 'the mutation must occur after an actual native serialization');
    assert.equal(result?.completed, 0);
    const raw = await result.fallback.get(value)();
    assert.equal(raw.ref.toString(), 'd'.repeat(40));
    assert.deepEqual(zlib.inflateSync(raw.buffer), expected, 'the old body and header must survive a late mutation');
  });
});

test('public Repository.persist completes its suffix after a lost validation receipt', async (t) => {
  const repository = await fixture(t),
    value = version();
  repository.add(value);
  const Session = require(
    path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
  ).MaterializationSession;
  const original = Session.prototype.request;
  const hook = Repository.onPostObjectsPersist;
  let begins = 0,
    lost = 0,
    post = 0;
  Repository.onPostObjectsPersist = async () => {
    post++;
  };
  Session.prototype.request = async function (build, count, validate, ...args) {
    const frame = build(1);
    const input = frame.subarray(0, 4).toString() === 'BMT1' ? JSON.parse(frame.subarray(12)) : undefined;
    if (input?.kind === 'snapshotRepositoryBegin') begins++;
    const lose = input?.kind === 'snapshotRepositoryReceipt' && input.revision === 1;
    if (lose) lost++;
    return original.call(this, build, count, lose ? () => false : validate, ...args);
  };
  t.after(() => {
    Session.prototype.request = original;
    Repository.onPostObjectsPersist = hook;
  });
  await tx.withRustSnapshotTransaction(() => repository.persist());
  assert.equal(begins, 1, 'the genuine public Repository must initialize its native journal');
  assert.equal(lost, 1);
  assert.equal(post, 1, 'completed public callbacks must not be replayed');
  assert.equal(Object.keys(repository.objects).length, 0);
  assert.deepEqual(zlib.inflateSync(await fs.readFile(repository.objectPath(value.hash()))), value.serialize());
});

test('a public validation failure preserves the pending repository and original error', async (t) => {
  const repository = await fixture(t),
    value = version();
  repository.add(value);
  const prior = extensions.ExtensionDataList.validateBeforePersistHook;
  const error = new Error('qualification validator failure');
  let calls = 0;
  extensions.ExtensionDataList.validateBeforePersistHook = () => {
    calls++;
    throw error;
  };
  t.after(() => {
    extensions.ExtensionDataList.validateBeforePersistHook = prior;
  });
  await assert.rejects(
    tx.withRustSnapshotTransaction(() => repository.persist()),
    (actual) => actual === error
  );
  assert.equal(calls, 1);
  assert.equal(
    repository.objects[value.hash().toString()],
    value,
    'failed persistence must retain the original pending object'
  );
  await assert.rejects(fs.access(repository.objectPath(value.hash())), { code: 'ENOENT' });
});

test('custom repository capability hooks decline before invocation or native serialization', async (t) => {
  const repository = await fixture(t),
    value = version();
  const Session = require(
    path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
  ).MaterializationSession;
  const request = Session.prototype.request;
  let frames = 0,
    calls = 0;
  Session.prototype.request = async function (...args) {
    frames++;
    return request.apply(this, args);
  };
  t.after(() => {
    Session.prototype.request = request;
  });
  for (const method of ['isNativeSourceStoreEligible', 'isContentTransformed', 'canWriteMutableObjectsNatively']) {
    const original = Repository.prototype[method];
    Repository.prototype[method] = () => {
      calls++;
      return true;
    };
    try {
      await tx.withRustSnapshotTransaction(async () => {
        assert.equal(await store.persistPreparedRustSnapshotObjects(repository, [value], undefined, null), undefined);
      });
    } finally {
      Repository.prototype[method] = original;
    }
  }
  assert.equal(calls, 0, 'speculative capability checks must preserve public hook ordering');
  assert.equal(frames, 0);
});

test('a newly cached generated Source uses its body rather than a nonexistent repository object', async (t) => {
  const repository = await fixture(t);
  const Source = compiled ? objects.Source : source('scopes/scope/objects/models/source.ts').default;
  const value = new Source(Buffer.from('{"generatedGraph":"Ω🌱"}'));
  repository.add(value);
  assert.equal(repository.getCache(value.hash()), value);
  await assert.rejects(fs.access(repository.objectPath(value.hash())), { code: 'ENOENT' });
  await tx.withRustSnapshotTransaction(async () => {
    const result = await store.persistPreparedRustSnapshotObjects(repository, [value], undefined, null);
    assert.equal(result?.completed, 1);
  });
  assert.deepEqual(zlib.inflateSync(await fs.readFile(repository.objectPath(value.hash()))), value.serialize());
});

test('ordinary workspace file clones retain verified provenance until aliased bytes mutate', async (t) => {
  await fixture(t);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-snapshot-clone-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'index.js'),
    contents = Buffer.from('module.exports = "Ω🌱";\n');
  await fs.writeFile(filename, contents);
  const sourcesBase = path.dirname(installed.resolve('@teambit/component.sources'));
  const SourceFile = compiled
    ? installed('@teambit/component.sources').SourceFile
    : source('scopes/component/sources/source-file.ts').default;
  const identity = compiled
    ? require(path.join(sourcesBase, 'rust-workspace-identity.js'))
    : source('scopes/component/sources/rust-workspace-identity.ts');
  const hash = require('node:crypto').createHash('sha1').update(contents).digest('hex');
  const file = new SourceFile({
    cwd: directory,
    base: directory,
    path: filename,
    contents,
    stat: await fs.stat(filename),
  });
  identity.registerRustWorkspaceFile(file, { path: filename, contents, hash, linuxHash: hash });
  const clone = file.clone();
  assert.equal(clone.contents, file.contents, 'canonical clone Buffer alias must survive');
  assert.deepEqual(identity.getRustWorkspaceFileDescriptor(clone), { path: filename, hash });
  const clonedSource = clone.toSourceAsLinuxEOL();
  assert.equal(identity.getRustSnapshotSourceDescriptor(clonedSource)?.path, filename);
  file.contents[0] ^= 1;
  assert.equal(identity.getRustWorkspaceFileDescriptor(file), undefined);
  assert.equal(identity.getRustWorkspaceFileDescriptor(clone), undefined);
  assert.equal(identity.getRustSnapshotSourceDescriptor(clonedSource), undefined);
});

test('public VersionHistory writing falls back without inventing a class validator', async (t) => {
  const repository = await fixture(t);
  const History = compiled ? objects.VersionHistory : source('scopes/scope/objects/models/version-history.ts').default;
  const history = new History({
    name: 'component',
    scope: 'qualification',
    versions: [{ hash: new Ref('a'.repeat(40)), parents: [new Ref('b'.repeat(40))] }],
    graphCompleteRefs: ['a'.repeat(40)],
  });
  assert.equal(history.validateBeforePersist, true);
  assert.equal(history.validateBeforePersisting, undefined);
  const expected = history.serialize();
  const Session = require(
    path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
  ).MaterializationSession;
  const request = Session.prototype.request;
  let declined = 0;
  Session.prototype.request = async function (build, count, validate, ...args) {
    const frame = build(1);
    const input = frame.subarray(0, 4).toString() === 'BMT1' ? JSON.parse(frame.subarray(12)) : undefined;
    const lose = input?.kind === 'snapshotSerialize';
    if (lose) declined++;
    return request.call(this, build, count, lose ? () => false : validate, ...args);
  };
  t.after(() => {
    Session.prototype.request = request;
  });
  await tx.withRustSnapshotTransaction(() => repository.writeObjectsToTheFS([history]));
  assert.equal(declined, 1, 'force the genuine prepared metadata fallback');
  assert.deepEqual(zlib.inflateSync(await fs.readFile(repository.objectPath(history.hash()))), expected);
});

test('genuine VersionHistory getter records are serialized and committed natively', async (t) => {
  const repository = await fixture(t);
  const History = compiled ? objects.VersionHistory : source('scopes/scope/objects/models/version-history.ts').default;
  const history = new History({
    name: 'component',
    scope: 'qualification',
    versions: [
      {
        hash: new Ref('a'.repeat(40)),
        parents: [new Ref('b'.repeat(40))],
        unrelated: new Ref('c'.repeat(40)),
        squashed: [new Ref('d'.repeat(40))],
      },
    ],
    graphCompleteRefs: ['a'.repeat(40)],
  });
  assert.equal(Object.getOwnPropertyDescriptor(history, 'versions'), undefined);
  const expected = history.serialize();
  await tx.withRustSnapshotTransaction(async () => {
    const result = await store.persistPreparedRustSnapshotObjects(repository, [history], undefined, null);
    assert.equal(result?.completed, 1, 'default History must reach Native commit, not prepared fallback');
  });
  assert.deepEqual(zlib.inflateSync(await fs.readFile(repository.objectPath(history.hash()))), expected);
});

test('History record accessors decline before the defining versions getter can observe them', async (t) => {
  const repository = await fixture(t);
  const History = compiled ? objects.VersionHistory : source('scopes/scope/objects/models/version-history.ts').default;
  const history = new History({ name: 'component', scope: 'qualification', versions: [] });
  let reads = 0;
  Object.defineProperty(history.versionsObj, 'a'.repeat(40), {
    enumerable: true,
    get() {
      reads++;
      throw Error('custom history record');
    },
  });
  await tx.withRustSnapshotTransaction(async () => {
    assert.equal(await store.persistPreparedRustSnapshotObjects(repository, [history], undefined, null), undefined);
  });
  assert.equal(reads, 0);
});

test('Source byte aliases keep the synchronous canonical snapshot across private awaits', async (t) => {
  const repository = await fixture(t);
  const Source = compiled ? objects.Source : source('scopes/scope/objects/models/source.ts').default;
  const Session = require(
    path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
  ).MaterializationSession;
  for (const boundary of ['serialize', 'directory']) {
    const value = new Source(Buffer.from('original Source Ω\r\n'));
    const expected = value.serialize();
    const originalHash = value.hash().toString();
    let reached = 0;
    const originalRequest = Session.prototype.request;
    if (boundary === 'serialize') {
      Session.prototype.request = async function (build, ...args) {
        const frame = build(1);
        const input = frame.subarray(0, 4).toString() === 'BMT1' ? JSON.parse(frame.subarray(12)) : undefined;
        const result = await originalRequest.call(this, build, ...args);
        if (input?.kind === 'snapshotSerialize') {
          reached++;
          value.contents.fill(90);
        }
        return result;
      };
    }
    try {
      await tx.withRustSnapshotTransaction(async () => {
        const pending = store.persistPreparedRustSnapshotObjects(repository, [value], undefined, null);
        if (boundary === 'directory') {
          reached++;
          value.contents.fill(90);
        }
        const result = await pending;
        assert.equal(reached, 1, boundary);
        assert.equal(result?.completed, 0, boundary);
        assert.notEqual(value.hash().toString(), originalHash);
        const raw = await result.fallback.get(value)();
        assert.deepEqual(
          zlib.inflateSync(raw.buffer),
          expected,
          `${boundary}: original body/header must survive aliased mutation`
        );
        assert.equal(
          raw.ref.toString(),
          value.hash().toString(),
          `${boundary}: destination retains canonical late Ref`
        );
      });
    } finally {
      Session.prototype.request = originalRequest;
    }
  }
});

test('Version captures its canonical body and header before the first private directory await', async (t) => {
  const repository = await fixture(t),
    value = version();
  const expected = value.serialize();
  await tx.withRustSnapshotTransaction(async () => {
    const pending = store.persistPreparedRustSnapshotObjects(repository, [value], undefined, null);
    value.log.message = 'late directory mutation';
    value._hash = 'e'.repeat(40);
    const result = await pending;
    assert.equal(result?.completed, 0);
    const raw = await result.fallback.get(value)();
    assert.deepEqual(zlib.inflateSync(raw.buffer), expected);
    assert.equal(raw.ref.toString(), 'e'.repeat(40));
  });
});

test('metadata validation uses the flag and method captured before asynchronous serialization', async (t) => {
  const repository = await fixture(t);
  const Session = require(
    path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
  ).MaterializationSession;
  const request = Session.prototype.request;
  t.after(() => {
    Session.prototype.request = request;
  });
  for (const mutation of ['flag', 'method']) {
    const value = version();
    value.mainFile = 'missing-main.js';
    let expected;
    try {
      value.serialize();
    } catch (error) {
      expected = error;
    }
    assert.ok(expected, 'ordinary canonical validation rejects the missing main file');
    let patchedCalls = 0;
    let serialized = 0;
    Session.prototype.request = async function (build, ...args) {
      const frame = build(1);
      const input = frame.subarray(0, 4).toString() === 'BMT1' ? JSON.parse(frame.subarray(12)) : undefined;
      const result = await request.call(this, build, ...args);
      if (input?.kind === 'snapshotSerialize') {
        serialized++;
        if (mutation === 'flag') value.validateBeforePersist = false;
        else
          value.validateBeforePersisting = () => {
            patchedCalls++;
          };
      }
      return result;
    };
    await assert.rejects(
      tx.withRustSnapshotTransaction(() =>
        store.persistPreparedRustSnapshotObjects(repository, [value], undefined, null)
      ),
      (error) => error.constructor === expected.constructor && error.message === expected.message
    );
    assert.equal(serialized, 1, 'mutation follows the real native serialization acknowledgement');
    assert.equal(patchedCalls, 0, 'a newly installed validator must not replace the original synchronous call');
    await assert.rejects(fs.access(repository.objectPath(value.hash())), { code: 'ENOENT' });
  }
});
