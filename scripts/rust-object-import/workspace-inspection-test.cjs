const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { source, installed, root } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_WORKSPACE_INSPECTION_COMPILED === '1';
const base = path.dirname(installed.resolve('@teambit/component.sources'));
const adapter = compiled
  ? require(path.join(base, 'rust-workspace-inspection.js'))
  : source('scopes/component/sources/rust-workspace-inspection.ts');
const Session = compiled
  ? require(path.join(base, 'rust-workspace-materializer.js')).MaterializationSession
  : source('scopes/component/sources/rust-workspace-materializer.ts').MaterializationSession;
const sha1 = (bytes) => createHash('sha1').update(bytes).digest('hex');
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-inspection-test-'));
  const oldFlag = process.env.BIT_RUST_CLIENT_VCS,
    oldHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT =
    process.env.BIT_TEST_OBJECT_IMPORT ||
    path.join(root, 'native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true });
    if (oldFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = oldFlag;
    if (oldHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = oldHelper;
  });
  return directory;
}
const beginReply = (data) => typeof data?.token === 'string' && Array.isArray(data.files);
const filesReply = (data) => typeof data?.modified === 'boolean' && Array.isArray(data.statuses);
const finishReply = (data) => data?.finished === true;
test('parallel component loading returns request order while retaining completion-order cache effects', async () => {
  const { ComponentLoader } = compiled
    ? require(path.join(path.dirname(installed.resolve('@teambit/legacy.consumer-component')), 'component-loader.js'))
    : source('components/legacy/consumer-component/component-loader.ts');
  const { ComponentID, ComponentIdList } = installed('@teambit/component-id');
  const ids = ['first', 'second', 'cached'].map((name) =>
    ComponentID.fromObject({ name, scope: 'qualification.inspection', version: '1.0.0' })
  );
  const components = ids.map((id) => ({ id }));
  const cache = new Map([[ids[2].toString(), components[2]]]);
  const effects = [];
  const pending = new Map();
  let started;
  const bothStarted = new Promise((resolve) => {
    started = resolve;
  });
  const loader = Object.create(ComponentLoader.prototype);
  loader.consumer = { bitmapIdsFromCurrentLaneIncludeRemoved: ComponentIdList.fromArray(ids) };
  loader.componentsCache = {
    get: (key) => cache.get(key),
    set: (key, value) => {
      effects.push(key);
      cache.set(key, value);
    },
  };
  loader.shouldRunInParallel = async () => true;
  loader.loadOne = (id) =>
    new Promise((resolve) => {
      pending.set(id.toString(), resolve);
      if (pending.size === 2) started();
    });
  const loading = loader.loadMany(ComponentIdList.fromArray(ids));
  await bothStarted;
  pending.get(ids[1].toString())(components[1]);
  await new Promise((resolve) => setImmediate(resolve));
  pending.get(ids[0].toString())(components[0]);
  const result = await loading;
  assert.deepEqual(effects, [ids[1].toString(), ids[0].toString()], 'cache effects still follow actual completion');
  assert.deepEqual(result.components, components, 'loaded rows follow requests, followed by existing cache rows');
  result.components.forEach((component, index) => assert.equal(component, components[index]));
  assert.deepEqual(result.invalidComponents, []);
  assert.deepEqual(result.removedComponents, []);
});
test('retained inspection snapshots preserve canonical bytes, ordered files and normalized hashes', async (t) => {
  const directory = await fixture(t),
    snapshots = path.join(directory, 'snapshots');
  await fs.mkdir(snapshots);
  const bodies = [
    Buffer.from('\ufeffUnicode Ω🌱\r\n'),
    Buffer.from([0, 255, 13, 10, 1]),
    Buffer.from("\ufeffconst message = 'Unicode Ω🌱';\r\nmodule.exports = message;\r\n"),
  ];
  const files = [];
  for (const [index, body] of bodies.entries()) {
    const filename = path.join(directory, `source-${index}`);
    await fs.writeFile(filename, body);
    files.push({ relativePath: `source-${index}`, path: filename });
  }
  const requests = [],
    request = Session.prototype.request;
  Session.prototype.request = async function (build, ...args) {
    const frame = build(1);
    if (frame.subarray(0, 4).toString() === 'BMT1')
      requests.push({ owner: this, input: JSON.parse(frame.subarray(12)) });
    return request.call(this, build, ...args);
  };
  t.after(() => {
    Session.prototype.request = request;
  });
  await adapter.withRustWorkspaceInspection(async () => {
    const begin = await adapter.requestRustWorkspaceInspection(
      { kind: 'inspectionBegin', files, workspaceRoot: false, snapshotDirectory: snapshots },
      beginReply
    );
    assert.equal(begin?.count, bodies.length, 'actual Native Begin must accept the ordinary fixture');
    assert.deepEqual(
      begin.files.map((file) => file.relativePath),
      files.map((file) => file.relativePath)
    );
    const canonical = bodies.map((body) =>
      body.subarray(body.subarray(0, 3).equals(Buffer.from([239, 187, 191])) ? 3 : 0)
    );
    const normalized = canonical.map((body) => installed('@teambit/toolbox.string.eol').lf(body));
    for (const [index, file] of begin.files.entries()) {
      assert.equal(file.rawHash, sha1(bodies[index]));
      assert.equal(file.linuxHash, sha1(normalized[index]));
      assert.equal(file.snapshotHash, sha1(canonical[index]));
      assert.deepEqual(await fs.readFile(file.snapshotPath), canonical[index]);
      await fs.writeFile(files[index].path, 'late disk mutation');
    }
    // Canonical loading happens before a public model callback: a later disk change must not replace its bytes.
    const result = await adapter.requestRustWorkspaceInspection(
      {
        kind: 'inspectionFiles',
        token: begin.token,
        modelFiles: begin.files.map((file) => ({ relativePath: file.relativePath, hash: file.linuxHash })),
      },
      filesReply
    );
    assert.equal(result?.modified, false);
    assert.deepEqual(
      result.statuses.map((file) => file.status),
      bodies.map(() => 'unchanged')
    );
    const changed = await adapter.requestRustWorkspaceInspection(
      {
        kind: 'inspectionFiles',
        token: begin.token,
        modelFiles: [
          { relativePath: 'source-0', hash: 'a'.repeat(40) },
          { relativePath: 'removed', hash: 'b'.repeat(40) },
        ],
      },
      filesReply
    );
    assert.equal(changed?.modified, true);
    assert.ok(changed.statuses.some((file) => file.relativePath === 'removed' && file.status === 'deleted'));
    assert.ok(changed.statuses.some((file) => file.relativePath === 'source-1' && file.status === 'new'));
    assert.equal(
      (await adapter.requestRustWorkspaceInspection({ kind: 'inspectionFinish', token: begin.token }, finishReply))
        ?.finished,
      true
    );
  });
  assert.equal(
    new Set(requests.map((row) => row.owner)).size,
    1,
    'all retained token requests must share the pinned owner'
  );
});
test('nested inspection operations preserve the original public error and dispose their one owner', async (t) => {
  await fixture(t);
  const failure = new Error('public model callback failed'),
    owners = [];
  const request = Session.prototype.request;
  Session.prototype.request = async function (build, ...args) {
    owners.push(this);
    return request.call(this, build, ...args);
  };
  t.after(() => {
    Session.prototype.request = request;
  });
  let effects = 0;
  await assert.rejects(
    adapter.withRustWorkspaceInspection(() =>
      adapter.withRustWorkspaceInspection(async () => {
        effects++;
        throw failure;
      })
    ),
    (error) => error === failure
  );
  assert.equal(effects, 1);
});

