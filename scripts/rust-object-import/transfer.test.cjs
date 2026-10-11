const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { source, installed, root } = require('./load-source.cjs');
const { createMergeFixture } = require('./merge-history-fixture.cjs');
const compiled = process.env.BIT_TEST_TRANSFER_COMPILED === '1';
const objectsRoot = path.dirname(installed.resolve('@teambit/objects'));
const load = (relative) =>
  compiled ? require(path.join(objectsRoot, relative + '.js')) : source('scopes/scope/objects/' + relative + '.ts');
const adapter = load('objects/rust-transfer');
const Repository = load('objects/repository').default;
const Ref = load('objects/ref').default;
const Version = load('models/version').default;
const ModelComponent = load('models/model-component').default;
const { ExtensionDataList, ExtensionDataEntry } = installed('@teambit/legacy.extension-data');
adapter.registerRustTransferClass('Array', Array, [
  'map',
  'filter',
  'slice',
  'every',
  'some',
  'includes',
  'find',
  'push',
  'flatMap',
]);
adapter.registerRustTransferClass('ExtensionDataEntry', ExtensionDataEntry, ['stringId']);
adapter.registerRustTransferClass('ExtensionDataList', ExtensionDataList, ['findExtension']);
const { ObjectList } = load('objects/object-list');
const helper =
  process.env.BIT_TEST_OBJECT_IMPORT ||
  path.join(root, 'native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));
for (const [name, ctor, methods] of [
  [
    'Repository',
    Repository,
    [
      'loadRaw',
      'loadManyRaw',
      'loadManyRawIgnoreMissing',
      'getPath',
      'isContentTransformed',
      'objectPath',
      'hashPath',
      'getCache',
      'canPlanCheckoutNatively',
    ],
  ],
  ['ModelComponent', ModelComponent, ['collectVersionsObjects', 'getLocalTagsOrHashes', 'getRef', 'loadVersion']],
  ['Version', Version, ['hash', 'refsWithOptions', 'getType']],
  ['ObjectList', ObjectList, ['getSha1Hash', 'toTar', 'addIfNotExist']],
])
  adapter.registerRustTransferClass(name, ctor, methods);
async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-transfer-test-'));
  const oldFlag = process.env.BIT_RUST_CLIENT_VCS,
    oldHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  const types = installed('@teambit/legacy.scope').typesObj,
    oldVersion = types.Version;
  const f = await createMergeFixture(process.env.BIT_LEGACY_ROOT, directory);
  const head = await f.publishRemoteSibling();
  types.Version = Version;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  t.after(async () => {
    types.Version = oldVersion;
    if (oldFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = oldFlag;
    if (oldHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = oldHelper;
    await fs.rm(directory, { recursive: true, force: true });
  });
  const scopeJson = JSON.parse(await fs.readFile(path.join(directory, 'scope.json'), 'utf8'));
  const repo = await Repository.create({ scopePath: directory, scopeJson });
  const version = await repo.load(new Ref(head));
  return { directory, repo, version, head, base: f.baseRef };
}
async function bytes(readable) {
  const result = [];
  for await (const chunk of readable) result.push(chunk);
  return Buffer.concat(result);
}
function publicItems(items) {
  return items.map((item) => ({
    hash: item.ref.toString(),
    scope: item.scope,
    type: item.type,
    body: item.buffer.toString('hex'),
  }));
}

test('native export collection preserves ordered compressed objects and keeps Source bodies lazy until read', async (t) => {
  const f = await setup(t);
  const refs = [f.version.hash(), ...f.version.refsWithOptions(false, false)];
  const canonical = await f.repo.loadManyRaw(refs);
  await adapter.withRustTransferOperation(async () => {
    const native = await adapter.collectRustTransferVersions(f.repo, [f.version], [f.head], 'export', true);
    assert.ok(native, 'eligible actual native collection must be accepted');
    assert.ok(native.some((item) => item.type === 'Source'));
    for (const item of native) assert.equal(typeof Object.getOwnPropertyDescriptor(item, 'buffer').get, 'function');
    assert.deepEqual(
      publicItems(native).map(({ type, ...item }) => item),
      publicItems(canonical).map(({ type, ...item }) => item)
    );
  });
});

test('native ObjectList preserves scope/hash duplicate selection, compressed retry identity and tar ordering', async (t) => {
  const f = await setup(t);
  const tar = installed('tar-stream');
  async function entries(body) {
    const extract = tar.extract(),
      rows = [];
    extract.on('entry', (header, stream, next) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        rows.push({ name: header.name, body: Buffer.concat(chunks).toString('hex') });
        next();
      });
    });
    extract.end(body);
    await new Promise((resolve, reject) => {
      extract.on('finish', resolve);
      extract.on('error', reject);
    });
    return rows;
  }
  const raw = (await f.repo.loadManyRaw([f.version.files[0].file]))[0];
  const plain = new ObjectList([
    raw,
    { ...raw, scope: 'qualification.alpha' },
    { ...raw, scope: 'qualification.beta' },
  ]);
  const originalHash = plain.getSha1Hash();
  const canonical = await entries(await bytes(plain.toTar()));
  await adapter.withRustTransferOperation(async () => {
    const selected = [];
    for (const scope of [undefined, 'qualification.alpha', 'qualification.beta']) {
      const native = await adapter.collectRustTransferVersions(f.repo, [f.version], [], 'fetch', false, false);
      assert.ok(native);
      const first = native.find((item) => item.ref.toString() === raw.ref.toString());
      if (scope) first.scope = scope;
      selected.push(first);
    }
    const list = new ObjectList();
    list.addIfNotExist([selected[0], selected[0], selected[1], selected[2]]);
    assert.equal(list.count(), 3);
    assert.equal(await adapter.prepareRustTransferList(list), true);
    assert.equal(list.getSha1Hash(), originalHash, 'export retry SHA1 remains exact compressed bytes');
    assert.deepEqual(await entries(await bytes(list.toTar())), canonical);
    for (const item of selected)
      assert.equal(
        typeof Object.getOwnPropertyDescriptor(item, 'buffer').get,
        'function',
        'archive/hash bypass compressed Source bodies in Node'
      );
  });
});

