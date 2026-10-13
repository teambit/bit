const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { installed } = require('./load-source.cjs');
// This tests the physically compiled producer with untouched defining classes in both CI loader passes.
const objects = installed('@teambit/objects');
const sources = installed('@teambit/component.sources');
const { ConsumerComponent } = installed('@teambit/legacy.consumer-component');
const mergeRoot = path.dirname(installed.resolve('@teambit/component.modules.merge-helper'));
const merge = require(path.join(mergeRoot, 'three-way-merge.js'));
const plans = require(path.join(mergeRoot, 'rust-merge-body-plan.js'));
// The real MergingMain caller imports this public barrel before invoking its apply adapter.
assert.equal(typeof installed('@teambit/component.modules.merge-helper').hasRustMergeRetainedBodyFunctions, 'function');
installed('@teambit/checkout/dist/checkout.main.runtime.js');
const sessionModule = installed('@teambit/component.sources/dist/rust-workspace-materializer.js');
const retainedApply = installed('@teambit/merging/dist/rust-merge-retained-apply.js');

for (const currentOrigin of ['workspace', 'workspace-deleted', 'repository']) {
  test(`genuine retained producer keeps causal aliases and Native apply with ${currentOrigin} current files`, async (t) => {
    const helper = process.env.BIT_TEST_OBJECT_IMPORT;
    assert.ok(helper, 'actual new merge helper is required');
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-merge-producer-'));
    const previous = { flag: process.env.BIT_RUST_CLIENT_VCS, helper: process.env.BIT_RUST_OBJECT_IMPORT };
    process.env.BIT_RUST_CLIENT_VCS = 'on';
    process.env.BIT_RUST_OBJECT_IMPORT = helper;
    const request = sessionModule.MaterializationSession.prototype.request;
    const accepted = [];
    sessionModule.MaterializationSession.prototype.request = function (build, count, validate, ...options) {
      let input;
      return request.call(
        this,
        (id) => {
          const frame = build(id);
          if (frame.subarray(0, 4).toString() === 'BMT1') input = JSON.parse(frame.subarray(12));
          return frame;
        },
        count,
        (response, body) => {
          const valid = validate(response, body);
          if (valid && input?.kind?.startsWith('merge'))
            accepted.push({ kind: input.kind, input, data: response.data, session: this });
          return valid;
        },
        ...options
      );
    };
    t.after(async () => {
      sessionModule.MaterializationSession.prototype.request = request;
      for (const [name, value] of [
        ['BIT_RUST_CLIENT_VCS', previous.flag],
        ['BIT_RUST_OBJECT_IMPORT', previous.helper],
      ]) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      await fs.rm(directory, { recursive: true, force: true });
    });
    const { Scope } = installed('@teambit/legacy.scope');
    const scope = await Scope.ensure(path.join(directory, 'scope'), 'qualification.merge-producer');
    await scope.ensureDir();
    const repository = scope.objects;
    const baseBody = 'first=base\nmiddle=unchanged\nlast=base\n';
    const incomingBody = baseBody.replace('last=base', 'last=incoming');
    const currentBody = baseBody.replace('first=base', 'first=current');
    async function version(contents, hash) {
      const files = [];
      for (const relativePath of ['index.js', 'identical.js']) {
        const source = objects.Source.from(Buffer.from(contents));
        const filename = repository.objectPath(source.hash());
        await fs.mkdir(path.dirname(filename), { recursive: true });
        await fs.writeFile(filename, await source.compress());
        files.push({ name: relativePath, relativePath, test: false, file: source.hash() });
      }
      const version = new objects.Version({
        hash,
        mainFile: 'index.js',
        files,
        log: { date: '1700000000000', message: 'actual retained merge' },
        dependencies: [],
        devDependencies: [],
      });
      const filename = repository.objectPath(version.hash());
      await fs.mkdir(path.dirname(filename), { recursive: true });
      await fs.writeFile(filename, await version.compress());
      return version;
    }
    const base = await version(baseBody, 'a'.repeat(40));
    const other = await version(incomingBody, 'b'.repeat(40));
    const workspace = path.join(directory, 'workspace');
    const filenames = ['index.js', 'identical.js'].map((relative) => path.join(workspace, relative));
    await fs.mkdir(workspace, { recursive: true });
    for (const filename of filenames) await fs.writeFile(filename, currentBody);
    const current = Object.create(ConsumerComponent.prototype);
    let escaped;
    await sources.withRustWorkspaceEngine(async () => {
      const reader = installed('@teambit/component.sources/dist/rust-workspace-reader.js');
      const reads = await reader.readRustWorkspaceFiles(filenames);
      assert.ok(reads);
      current.files = reads.map((read) => {
        const file = new sources.SourceFile({ base: workspace, path: read.path, contents: read.contents });
        sources.registerRustWorkspaceFile(file, read);
        return file;
      });
      if (currentOrigin === 'workspace-deleted') {
        for (const filename of filenames) await fs.rm(filename);
      }
      if (currentOrigin === 'repository') {
        const currentVersion = await version(currentBody, 'c'.repeat(40));
        current.files = await objects.withRustHistoryQueryOperation(() =>
          sources.prepareRustCheckoutSources(currentVersion.files, repository)
        );
        assert.ok(current.files);
        assert.ok(
          current.files.every((file) => !path.isAbsolute(file.path)),
          'model Sources retain relative paths'
        );
      }
      await objects.withRustMergeTransactionOperation(() =>
        objects.withRustMergeTransactionJournal({ mode: 'status', count: 1 }, () =>
          plans.withRustMergeBodyPlanIndex(0, async () => {
            const result = await merge.threeWayMerge({
              scope,
              baseComponent: base,
              otherComponent: other,
              currentComponent: current,
              currentLabel: 'current',
              otherLabel: 'incoming',
            });
            const plan = plans.getRustMergeResultBodyPlan(result);
            assert.ok(plan, 'real producer must retain a native plan, not merely return canonical-equal rows');
            const target = plans.captureNativeMergeTarget(other);
            assert.ok(target);
            const targetFiles = await Promise.all(
              other.files.map((file) => sources.SourceFile.loadFromSourceFileModel(file, repository))
            );
            const clones = targetFiles.map((file) => file.clone());
            assert.strictEqual(
              targetFiles[0].contents,
              targetFiles[1].contents,
              'canonical duplicate Source hash loads share the cached Buffer'
            );
            const applied = await retainedApply.applyRetainedRustMerge(clones, result, plan, target, undefined);
            assert.ok(
              applied,
              `accepted Apply must attach retained bodies rather than fall back after ACK; accepted kinds: ${accepted.map((frame) => frame.kind).join(',')}`
            );
            assert.equal(applied.modifiedFiles.length, 2);
            assert.equal(applied.modifiedFiles[0], clones[0]);
            assert.ok(sources.getRustCheckoutPlanSourceDescriptor(applied.modifiedFiles[0]));
            assert.notStrictEqual(
              applied.modifiedFiles[0].contents,
              applied.modifiedFiles[1].contents,
              'separate merged output occurrences must not collapse Buffer identity because their bytes match'
            );
            assert.ok(accepted.some((frame) => frame.kind === 'mergeApply'));
            assert.equal(result.hasConflicts, false);
            assert.equal(result.modifiedFiles.length, 2);
            // Keep the public lazy rows unread until the owner has removed its private directory.
            escaped = result.modifiedFiles;
            assert.ok(accepted.some((frame) => frame.kind === 'mergePrepare' && frame.data.reads.sourceReads > 0));
            if (currentOrigin.startsWith('workspace')) {
              const prepared = accepted.find((frame) => frame.kind === 'mergePrepare');
              assert.ok(prepared.input.current.every((file) => Number.isSafeInteger(file.workspace.readToken)));
            }
            assert.equal(new Set(accepted.map((frame) => frame.session)).size, 1);
          })
        )
      );
    });
    assert.deepEqual(
      escaped.map((row) => row.output),
      ['first=current\nmiddle=unchanged\nlast=incoming\n', 'first=current\nmiddle=unchanged\nlast=incoming\n']
    );
  });
}