test('external body observer detects main Node and libuv reads while excluding another process', async (t) => {
  if (process.platform !== 'linux') {
    t.skip('Linux strace diagnostic only');
    return;
  }
  const cp = require('node:child_process');
  if (cp.spawnSync('strace', ['--version']).status !== 0) {
    t.skip('strace unavailable');
    return;
  }
  const directory = await fixture(t),
    filename = path.join(directory, 'controlled-source'),
    trace = path.join(directory, 'control.strace');
  const bytes = Buffer.from('known synchronous and worker Source body');
  await fs.writeFile(filename, bytes);
  const childProgram = `require('node:fs').readFileSync(${JSON.stringify(filename)})`;
  const program = `const fs=require('node:fs');fs.readFileSync(${JSON.stringify(filename)});fs.promises.readFile(${JSON.stringify(filename)}).then(()=>require('node:child_process').spawnSync(process.execPath,['-e',${JSON.stringify(childProgram)}]));`;
  cp.execFileSync('strace', [
    '-f',
    '-yy',
    '-s',
    '32',
    '-e',
    'trace=execve,clone,clone3,read,pread64',
    '-o',
    trace,
    process.execPath,
    '-e',
    program,
  ]);
  const observed = await require('./workspace-inspection-body-read.cjs').observe(trace, [filename]);
  assert.equal(observed.bytes, bytes.length * 2, 'both Node reads count; child process read must be excluded');
  assert.ok(observed.reads.some((read) => read.thread === observed.nodePid));
  assert.ok(
    observed.reads.some((read) => read.thread !== observed.nodePid),
    'libuv worker thread must be included'
  );
});