test('custom repository raw-read hooks decline before callbacks and canonical caller retains error identity', async (t) => {
  const f = await setup(t);
  let calls = 0;
  const error = new Error('custom raw hook');
  f.repo.loadManyRaw = async () => {
    calls++;
    throw error;
  };
  await adapter.withRustTransferOperation(async () => {
    assert.equal(await adapter.collectRustTransferVersions(f.repo, [f.version], [], 'export'), undefined);
    assert.equal(calls, 0, 'native eligibility must not invoke a custom raw hook');
    await assert.rejects(f.repo.loadManyRaw([]), (actual) => actual === error);
  });
  assert.equal(calls, 1);
});

test('custom Version reference getters decline before observing extension callbacks', async (t) => {
  const f = await setup(t);
  let calls = 0;
  const descriptor = Object.getOwnPropertyDescriptor(f.version, 'files');
  Object.defineProperty(f.version, 'files', {
    configurable: true,
    enumerable: true,
    get() {
      calls++;
      throw new Error('custom file projection');
    },
  });
  await adapter.withRustTransferOperation(async () => {
    assert.equal(await adapter.collectRustTransferVersions(f.repo, [f.version], [], 'export'), undefined);
    assert.equal(calls, 0, 'native projection must not evaluate custom metadata getters');
  });
  Object.defineProperty(f.version, 'files', descriptor);
});

test('missing and crashing helpers leave canonical object bytes and ordering available for replay', async (t) => {
  const f = await setup(t);
  const expected = publicItems(await f.repo.loadManyRaw([f.version.hash(), ...f.version.refsWithOptions(false)]));
  for (const executable of [path.join(f.directory, 'missing-helper'), process.execPath]) {
    process.env.BIT_RUST_OBJECT_IMPORT = executable;
    await adapter.withRustTransferOperation(async () => {
      assert.equal(
        await adapter.collectRustTransferVersions(f.repo, [f.version], [], 'export', true, false),
        undefined
      );
      assert.deepEqual(
        publicItems(await f.repo.loadManyRaw([f.version.hash(), ...f.version.refsWithOptions(false)])),
        expected
      );
    });
  }
});

test('ordinary nonempty component dependencies and custom aspect metadata retain exact transfer objects', async (t) => {
  const f = await setup(t);
  const { ComponentID } = installed('@teambit/component-id');
  const dependency = ComponentID.fromString('qualification.dependencies/library@1.2.3');
  const version = new Version({
    ...f.version,
    dependencies: [{ id: dependency, relativePaths: [] }],
    devDependencies: [],
    peerDependencies: [],
    flattenedDependencies: installed('@teambit/component-id').ComponentIdList.fromArray([dependency]),
    extensions: ExtensionDataList.fromModelObject([
      new ExtensionDataEntry(
        undefined,
        ComponentID.fromString('qualification.aspects/custom@2.0.0'),
        undefined,
        { enabled: true },
        { preserved: ['one', 'two'] }
      ),
    ]),
  });
  version._hash = version.calculateHash().toString();
  await f.repo.writeObjectsToTheFS([version]);
  const expected = await f.repo.loadManyRaw([version.hash(), ...version.refsWithOptions(false)]);
  await adapter.withRustTransferOperation(async () => {
    const actual = await adapter.collectRustTransferVersions(
      f.repo,
      [version],
      [version.hash().toString()],
      'export',
      true,
      false
    );
    assert.ok(actual, 'ordinary dependency and custom-aspect metadata must qualify');
    assert.deepEqual(
      publicItems(actual).map(({ type, ...item }) => item),
      publicItems(expected).map(({ type, ...item }) => item)
    );
  });
});