test('retained producer rejects unknown Scope.objects getter before reading it or sending a private frame', async (t) => {
  const { Scope } = installed('@teambit/legacy.scope');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-merge-scope-guard-'));
  const scope = await Scope.ensure(directory, 'qualification.merge-scope-guard');
  await scope.ensureDir();
  const original = Object.getOwnPropertyDescriptor(scope, 'objects');
  let reads = 0,
    requests = 0,
    began = 0;
  Object.defineProperty(scope, 'objects', {
    configurable: true,
    get() {
      reads++;
      return original.value;
    },
  });
  const request = sessionModule.MaterializationSession.prototype.request;
  const flag = process.env.BIT_RUST_CLIENT_VCS,
    executable = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = process.env.BIT_TEST_OBJECT_IMPORT;
  sessionModule.MaterializationSession.prototype.request = function (build, count, validate, ...options) {
    let input;
    return request.call(
      this,
      (id) => {
        const frame = build(id);
        if (frame.subarray(0, 4).toString() === 'BMT1') input = JSON.parse(frame.subarray(12));
        return frame;
      },
      count,
      (response, body) => {
        if (input?.kind === 'mergePrepare') requests++;
        const valid = validate(response, body);
        if (valid && input?.kind === 'mergeTransactionBegin') began++;
        return valid;
      },
      ...options
    );
  };
  t.after(async () => {
    sessionModule.MaterializationSession.prototype.request = request;
    Object.defineProperty(scope, 'objects', original);
    if (flag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = flag;
    if (executable === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = executable;
    await fs.rm(directory, { recursive: true, force: true });
  });
  const producer = require(path.join(mergeRoot, 'rust-merge-three-way.js'));
  const empty = new objects.Version({
    hash: 'a'.repeat(40),
    mainFile: 'index.js',
    files: [],
    log: { date: '1700000000000', message: 'scope guard' },
  });
  const current = Object.create(ConsumerComponent.prototype);
  current.files = [];
  await objects.withRustMergeTransactionOperation(() =>
    objects.withRustMergeTransactionJournal({ mode: 'status', count: 1 }, () =>
      plans.withRustMergeBodyPlanIndex(0, async () => {
        assert.equal(
          await producer.tryRustOwnedThreeWayMerge({
            scope,
            baseComponent: empty,
            otherComponent: empty,
            currentComponent: current,
            currentLabel: 'current',
            otherLabel: 'other',
          }),
          undefined
        );
      })
    )
  );
  assert.equal(began, 1, 'actual Native owner must be active before testing refusal');
  assert.equal(reads, 0);
  assert.equal(requests, 0);
});

test('late Scope repository replacement after Prepare keeps canonical suffix and refuses retained reuse', async (t) => {
  const helper = process.env.BIT_TEST_OBJECT_IMPORT;
  assert.ok(helper, 'actual new merge helper is required');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-merge-producer-'));
  const previous = { flag: process.env.BIT_RUST_CLIENT_VCS, helper: process.env.BIT_RUST_OBJECT_IMPORT };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  const request = sessionModule.MaterializationSession.prototype.request;
  const accepted = [];
  let replacement;
  sessionModule.MaterializationSession.prototype.request = function (build, count, validate, ...options) {
    let input;
    return request.call(
      this,
      (id) => {
        const frame = build(id);
        if (frame.subarray(0, 4).toString() === 'BMT1') input = JSON.parse(frame.subarray(12));
        return frame;
      },
      count,
      (response, body) => {
        if (input?.kind === 'mergePrepare') scope.objects = replacement;
        const valid = validate(response, body);
        if (valid && input?.kind?.startsWith('merge'))
          accepted.push({ kind: input.kind, data: response.data, session: this });
        return valid;
      },
      ...options
    );
  };
  t.after(async () => {
    sessionModule.MaterializationSession.prototype.request = request;
    for (const [name, value] of [
      ['BIT_RUST_CLIENT_VCS', previous.flag],
      ['BIT_RUST_OBJECT_IMPORT', previous.helper],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await fs.rm(directory, { recursive: true, force: true });
  });
  const { Scope } = installed('@teambit/legacy.scope');
  const scope = await Scope.ensure(path.join(directory, 'scope'), 'qualification.merge-producer');
  await scope.ensureDir();
  const repository = scope.objects;
  replacement = new objects.Repository(repository.scopePath, repository.scopeJson);
  const baseBody = 'first=base\nmiddle=unchanged\nlast=base\n';
  const incomingBody = baseBody.replace('last=base', 'last=incoming');
  const currentBody = baseBody.replace('first=base', 'first=current');
  async function version(contents, hash) {
    const files = [];
    for (const relativePath of ['index.js', 'identical.js']) {
      const source = objects.Source.from(Buffer.from(contents));
      const filename = repository.objectPath(source.hash());
      await fs.mkdir(path.dirname(filename), { recursive: true });
      await fs.writeFile(filename, await source.compress());
      files.push({ name: relativePath, relativePath, test: false, file: source.hash() });
    }
    const version = new objects.Version({
      hash,
      mainFile: 'index.js',
      files,
      log: { date: '1700000000000', message: 'actual retained merge' },
      dependencies: [],
      devDependencies: [],
    });
    const filename = repository.objectPath(version.hash());
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, await version.compress());
    return version;
  }
  const base = await version(baseBody, 'a'.repeat(40));
  const other = await version(incomingBody, 'b'.repeat(40));
  const workspace = path.join(directory, 'workspace');
  const filenames = ['index.js', 'identical.js'].map((relative) => path.join(workspace, relative));
  await fs.mkdir(workspace, { recursive: true });
  for (const filename of filenames) await fs.writeFile(filename, currentBody);
  const current = Object.create(ConsumerComponent.prototype);
  let escaped;
  await sources.withRustWorkspaceEngine(async () => {
    const reader = installed('@teambit/component.sources/dist/rust-workspace-reader.js');
    const reads = await reader.readRustWorkspaceFiles(filenames);
    assert.ok(reads);
    current.files = reads.map((read) => {
      const file = new sources.SourceFile({ base: workspace, path: read.path, contents: read.contents });
      sources.registerRustWorkspaceFile(file, read);
      return file;
    });
    await objects.withRustMergeTransactionOperation(() =>
      objects.withRustMergeTransactionJournal({ mode: 'status', count: 1 }, () =>
        plans.withRustMergeBodyPlanIndex(0, async () => {
          const result = await merge.threeWayMerge({
            scope,
            baseComponent: base,
            otherComponent: other,
            currentComponent: current,
            currentLabel: 'current',
            otherLabel: 'incoming',
          });
          assert.equal(
            plans.getRustMergeResultBodyPlan(result),
            undefined,
            'postACK equal-path Repository replacement must retire retained assumptions'
          );
          escaped = result.modifiedFiles;
          assert.equal(accepted.filter((frame) => frame.kind === 'mergePrepare').length, 1);
          assert.equal(accepted.filter((frame) => frame.kind === 'mergeApply').length, 0);
          assert.equal(new Set(accepted.map((frame) => frame.session)).size, 1);
        })
      )
    );
  });
  assert.deepEqual(
    escaped.map((row) => row.output),
    ['first=current\nmiddle=unchanged\nlast=incoming\n', 'first=current\nmiddle=unchanged\nlast=incoming\n']
  );
});