function preparedModules() {
  const workspaceBase = path.dirname(installed.resolve('@teambit/workspace'));
  return {
    files: compiled
      ? require(path.join(workspaceBase, 'rust-files-inspection.js'))
      : source('scopes/workspace/workspace/rust-files-inspection.ts'),
    CompFiles: compiled
      ? require(path.join(workspaceBase, 'workspace-component/comp-files.js')).CompFiles
      : source('scopes/workspace/workspace/workspace-component/comp-files.ts').CompFiles,
    sources: installed('@teambit/component.sources'),
    objects: installed('@teambit/objects'),
    ids: installed('@teambit/component-id'),
  };
}
test('later model callbacks can mutate earlier Ref aliases before the shared synchronous comparison boundary', async (t) => {
  const directory = await fixture(t),
    { files, CompFiles, sources, objects, ids } = preparedModules();
  const earlierRef = new objects.Ref(sha1(Buffer.from('earlier\n'))),
    effects = [],
    plans = [];
  await sources.withRustWorkspaceInspection(async () => {
    for (const name of ['earlier', 'later']) {
      const componentDir = path.join(directory, name);
      await fs.mkdir(componentDir);
      const filename = path.join(componentDir, 'index.js'),
        body = Buffer.from(`${name}\n`);
      await fs.writeFile(filename, body);
      const id = ids.ComponentID.fromString(`qualification.inspection/${name}@1.0.0`),
        model = new objects.Version({
          mainFile: 'index.js',
          files: [
            {
              relativePath: 'index.js',
              name: 'index.js',
              test: false,
              file: name === 'earlier' ? earlierRef : new objects.Ref(sha1(body)),
            },
          ],
          log: { message: 'model', date: '1' },
          dependencies: [],
          devDependencies: [],
        }).files;
      const plan = await files.inspectTrackedWorkspaceFiles(
        {
          id,
          compDir: componentDir,
          files: [{ relativePath: 'index.js', path: filename }],
          workspaceRoot: false,
          unchanged: () => true,
          loadModelFiles: async () => {
            effects.push(`model-${name}`);
            if (name === 'later') earlierRef.hash = 'a'.repeat(40);
            return model;
          },
          fallback: (contents, models) =>
            new CompFiles(
              id,
              {},
              contents.map(
                (buffer) =>
                  new sources.SourceFile({ cwd: componentDir, base: componentDir, path: filename, contents: buffer })
              ),
              componentDir,
              models
            ),
        },
        'modified'
      );
      assert.ok(plan, 'ordinary real token plan must qualify');
      plans.push(plan);
    }
    assert.deepEqual(effects, ['model-earlier', 'model-later']);
    const prepared = plans.map((plan) => plan.prepareRead());
    const results = [];
    for (const [index, plan] of prepared.entries()) {
      results.push(await plan.native());
      effects.push(`read-${index}`);
    }
    assert.deepEqual(
      results.map((result) => result.modified),
      [true, false],
      'first model Ref mutation must be visible at final comparison'
    );
    assert.deepEqual(effects, ['model-earlier', 'model-later', 'read-0', 'read-1']);
    for (const plan of plans) await plan.release();
  });
});
test('custom model hash getters are invoked only by the canonical synchronous comparison', async (t) => {
  const directory = await fixture(t),
    { files, CompFiles, sources, objects, ids } = preparedModules(),
    filename = path.join(directory, 'index.js'),
    body = Buffer.from('guarded\n');
  await fs.writeFile(filename, body);
  const id = ids.ComponentID.fromString('qualification.inspection/guarded@1.0.0'),
    ref = new objects.Ref(sha1(body));
  let getters = 0,
    loads = 0;
  Object.defineProperty(ref, 'hash', {
    configurable: true,
    enumerable: true,
    get() {
      getters++;
      return sha1(body);
    },
  });
  await sources.withRustWorkspaceInspection(async () => {
    const plan = await files.inspectTrackedWorkspaceFiles(
      {
        id,
        compDir: directory,
        files: [{ relativePath: 'index.js', path: filename }],
        workspaceRoot: false,
        unchanged: () => true,
        loadModelFiles: async () => {
          loads++;
          return [{ relativePath: 'index.js', file: ref }];
        },
        fallback: (contents, models) =>
          new CompFiles(
            id,
            {},
            [new sources.SourceFile({ cwd: directory, base: directory, path: filename, contents: contents[0] })],
            directory,
            models
          ),
      },
      'modified'
    );
    assert.ok(plan);
    const prepared = plan.prepareRead();
    assert.equal(prepared.native, undefined);
    assert.equal(getters, 0, 'projection must never invoke the custom getter');
    assert.equal(prepared.canonical().modified, false);
    assert.equal(getters, 1);
    assert.equal(loads, 1);
    await plan.release();
  });
});