test('cancelling tar output during a delayed archive reply avoids fallback body hydration and releases ownership', async (t) => {
  const f = await setup(t);
  const recovery = require(
    path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
  ).MaterializationSession.prototype;
  const request = recovery.request;
  let releaseReply;
  let entered;
  const requested = new Promise((resolve) => {
    entered = resolve;
  });
  const delayed = new Promise((resolve) => {
    releaseReply = resolve;
  });
  let items;
  recovery.request = async function (build, ...args) {
    const requestInput = JSON.parse(build(0).subarray(12));
    if (requestInput.kind !== 'transferArchive') return request.call(this, build, ...args);
    entered();
    await delayed;
    return undefined;
  };
  try {
    await adapter.withRustTransferOperation(async () => {
      items = await adapter.collectRustTransferVersions(f.repo, [f.version], [f.head], 'export', true, false);
      assert.ok(items);
      const list = new ObjectList(items);
      assert.equal(await adapter.prepareRustTransferList(list), true);
      const output = list.toTar();
      await requested;
      const closed = new Promise((resolve) => output.once('close', resolve));
      output.destroy();
      await closed;
      releaseReply();
      await new Promise((resolve) => setImmediate(resolve));
      for (const item of items) assert.equal(typeof Object.getOwnPropertyDescriptor(item, 'buffer').get, 'function');
    });
  } finally {
    recovery.request = request;
  }
  assert.equal(
    adapter.rustTransferObjectsHash(new ObjectList(items)),
    undefined,
    'owner state is unavailable after operation cleanup'
  );
});

test('own and inherited file-ref getters decline without invoking metadata hooks', async (t) => {
  const f = await setup(t);
  let calls = 0;
  for (const inherited of [false, true]) {
    const row = { ...f.version.files[0] };
    delete row.file;
    const target = inherited ? {} : row;
    Object.defineProperty(target, 'file', {
      enumerable: true,
      get() {
        calls++;
        throw new Error('custom file ref');
      },
    });
    if (inherited) Object.setPrototypeOf(row, target);
    const files = f.version.files;
    f.version.files = [row, ...files.slice(1)];
    await adapter.withRustTransferOperation(async () => {
      assert.equal(await adapter.collectRustTransferVersions(f.repo, [f.version], [], 'export'), undefined);
    });
    f.version.files = files;
  }
  assert.equal(calls, 0);
});

test('concurrent collections share exactly one private owner directory', async (t) => {
  const f = await setup(t);
  const recovery = require(
    path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
  ).MaterializationSession.prototype;
  const original = recovery.request;
  const directories = [];
  const sessions = new Set();
  recovery.request = function (build, ...args) {
    const input = JSON.parse(build(0).subarray(12));
    if (input.kind === 'transferCollect') {
      directories.push(input.stagingDirectory);
      sessions.add(this);
    }
    return original.call(this, build, ...args);
  };
  try {
    await adapter.withRustTransferOperation(async () => {
      const collections = await Promise.all(
        Array.from({ length: 4 }, () =>
          adapter.collectRustTransferVersions(f.repo, [f.version], [f.head], 'export', true, false)
        )
      );
      assert.ok(collections.every(Boolean));
      assert.equal(directories.length, 4);
      assert.equal(new Set(directories).size, 1);
      assert.equal(sessions.size, 1, 'one pinned helper owns every collection token');
    });
  } finally {
    recovery.request = original;
  }
  await assert.rejects(fs.stat(directories[0]), { code: 'ENOENT' });
});