test('helper death after the model callback reuses captured bytes and never repeats its public prefix', async (t) => {
  const directory = await fixture(t),
    { files, CompFiles, sources, objects, ids } = preparedModules(),
    filename = path.join(directory, 'index.js'),
    body = Buffer.from('captured\n');
  await fs.writeFile(filename, body);
  const id = ids.ComponentID.fromString('qualification.inspection/death@1.0.0');
  const version = new objects.Version({
    mainFile: 'index.js',
    files: [{ relativePath: 'index.js', name: 'index.js', test: false, file: new objects.Ref(sha1(body)) }],
    log: { message: 'model', date: '1' },
    dependencies: [],
    devDependencies: [],
  });
  let models = 0,
    fallbacks = 0;
  await sources.withRustWorkspaceInspection(async () => {
    const plan = await files.inspectTrackedWorkspaceFiles(
      {
        id,
        compDir: directory,
        files: [{ relativePath: 'index.js', path: filename }],
        workspaceRoot: false,
        unchanged: () => true,
        loadModelFiles: async () => {
          models++;
          await fs.writeFile(filename, 'changed after captured read');
          await sources.retireRustWorkspaceInspection();
          return version.files;
        },
        fallback: (contents, modelFiles) => {
          fallbacks++;
          return new CompFiles(
            id,
            {},
            [new sources.SourceFile({ cwd: directory, base: directory, path: filename, contents: contents[0] })],
            directory,
            modelFiles
          );
        },
      },
      'modified'
    );
    assert.ok(plan);
    const ready = plan.prepareRead();
    assert.equal(ready.native, undefined);
    assert.equal(
      ready.canonical().modified,
      false,
      'fallback must use the read before public callback, not live mutated disk'
    );
    assert.equal(models, 1);
    assert.equal(fallbacks, 1);
    assert.equal(sources.isRustWorkspaceInspection(), false);
    await plan.release();
  });
});
test('a custom hasVersion hook runs before its canonical file comparison and stays observable', async (t) => {
  const directory = await fixture(t),
    { CompFiles, sources, objects, ids } = preparedModules();
  const workspaceModule = compiled
    ? require(path.join(path.dirname(installed.resolve('@teambit/workspace')), 'workspace.js'))
    : source('scopes/workspace/workspace/workspace.ts');
  const Workspace = workspaceModule.Workspace;
  const workspace = Object.create(Workspace.prototype),
    events = [];
  const id = ids.ComponentID.fromString('qualification.inspection/hook@1.0.0'),
    body = Buffer.from('original\n'),
    ref = new objects.Ref(sha1(body));
  const model = [{ relativePath: 'index.js', file: ref }],
    file = new sources.SourceFile({
      cwd: directory,
      base: directory,
      path: path.join(directory, 'index.js'),
      contents: body,
    });
  id.hasVersion = function () {
    events.push('hasVersion');
    ref.hash = 'a'.repeat(40);
    return true;
  };
  const comp = new CompFiles(id, {}, [file], directory, model),
    original = CompFiles.prototype.isModified;
  CompFiles.prototype.isModified = function () {
    events.push('isModified');
    return original.call(this);
  };
  workspace.getFilesModification = async () => {
    events.push('model');
    return comp;
  };
  try {
    const results = await workspace.withFilesInspection([id], 'modified', async (files) => files, {
      run: (item) => item.hasVersion(),
      ordinary: () => false,
    });
    assert.equal(results[0].modified, true);
    assert.deepEqual(events, ['model', 'hasVersion', 'isModified']);
  } finally {
    CompFiles.prototype.isModified = original;
  }
});
test('the public SourceFile export cannot replace a constructor or reader behind native eligibility', async (t) => {
  await fixture(t);
  const sources = installed('@teambit/component.sources'),
    entry = require(path.join(base, 'source-file.js')),
    original = Object.getOwnPropertyDescriptor(entry, 'default');
  let getters = 0;
  class Replacement extends original.value {}
  Object.defineProperty(Replacement, 'load', {
    get() {
      getters++;
      return original.value.load;
    },
  });
  Object.defineProperty(entry, 'default', { ...original, value: Replacement });
  try {
    assert.equal(sources.SourceFile, Replacement);
    assert.equal(sources.canReadWorkspaceFilesNatively(), false);
    assert.equal(getters, 0, 'private guard must not invoke the custom reader getter');
    void sources.SourceFile.load;
    assert.equal(getters, 1);
  } finally {
    Object.defineProperty(entry, 'default', original);
  }
  Object.defineProperty(entry, 'default', {
    configurable: true,
    enumerable: true,
    get() {
      getters++;
      return original.value;
    },
  });
  try {
    assert.equal(sources.canReadWorkspaceFilesNatively(), false);
    assert.equal(getters, 1, 'private export identity check must not invoke the new export getter');
  } finally {
    Object.defineProperty(entry, 'default', original);
  }
});

function semanticFixture(mode, change) {
  const objects = installed('@teambit/objects'),
    components = installed('@teambit/legacy.consumer-component'),
    ids = installed('@teambit/component-id'),
    extensions = installed('@teambit/legacy.extension-data');
  const modelIds = [
    ids.ComponentID.fromString('qualification.inspection/z-dependency@1.0.0'),
    ids.ComponentID.fromString('qualification.inspection/a-dependency@2.0.0'),
  ];
  const deps = new components.Dependencies(modelIds.map((id) => new components.Dependency(id, [])));
  const fsDeps = new components.Dependencies(
    modelIds.map((id) => new components.Dependency(id.changeVersion(undefined), []))
  );
  const makeFiles = () => [
    { relativePath: 'z.js', name: 'z.js', test: false, file: new objects.Ref('1'.repeat(40)) },
    { relativePath: 'a.js', name: 'a.js', test: false, file: new objects.Ref('2'.repeat(40)) },
  ];
  const extension = () =>
    new extensions.ExtensionDataEntry(
      undefined,
      ids.ComponentID.fromString('qualification.inspection/custom@1.0.0'),
      undefined,
      { enabled: true },
      {}
    );
  const left = new objects.Version({
    mainFile: 'a.js',
    files: makeFiles(),
    log: { message: 'model log', date: '1' },
    dependencies: deps.get(),
    devDependencies: [],
    extensions: extensions.ExtensionDataList.fromArray([extension()]),
    packageDependencies: { z: '^2.0.0', a: '^1.0.0' },
    overrides: { dependencies: { z: '^2', a: '^1' } },
    bindingPrefix: '@bit',
  });
  const right = new objects.Version({
    mainFile: 'a.js',
    files: makeFiles(),
    log: { message: 'temporary log', date: '2' },
    dependencies: fsDeps.getClone(),
    devDependencies: [],
    extensions: extensions.ExtensionDataList.fromArray([extension()]),
    packageDependencies: { a: '^1.0.0', z: change === 'metadata' ? '^3.0.0' : '^2.0.0' },
    overrides: { dependencies: { a: '^1', z: '^2' } },
    bindingPrefix: '@bit',
  });
  assert.equal(
    Object.getPrototypeOf(right.dependencies.get()[0]),
    Object.prototype,
    'genuine getClone records are plain DATA'
  );
  if (change === 'files') right.files[0].file = new objects.Ref('3'.repeat(40));
  if (mode === 'modified') {
    right.files[0].name = 'deprecated different name';
    right.files[0].test = true;
  }
  const filesystem = new components.ConsumerComponent({
    name: 'component',
    scope: 'qualification.inspection',
    version: '1.0.0',
    mainFile: 'a.js',
    files: [],
    dependencies: [],
    devDependencies: [],
  });
  let conversions = 0,
    ignored = 0;
  Object.defineProperty(left, 'docs', {
    configurable: true,
    get() {
      ignored++;
      throw new Error('unused docs read');
    },
  });
  Object.defineProperty(left.extensions[0], 'data', {
    configurable: true,
    get() {
      ignored++;
      throw new Error('unused artifact/data read');
    },
  });
  const context = {
    scope: {
      sources: {
        consumerComponentToVersion: async (component) => {
          conversions++;
          right.log = component.log;
          return { version: right };
        },
      },
    },
  };
  return {
    left,
    right,
    filesystem,
    context,
    modelIds,
    get conversions() {
      return conversions;
    },
    get ignored() {
      return ignored;
    },
  };
}
test('public Consumer semantic and source-code operations retain canonical aliases and one conversion', async (t) => {
  await fixture(t);
  const Consumer = compiled
    ? installed('@teambit/legacy.consumer').Consumer
    : source('components/legacy/consumer/consumer.ts').default;
  const NativeSession = require(path.join(base, 'rust-workspace-materializer.js')).MaterializationSession,
    request = NativeSession.prototype.request;
  let frames = 0;
  NativeSession.prototype.request = async function (build, ...args) {
    const frame = build(1);
    if (frame.subarray(0, 4).toString() === 'BMT1' && JSON.parse(frame.subarray(12)).kind === 'inspectionCompare')
      frames++;
    return request.call(this, build, ...args);
  };
  t.after(() => {
    NativeSession.prototype.request = request;
  });
  for (const [mode, change, expected] of [
    ['modified', 'same', false],
    ['modified', 'metadata', true],
    ['sourceCode', 'metadata', false],
    ['sourceCode', 'files', true],
  ]) {
    const states = [];
    for (const flag of ['off', 'on']) {
      process.env.BIT_RUST_CLIENT_VCS = flag;
      const f = semanticFixture(mode, change),
        leftFiles = f.left.files,
        rightFiles = f.right.files;
      const method = mode === 'modified' ? 'isComponentModified' : 'isComponentSourceCodeModified';
      const before = frames,
        result = await Consumer.prototype[method].call(f.context, f.left, f.filesystem);
      assert.equal(result, expected, `${flag}/${mode}/${change}`);
      assert.equal(f.conversions, 1);
      assert.equal(f.ignored, 0);
      assert.equal(f.filesystem.log, f.left.log, 'public log alias remains original model log');
      if (flag === 'on')
        assert.equal(frames - before, 1, 'ordinary real getClone data must accept Native semantic operation');
      assert.notEqual(f.left.files, leftFiles);
      assert.notEqual(f.right.files, rightFiles);
      if (mode === 'modified') {
        for (const dep of f.right.dependencies.get())
          assert.ok(
            f.modelIds.includes(dep.id),
            'model ComponentID aliases must be reused for versionless FS dependencies'
          );
        assert.equal(f.filesystem._isModified, expected);
        await Consumer.prototype[method].call(f.context, f.left, f.filesystem);
        assert.equal(f.conversions, 1, 'cached result must not repeat conversion');
      }
      states.push({
        leftFiles: f.left.files.map((file) => ({ ...file, file: file.file.hash })),
        rightFiles: f.right.files.map((file) => ({ ...file, file: file.file.hash })),
        leftPackages: Object.entries(f.left.packageDependencies),
        rightPackages: Object.entries(f.right.packageDependencies),
        leftDeps: f.left.dependencies.get().map((dep) => dep.id.toString()),
        rightDeps: f.right.dependencies.get().map((dep) => dep.id.toString()),
      });
    }
    assert.deepEqual(states[1], states[0], `${mode}/${change} mutation-selector parity`);
  }
});