test('genuine Builder ArtifactFiles are collected with Source bytes and scoped artifact ordering', async (t) => {
  const f = await setup(t);
  const { ArtifactFiles } = installed('@teambit/component.sources');
  const Source = load('models/source').default;
  const artifact = new Source(Buffer.from('artifact output\n'));
  const version = new Version({
    ...f.version,
    dependencies: [],
    devDependencies: [],
    peerDependencies: [],
    extensions: new ExtensionDataList(
      new ExtensionDataEntry(
        undefined,
        undefined,
        'teambit.pipelines/builder',
        {},
        {
          artifacts: [
            {
              name: 'dist',
              generatedBy: 'qualification',
              task: { id: 'teambit.compilation/compiler', name: 'compile' },
              files: new ArtifactFiles([], [], [{ relativePath: 'dist/index.js', ref: artifact.hash() }]),
            },
          ],
        }
      )
    ),
  });
  version._hash = version.calculateHash().toString();
  await f.repo.writeObjectsToTheFS([artifact, version]);
  const expected = await f.repo.loadManyRaw([version.hash(), ...version.refsWithOptions(false, true)]);
  await adapter.withRustTransferOperation(async () => {
    const actual = await adapter.collectRustTransferVersions(
      f.repo,
      [version],
      [version.hash().toString()],
      'export',
      true,
      true
    );
    assert.ok(actual, 'ordinary ArtifactFiles must qualify');
    assert.deepEqual(
      publicItems(actual).map(({ type, ...item }) => item),
      publicItems(expected).map(({ type, ...item }) => item)
    );
  });
  const artifactRow = version.extensions[0].data.artifacts[0].files.refs[0];
  const artifactRef = Object.getOwnPropertyDescriptor(artifactRow, 'ref');
  let artifactGetterCalls = 0;
  const artifactError = new Error('custom nested artifact ref');
  Object.defineProperty(artifactRow, 'ref', {
    configurable: true,
    enumerable: true,
    get() {
      artifactGetterCalls++;
      throw artifactError;
    },
  });
  await adapter.withRustTransferOperation(async () => {
    assert.equal(await adapter.collectRustTransferVersions(f.repo, [version], [], 'export'), undefined);
    assert.equal(artifactGetterCalls, 0);
    assert.throws(
      () => version.refsWithOptions(false, true),
      (error) => error === artifactError
    );
  });
  Object.defineProperty(artifactRow, 'ref', artifactRef);
  assert.equal(artifactGetterCalls, 1);
  await fs.unlink(f.repo.objectPath(artifact.hash().toString()));
  await adapter.withRustTransferOperation(async () => {
    assert.equal(
      await adapter.collectRustTransferVersions(f.repo, [version], [version.hash().toString()], 'export', true, true),
      undefined,
      'missing local artifact declines to canonical typed error'
    );
    await assert.rejects(f.repo.loadManyRaw([artifact.hash()]), (error) => error.code === 'ENOENT');
  });
  for (const [changed, strict] of [
    [[version.hash().toString()], false],
    [[], true],
  ]) {
    await adapter.withRustTransferOperation(async () => {
      const actual = await adapter.collectRustTransferVersions(f.repo, [version], changed, 'export', strict, true);
      assert.ok(actual, 'non-strict or already-exported missing artifacts are omitted');
      assert.deepEqual(
        publicItems(actual).map(({ type, ...item }) => item),
        publicItems(expected.filter((item) => item.ref.toString() !== artifact.hash().toString())).map(
          ({ type, ...item }) => item
        )
      );
    });
  }
});

test('private staging creation failure declines before native work and preserves canonical replay', async (t) => {
  const f = await setup(t);
  const io = installed('fs-extra');
  const original = io.mkdtemp;
  let calls = 0;
  io.mkdtemp = async () => {
    calls++;
    throw Object.assign(new Error('private staging denied'), { code: 'EACCES' });
  };
  try {
    await adapter.withRustTransferOperation(async () => {
      assert.equal(
        await adapter.collectRustTransferVersions(f.repo, [f.version], [f.head], 'export', true, false),
        undefined
      );
      assert.ok((await f.repo.loadManyRaw([f.version.hash(), ...f.version.refsWithOptions(false, false)])).length > 1);
    });
  } finally {
    io.mkdtemp = original;
  }
  assert.equal(calls, 1);
});