test('plain getClone dependency getters decline privately and retain canonical hook count', async (t) => {
  await fixture(t);
  const Consumer = compiled
    ? installed('@teambit/legacy.consumer').Consumer
    : source('components/legacy/consumer/consumer.ts').default;
  const NativeSession = require(path.join(base, 'rust-workspace-materializer.js')).MaterializationSession,
    request = NativeSession.prototype.request;
  let frames = 0;
  NativeSession.prototype.request = async function (build, ...args) {
    const frame = build(1);
    if (frame.subarray(0, 4).toString() === 'BMT1' && JSON.parse(frame.subarray(12)).kind === 'inspectionCompare')
      frames++;
    return request.call(this, build, ...args);
  };
  t.after(() => {
    NativeSession.prototype.request = request;
  });
  const counts = [];
  for (const flag of ['off', 'on']) {
    process.env.BIT_RUST_CLIENT_VCS = flag;
    const f = semanticFixture('modified', 'same');
    let getter = 0;
    Object.defineProperty(f.right.dependencies.get()[0], 'relativePaths', {
      configurable: true,
      enumerable: true,
      get() {
        getter++;
        return [];
      },
    });
    assert.equal(await Consumer.prototype.isComponentModified.call(f.context, f.left, f.filesystem), false);
    assert.equal(f.conversions, 1);
    counts.push(getter);
  }
  assert.ok(counts[0] > 0);
  assert.equal(counts[1], counts[0]);
  assert.equal(frames, 0, 'private selected-field capture must refuse a getter before invoking it');
});
test('withFilesInspection retains prepared resources through asynchronous consume completion', async (t) => {
  await fixture(t);
  const module = compiled
      ? require(path.join(path.dirname(installed.resolve('@teambit/workspace')), 'workspace.js'))
      : source('scopes/workspace/workspace/workspace.ts'),
    workspace = Object.create(module.Workspace.prototype),
    events = [];
  const id = installed('@teambit/component-id').ComponentID.fromString('qualification.inspection/lifetime@1.0.0');
  workspace.readComponentFileState = async () => {
    events.push('load');
    return {
      prepareRead: () => ({
        canonical: () => {
          events.push('compare');
          return { id, compDir: 'component', modified: false };
        },
      }),
      release: async () => events.push('release'),
    };
  };
  const result = await workspace.withFilesInspection([id], 'modified', async (summaries) => {
    events.push('consume-start');
    await Promise.resolve();
    assert.ok(!events.includes('release'), 'prepared tokens/resources must remain owned during async callback');
    events.push('consume-end');
    return summaries[0];
  });
  assert.equal(result.modified, false);
  assert.deepEqual(events, ['load', 'compare', 'consume-start', 'consume-end', 'release']);
});

test('real diff binds the retained caller bytes before and after native capture', async (t) => {
  const directory = await fixture(t),
    sourcesBase = base,
    reader = compiled
      ? require(path.join(sourcesBase, 'rust-workspace-reader.js'))
      : source('scopes/component/sources/rust-workspace-reader.ts'),
    checkout = compiled
      ? require(path.join(sourcesBase, 'rust-checkout-source.js'))
      : source('scopes/component/sources/rust-checkout-source.ts'),
    SourceFile = compiled
      ? installed('@teambit/component.sources').SourceFile
      : source('scopes/component/sources/source-file.ts').default;
  const objects = installed('@teambit/objects'),
    repository = await objects.Repository.create({
      scopePath: path.join(directory, 'scope'),
      scopeJson: { name: 'qualification' },
    }),
    stored = new objects.Source(Buffer.from('old source\n'));
  const objectPath = repository.objectPath(stored.hash());
  await fs.mkdir(path.dirname(objectPath), { recursive: true });
  await fs.writeFile(objectPath, require('node:zlib').deflateSync(stored.serialize()));
  const filename = path.join(directory, 'index.js'),
    currentBody = Buffer.from('new source\r\n');
  await fs.writeFile(filename, currentBody);
  const model = await checkout.prepareRustCheckoutSources(
    [{ relativePath: 'index.js', name: 'index.js', test: false, file: stored.hash() }],
    repository
  );
  assert.equal(model?.length, 1);
  const reads = await reader.readRustWorkspaceFiles([filename]);
  assert.equal(reads?.length, 1);
  const current = new SourceFile({ cwd: directory, base: directory, path: filename, contents: reads[0].contents });
  reader.registerRustWorkspaceFile(current, reads[0]);
  const originalRequest = Session.prototype.request;
  let begins = 0,
    diffs = 0,
    mutate = false;
  Session.prototype.request = async function (build, ...args) {
    const frame = build(1),
      input = frame.subarray(0, 4).toString() === 'BMT1' ? JSON.parse(frame.subarray(12)) : undefined;
    const result = await originalRequest.call(this, build, ...args);
    if (input?.kind === 'inspectionBegin') {
      begins++;
      if (mutate) await fs.writeFile(filename, 'changed only after Begin');
    }
    if (input?.kind === 'inspectionDiff') diffs++;
    return result;
  };
  t.after(() => {
    Session.prototype.request = originalRequest;
  });
  await fs.writeFile(filename, 'changed before Begin');
  assert.equal(
    await reader.getRustFilesDiff(model, [current], 'relative', false),
    undefined,
    'prior disk mutation must decline instead of diffing bytes newer than caller snapshot'
  );
  assert.equal(diffs, 0);
  await fs.writeFile(filename, currentBody);
  mutate = true;
  const result = await reader.getRustFilesDiff(model, [current], 'relative', false);
  assert.equal(diffs, 1, 'real retained INS Diff must be accepted');
  assert.ok(begins >= 2);
  assert.equal(result?.length, 1);
  assert.equal(result[0].fromContent, 'old source\n');
  assert.equal(result[0].toContent, currentBody.toString());
  assert.equal(result[0].same, false);
  assert.ok(result[0].rawDiff.includes('new source'));
});