test('outer fetch tar cancellation during initialization avoids canonical buffers and completes producer ownership', async (t) => {
  const f = await setup(t);
  const { Readable } = require('node:stream');
  const Session = require(
    path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
  ).MaterializationSession;
  const original = Session.prototype.request;
  let entered, release;
  const requested = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  Session.prototype.request = async function (build, ...args) {
    const input = JSON.parse(build(0).subarray(12));
    if (input.kind !== 'transferInitialize') return original.call(this, build, ...args);
    entered();
    await gate;
    return undefined;
  };
  const input = new Readable({ objectMode: true, read() {} });
  adapter.registerRustTransferReadable(input);
  let fallback = 0,
    items;
  const output = adapter.rustTransferReadableTar(input, 'qualification.remote', () => {
    fallback++;
    throw new Error('cancelled fallback');
  });
  const producing = adapter.withRustTransferReadable(input, async () => {
    items = await adapter.collectRustTransferVersions(f.repo, [f.version], [f.head], 'export', true, false);
    assert.ok(items);
    for (const item of items) input.push(item);
    input.push(null);
  });
  try {
    await requested;
    const closed = new Promise((resolve) => output.once('close', resolve));
    output.destroy();
    await closed;
    release();
    await producing;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fallback, 0);
    for (const item of items) assert.equal(typeof Object.getOwnPropertyDescriptor(item, 'buffer').get, 'function');
  } finally {
    Session.prototype.request = original;
  }
});

test('empty objects-fetch probe returns canonical empty collection without retiring the transfer owner', async (t) => {
  const f = await setup(t);
  await adapter.withRustTransferOperation(async () => {
    assert.deepEqual(await adapter.collectRustTransferObjects(f.repo, [], true), []);
    const collected = await adapter.collectRustTransferVersions(f.repo, [f.version], [f.head], 'export', true, false);
    assert.ok(collected, 'later Source collection must retain the same usable owner');
  });
});

test('all-missing graceful object probe acknowledges an empty result and preserves later native effects', async (t) => {
  const f = await setup(t);
  const missing = [new Ref('e'.repeat(40)), new Ref('f'.repeat(40))];
  assert.deepEqual(await f.repo.loadManyRawIgnoreMissing(missing), []);
  await adapter.withRustTransferOperation(async () => {
    assert.deepEqual(await adapter.collectRustTransferObjects(f.repo, missing, true), []);
    assert.ok(await adapter.collectRustTransferVersions(f.repo, [f.version], [f.head], 'export', true, false));
  });
});

test('public object fetch preserves missing warning order, duplicate refs and original item identity', async (t) => {
  const f = await setup(t);
  const { Scope } = installed('@teambit/legacy.scope');
  adapter.registerRustTransferClass('Scope', Scope, ['getObjectItem']);
  const scope = Object.create(Scope.prototype);
  scope.objects = f.repo;
  const { ObjectsReadableGenerator } = load('objects/objects-readable-generator');
  const logger = installed('@teambit/legacy.logger').logger;
  const sink = logger.logger;
  const originalWarn = sink.warn;
  const Session = require(
    path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
  ).MaterializationSession;
  const originalRequest = Session.prototype.request;
  let collectRequests = 0;
  Session.prototype.request = function (build, ...args) {
    if (JSON.parse(build(0).subarray(12)).kind === 'transferCollect') collectRequests++;
    return originalRequest.call(this, build, ...args);
  };
  const refs = [
    new Ref('e'.repeat(40)),
    new Ref(f.head),
    new Ref('f'.repeat(40)),
    new Ref('e'.repeat(40)),
    new Ref(f.head),
  ];
  const run = async (flag, repo = f.repo) => {
    process.env.BIT_RUST_CLIENT_VCS = flag;
    const warnings = [];
    sink.warn = (...args) => warnings.push(args);
    let callbacks = 0;
    const generator = new ObjectsReadableGenerator(repo, (error) => {
      assert.equal(error, undefined);
      callbacks++;
    });
    const collected = [];
    const consuming = (async () => {
      for await (const item of generator.readable) {
        collected.push({ original: item, value: publicItems([item])[0] });
      }
    })();
    await generator.pushObjects(refs, scope);
    await consuming;
    assert.equal(callbacks, 1);
    assert.equal(collected.length, 1);
    assert.equal(collected[0].original.ref, refs[1]);
    assert.equal(Object.hasOwn(collected[0].original, 'type'), false);
    return { warnings, items: collected.map((item) => item.value) };
  };
  try {
    const canonical = await run('off');
    assert.equal(canonical.warnings.length, 3);
    assert.deepEqual(await run('on'), canonical);
    assert.equal(collectRequests, 1, 'ordinary public fetch must use native collection');
    // Canonical Scope reads its own repository, even when the generator has a different one.
    const unrelated = Object.create(Repository.prototype);
    assert.deepEqual(await run('on', unrelated), canonical);
    assert.equal(collectRequests, 1, 'mismatched Scope repository must decline before native collection');
  } finally {
    sink.warn = originalWarn;
    Session.prototype.request = originalRequest;
  }
});