test('malformed snapshot and status replies retire the helper before preserving the canonical prefix', async (t) => {
  const directory = await fixture(t),
    { files, CompFiles, sources, objects, ids } = preparedModules(),
    NativeSession = require(path.join(base, 'rust-workspace-materializer.js')).MaterializationSession,
    request = NativeSession.prototype.request;
  for (const failure of ['inspectionBegin', 'inspectionFiles']) {
    const filename = path.join(directory, `${failure}.js`),
      body = Buffer.from('original\n');
    await fs.writeFile(filename, body);
    const id = ids.ComponentID.fromString(`qualification.inspection/${failure.toLowerCase()}@1.0.0`),
      version = new objects.Version({
        mainFile: 'index.js',
        files: [{ relativePath: 'index.js', name: 'index.js', test: false, file: new objects.Ref(sha1(body)) }],
        log: { message: 'model', date: '1' },
        dependencies: [],
        devDependencies: [],
      });
    let callbacks = 0,
      owner;
    NativeSession.prototype.request = async function (build, count, validate, ...args) {
      const frame = build(1),
        input = frame.subarray(0, 4).toString() === 'BMT1' ? JSON.parse(frame.subarray(12)) : undefined;
      owner = this;
      return request.call(
        this,
        build,
        count,
        (response) => {
          if (input?.kind === failure && response.data) {
            if (failure === 'inspectionBegin') response.data.files[0].relativePath = 'wrong-identity';
            else response.data.statuses = [];
          }
          return validate(response);
        },
        ...args
      );
    };
    try {
      await sources.withRustWorkspaceInspection(async () => {
        const plan = await files.inspectTrackedWorkspaceFiles(
          {
            id,
            compDir: directory,
            files: [{ relativePath: 'index.js', path: filename }],
            workspaceRoot: false,
            unchanged: () => true,
            loadModelFiles: async () => {
              callbacks++;
              return version.files;
            },
            fallback: (contents, models) =>
              new CompFiles(
                id,
                {},
                [
                  new sources.SourceFile({
                    cwd: directory,
                    base: directory,
                    path: path.join(directory, 'index.js'),
                    contents: contents[0],
                  }),
                ],
                directory,
                models
              ),
          },
          'modified'
        );
        if (failure === 'inspectionBegin') {
          assert.equal(plan, undefined);
          assert.equal(callbacks, 0, 'invalid capture must decline before public model lookup');
        } else {
          assert.ok(plan);
          const result = await plan.prepareRead().native();
          assert.equal(result.modified, false);
          assert.equal(callbacks, 1, 'failed status reply must not replay the public model lookup');
          await plan.release();
        }
        assert.equal(owner.usable, false, 'helper must be retired/reaped before canonical continuation');
      });
    } finally {
      NativeSession.prototype.request = request;
    }
  }
});
