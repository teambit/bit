const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { root, source, installed, installedRoot } = require('./load-source.cjs');
const { createCheckoutFixture } = require('./checkout-qualification.cjs');
const compiled = process.env.BIT_TEST_CHECKOUT_COMPILED === '1';
const { applyVersion } = compiled
  ? require(path.join(path.dirname(installed.resolve('@teambit/checkout')), 'checkout-version.js'))
  : source('scopes/component/checkout/checkout-version.ts');
const { Scope } = installed('@teambit/legacy.scope');
const { Consumer } = installed('@teambit/legacy.consumer');
const { BitMap, ComponentMap } = installed('@teambit/legacy.bit-map');
const { getRustCheckoutSourceDescriptor } = installed('@teambit/component.sources');
const { ComponentID } = installed('@teambit/component-id');
const { FileStatus } = installed('@teambit/component.modules.merge-helper');
const { SourceFile } = installed('@teambit/component.sources');
const helper =
  process.env.BIT_TEST_OBJECT_IMPORT ||
  path.join(root, 'native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));
async function setup(t, native) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-checkout-test-'));
  const previous = { flag: process.env.BIT_RUST_CLIENT_VCS, helper: process.env.BIT_RUST_OBJECT_IMPORT };
  process.env.BIT_RUST_CLIENT_VCS = native ? 'on' : 'off';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  t.after(async () => {
    for (const [key, value] of [
      ['BIT_RUST_CLIENT_VCS', previous.flag],
      ['BIT_RUST_OBJECT_IMPORT', previous.helper],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    Scope.scopeCache = {};
    await fs.rm(directory, { recursive: true, force: true });
  });
  const fixture = await createCheckoutFixture(installedRoot, path.join(directory, 'scope'));
  const scope = await Scope.ensure(path.join(directory, 'scope'), 'qualification.checkout');
  const id = ComponentID.fromString(`${fixture.id}@1.0.0`);
  const model = await scope.getModelComponent(id);
  const current = await model.toConsumerComponent('1.0.1', 'qualification.checkout', scope.objects);
  const componentRoot = path.join(directory, 'component');
  await fs.mkdir(componentRoot);
  for (const file of current.files) {
    file.updatePaths({ newBase: componentRoot });
    await fs.writeFile(file.path, file.contents);
  }
  current.componentMap = new ComponentMap({
    id: current.id,
    rootDir: 'component',
    mainFile: 'index.js',
    files: current.files.map((file) => ({
      name: path.basename(file.relative),
      relativePath: file.relative,
      test: file.test,
    })),
  });
  const bitMap = new BitMap(directory, path.join(directory, '.bitmap'), '17.0.0');
  bitMap.components = [current.componentMap];
  const bitmapUpdates = [];
  bitMap.updateComponentId = (value) => bitmapUpdates.push(value.toString());
  const consumer = {
    scope,
    bitMap,
    loadComponentFromModelImportIfNeeded: Consumer.prototype.loadComponentFromModelImportIfNeeded,
  };
  return {
    directory,
    fixture,
    scope,
    model,
    id,
    current,
    consumer,
    bitmapUpdates,
    componentRoot,
  };
}

test('clean applyVersion preserves statuses, removals and native/canonical model metadata', async (t) => {
  const results = [];
  for (const native of [false, true]) {
    const state = await setup(t, native);
    const result = await applyVersion(state.consumer, state.id, state.current, undefined, {});
    assert.equal(result.applyVersionResult.filesStatus['added.js'], FileStatus.removed);
    assert.equal(result.applyVersionResult.filesStatus['case.js'], FileStatus.removed);
    assert.equal(result.applyVersionResult.filesStatus['index.js'], FileStatus.updated);
    assert.equal(result.applyVersionResult.filesStatus['removed.js'], FileStatus.updated);
    await assert.rejects(fs.lstat(path.join(state.componentRoot, 'added.js')), { code: 'ENOENT' });
    if (process.platform !== 'win32')
      await assert.rejects(fs.lstat(path.join(state.componentRoot, 'case.js')), { code: 'ENOENT' });
    assert.ok(await fs.stat(path.join(state.componentRoot, 'index.js')));
    if (native)
      assert.ok(
        result.component.files.every((file) => getRustCheckoutSourceDescriptor(file)),
        'native source plan must preserve deferred source provenance'
      );
    results.push({
      statuses: result.applyVersionResult.filesStatus,
      id: result.component.id.toString(),
      files: result.component.files
        .map((file) => ({ relative: file.relative, contents: file.contents.toString('hex'), test: file.test }))
        .sort((a, b) => a.relative.localeCompare(b.relative)),
      mainFile: result.component.mainFile,
      extensions: result.component.extensions.toConfigObject(),
    });
    assert.deepEqual(state.bitmapUpdates, []);
  }
  assert.deepEqual(results[0], results[1]);
});

test('force ours skips Source loading and removals while updating bitmap identity', async (t) => {
  const state = await setup(t, true);
  state.consumer.loadComponentFromModelImportIfNeeded = () => assert.fail('ours must not load target component');
  state.scope.getModelComponent = () => assert.fail('ours must not enter native model plan');
  const result = await applyVersion(state.consumer, state.id, state.current, undefined, { forceOurs: true });
  assert.equal(result.component, undefined);
  assert.deepEqual(state.bitmapUpdates, [state.id.toString()]);
  assert.ok(Object.values(result.applyVersionResult.filesStatus).every((status) => status === FileStatus.unchanged));
  assert.ok(await fs.stat(path.join(state.componentRoot, 'added.js')));
});

test('live workspace-root bitmap is protected from checked-out model removals', async (t) => {
  const state = await setup(t, true);
  const bitmapPath = path.join(state.componentRoot, '.bitmap');
  await fs.writeFile(bitmapPath, 'live map');
  state.current.files.push(
    new SourceFile({ base: state.componentRoot, path: bitmapPath, contents: Buffer.from('versioned map') })
  );
  state.current.componentMap.rootDir = '.';
  const result = await applyVersion(state.consumer, state.id, state.current, undefined, {});
  assert.equal(await fs.readFile(bitmapPath, 'utf8'), 'live map');
  assert.equal(result.applyVersionResult.filesStatus['.bitmap'], undefined);
});

for (const kind of ['missing', 'corrupt']) {
  test(`${kind} Source falls back before checkout can delete current files`, async (t) => {
    const state = await setup(t, true);
    const hash = state.fixture.sourceRefs['0/removed.js'];
    const filename = path.join(state.scope.objects.getPath(), hash.slice(0, 2), hash.slice(2));
    if (kind === 'missing') await fs.rm(filename);
    else await fs.writeFile(filename, 'not a compressed object');
    let nativeError;
    await assert.rejects(applyVersion(state.consumer, state.id, state.current, undefined, {}), (error) => {
      nativeError = error;
      return true;
    });
    assert.ok(await fs.stat(path.join(state.componentRoot, 'added.js')), 'failure must precede deletion');
    process.env.BIT_RUST_CLIENT_VCS = 'off';
    let canonicalError;
    await assert.rejects(applyVersion(state.consumer, state.id, state.current, undefined, {}), (error) => {
      canonicalError = error;
      return true;
    });
    assert.deepEqual(
      { name: nativeError.constructor.name, message: nativeError.message },
      { name: canonicalError.constructor.name, message: canonicalError.message }
    );
    if (kind === 'missing') assert.match(nativeError.message, /Source object is missing from the local scope/);
  });
}

test('custom consumer model loading remains canonical and preserves Source transformations', async (t) => {
  const state = await setup(t, true);
  let called = 0;
  state.consumer.loadComponentFromModelImportIfNeeded = async function (id) {
    assert.equal(this, state.consumer);
    called++;
    const component = await state.model.toConsumerComponent(id.version, 'qualification.checkout', state.scope.objects);
    component.files.find((file) => file.relative === 'index.js').contents = Buffer.from('custom loader contents\n');
    return component;
  };
  const result = await applyVersion(state.consumer, state.id, state.current, undefined, {});
  assert.equal(called, 1);
  assert.equal(
    result.component.files.find((file) => file.relative === 'index.js').contents.toString(),
    'custom loader contents\n'
  );
  assert.ok(result.component.files.every((file) => !getRustCheckoutSourceDescriptor(file)));
});

test('modified merge results keep canonical Source cloning and merged bytes', async (t) => {
  const state = await setup(t, true);
  const mergeResults = {
    hasConflicts: false,
    modifiedFiles: [{ filePath: 'index.js', output: 'merged local and remote\n' }],
    addFiles: [],
    deletedConflictFiles: [],
    removeFiles: [],
    remainDeletedFiles: [],
    overrideFiles: [],
    updatedFiles: [],
  };
  const result = await applyVersion(state.consumer, state.id, state.current, mergeResults, {});
  assert.equal(
    result.component.files.find((file) => file.relative === 'index.js').contents.toString(),
    'merged local and remote\n'
  );
  assert.equal(result.applyVersionResult.filesStatus['index.js'], FileStatus.merged);
  assert.ok(result.component.files.every((file) => !getRustCheckoutSourceDescriptor(file)));
});

test('custom model conversion remains canonical and preserves transformed source identity', async (t) => {
  const state = await setup(t, true);
  const original = state.model.toConsumerComponent;
  let called = 0;
  state.model.toConsumerComponent = async function (...args) {
    assert.equal(this, state.model);
    called++;
    const component = await original.apply(this, args);
    component.files.find((file) => file.relative === 'index.js').contents = Buffer.from('model hook\n');
    return component;
  };
  const result = await applyVersion(state.consumer, state.id, state.current, undefined, {});
  assert.equal(called, 1);
  assert.equal(result.component.files.find((file) => file.relative === 'index.js').contents.toString(), 'model hook\n');
  assert.ok(result.component.files.every((file) => !getRustCheckoutSourceDescriptor(file)));
});

test('lane checkout plans a component absent from the workspace without deleting unrelated paths', async (t) => {
  const state = await setup(t, true);
  const result = await applyVersion(state.consumer, state.id, undefined, undefined, { isLane: true });
  assert.equal(result.component.id.toString(), state.id.toString());
  assert.ok(result.component.files.every((file) => getRustCheckoutSourceDescriptor(file)));
  assert.ok(Object.values(result.applyVersionResult.filesStatus).every((status) => status === FileStatus.updated));
  assert.equal(await fs.readFile(path.join(state.componentRoot, 'added.js'), 'utf8'), 'export const added = 2;\n');
});

test('corrupt target Version errors occur before any current files can be removed', async (t) => {
  const state = await setup(t, true);
  const hash = state.fixture.versionRefs[0];
  await state.scope.objects.clearCache();
  await fs.writeFile(
    path.join(state.scope.objects.getPath(), hash.slice(0, 2), hash.slice(2)),
    'invalid Version compression'
  );
  let nativeError;
  await assert.rejects(applyVersion(state.consumer, state.id, state.current, undefined, {}), (error) => {
    nativeError = error;
    return true;
  });
  assert.ok(await fs.stat(path.join(state.componentRoot, 'added.js')));
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  let canonicalError;
  await assert.rejects(applyVersion(state.consumer, state.id, state.current, undefined, {}), (error) => {
    canonicalError = error;
    return true;
  });
  assert.deepEqual(
    { name: nativeError.constructor.name, message: nativeError.message },
    { name: canonicalError.constructor.name, message: canonicalError.message }
  );
});

test(
  'a helper acknowledgement with the wrong request identity is reaped before canonical checkout replay',
  { skip: process.platform === 'win32' },
  async (t) => {
    const state = await setup(t, true);
    const executable = path.join(state.directory, 'wrong-plan-helper');
    const record = path.join(state.directory, 'native-request');
    await fs.writeFile(
      executable,
      '#!/usr/bin/env node\nconst fs=require("node:fs");process.stdin.once("data",bytes=>{fs.appendFileSync(' +
        JSON.stringify(record) +
        ',JSON.stringify({magic:bytes.subarray(0,4).toString(),pid:process.pid})+"\\n");process.stdout.write(JSON.stringify({version:1,id:999,completed:0,skipped:[],failed:false})+"\\n");});setInterval(()=>{},1000);\n',
      { mode: 0o755 }
    );
    process.env.BIT_RUST_OBJECT_IMPORT = executable;
    const original = state.consumer.loadComponentFromModelImportIfNeeded;
    // Keep the native-eligibility method identity intact; observe canonical replay at model conversion instead.
    const conversion = state.model.toConsumerComponent;
    let canonicalResult;
    const result = await applyVersion(state.consumer, state.id, state.current, undefined, {});
    canonicalResult = result.component;
    assert.equal(state.consumer.loadComponentFromModelImportIfNeeded, original);
    assert.equal(state.model.toConsumerComponent, conversion);
    assert.ok(canonicalResult.files.every((file) => !getRustCheckoutSourceDescriptor(file)));
    assert.equal(
      canonicalResult.files.find((file) => file.relative === 'index.js').contents.toString(),
      'export default "one";\n'
    );
    const observed = (await fs.readFile(record, 'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(observed[0].magic, 'BCK1');
    for (const child of observed) assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
    await assert.rejects(fs.lstat(path.join(state.componentRoot, 'added.js')), { code: 'ENOENT' });
  }
);

for (const tamper of ['version identity', 'source manifest', 'removal destination']) {
  test(
    `native checkout rejects a plan with altered ${tamper} before canonical replay`,
    { skip: process.platform === 'win32' },
    async (t) => {
      const state = await setup(t, true);
      const executable = path.join(state.directory, 'tampered-plan-helper');
      const record = path.join(state.directory, 'requests');
      const script = `#!/usr/bin/env node
const fs = require('node:fs');
let input = Buffer.alloc(0);
process.stdin.on('data', bytes => {
  input = Buffer.concat([input, bytes]);
  if (input.length < 12) return;
  const magic = input.subarray(0, 4).toString();
  const id = input.readUInt32BE(4);
  if (magic !== 'BCK1') {
    fs.appendFileSync(${JSON.stringify(record)}, JSON.stringify({magic, pid:process.pid})+'\\n');
    process.stdout.write(JSON.stringify({version:1,id,completed:0,skipped:[],failed:true})+'\\n');
    input = Buffer.alloc(0);
    return;
  }
  const length = input.readUInt32BE(8);
  if (input.length < 12 + length) return;
  const request = JSON.parse(input.subarray(12, 12 + length));
  fs.appendFileSync(${JSON.stringify(record)}, JSON.stringify({magic, pid:process.pid})+'\\n');
  const old = new Map(request.current.map(file => [file.relativePath, file]));
  const targets = new Set(request.expectedFiles.map(file => file.relativePath));
  const removed = request.current.filter(file => !file.protected && !targets.has(file.relativePath));
  const plan = {
    versionHash: request.expectedVersionHash,
    files: request.expectedFiles,
    statuses: [...request.expectedFiles.map(file => ({relativePath:file.relativePath,status:old.get(file.relativePath)?.hash===file.hash?'unchanged':'updated'})), ...removed.map(file => ({relativePath:file.relativePath,status:'removed'}))],
    removals: removed.map(file => file.path)
  };
  const tamper = ${JSON.stringify(tamper)};
  if (tamper === 'version identity') plan.versionHash = 'f'.repeat(40);
  if (tamper === 'source manifest') plan.files[0].hash = 'f'.repeat(40);
  if (tamper === 'removal destination') plan.removals[0] = ${JSON.stringify(path.join(state.directory, 'untouched'))};
  process.stdout.write(JSON.stringify({version:1,id,completed:request.expectedFiles.length,skipped:[],failed:false,plan})+'\\n');
  input = Buffer.alloc(0);
});
setInterval(() => {}, 1000);
`;
      await fs.writeFile(executable, script, { mode: 0o755 });
      await fs.writeFile(path.join(state.directory, 'untouched'), 'retain');
      process.env.BIT_RUST_OBJECT_IMPORT = executable;
      const result = await applyVersion(state.consumer, state.id, state.current, undefined, {});
      assert.ok(result.component.files.every((file) => !getRustCheckoutSourceDescriptor(file)));
      assert.equal(
        result.component.files.find((file) => file.relative === 'index.js').contents.toString(),
        'export default "one";\n'
      );
      assert.equal(await fs.readFile(path.join(state.directory, 'untouched'), 'utf8'), 'retain');
      const observed = (await fs.readFile(record, 'utf8')).trim().split('\n').map(JSON.parse);
      assert.equal(observed[0].magic, 'BCK1');
      for (const child of observed) assert.throws(() => process.kill(child.pid, 0), { code: 'ESRCH' });
      await assert.rejects(fs.lstat(path.join(state.componentRoot, 'added.js')), { code: 'ENOENT' });
    }
  );
}

test('mutating current files while the native plan is in flight invalidates the removal snapshot', async (t) => {
  const state = await setup(t, true);
  const cp = require('node:child_process');
  const originalSpawn = cp.spawn;
  const added = path.join(state.componentRoot, 'hook-added.js');
  await fs.writeFile(added, 'hook file');
  let mutated = false;
  cp.spawn = (...args) => {
    const child = originalSpawn(...args);
    if (args[0] === path.toNamespacedPath(helper)) {
      const originalWrite = child.stdin.write;
      child.stdin.write = function (bytes, ...rest) {
        if (!mutated && Buffer.isBuffer(bytes) && bytes.subarray(0, 4).toString() === 'BCK1') {
          mutated = true;
          state.current.files.push(
            new SourceFile({ base: state.componentRoot, path: added, contents: Buffer.from('hook file') })
          );
        }
        return originalWrite.call(this, bytes, ...rest);
      };
    }
    return child;
  };
  t.after(() => {
    cp.spawn = originalSpawn;
  });
  const result = await applyVersion(state.consumer, state.id, state.current, undefined, {});
  assert.equal(mutated, true);
  assert.ok(result.component.files.every((file) => !getRustCheckoutSourceDescriptor(file)));
  assert.equal(result.applyVersionResult.filesStatus['hook-added.js'], FileStatus.removed);
  await assert.rejects(fs.lstat(added), { code: 'ENOENT' });
});

test('corrupt Component metadata retains canonical errors before workspace deletion', async (t) => {
  const state = await setup(t, true);
  const hash = state.model.hash().toString();
  await state.scope.objects.clearCache();
  await fs.writeFile(
    path.join(state.scope.objects.getPath(), hash.slice(0, 2), hash.slice(2)),
    'invalid Component compression'
  );
  let nativeError;
  await assert.rejects(applyVersion(state.consumer, state.id, state.current, undefined, {}), (error) => {
    nativeError = error;
    return true;
  });
  assert.ok(await fs.stat(path.join(state.componentRoot, 'added.js')));
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  let canonicalError;
  await assert.rejects(applyVersion(state.consumer, state.id, state.current, undefined, {}), (error) => {
    canonicalError = error;
    return true;
  });
  assert.deepEqual(
    { name: nativeError.constructor.name, message: nativeError.message },
    { name: canonicalError.constructor.name, message: canonicalError.message }
  );
});

test('an untracked current component cannot turn model differences into workspace removals', async (t) => {
  const state = await setup(t, true);
  state.consumer.bitMap.components = [];
  state.consumer.bitMap._invalidateCache();
  const result = await applyVersion(state.consumer, state.id, state.current, undefined, {});
  assert.equal(result.applyVersionResult.filesStatus['added.js'], undefined);
  assert.equal(result.applyVersionResult.filesStatus['case.js'], undefined);
  assert.ok(await fs.stat(path.join(state.componentRoot, 'added.js')));
});

test('custom bitmap lookup remains canonical and follows Source validation before removals', async (t) => {
  const state = await setup(t, true);
  const lookup = state.consumer.bitMap.getComponentIdIfExist;
  let called = 0;
  state.consumer.bitMap.getComponentIdIfExist = function (...args) {
    assert.equal(this, state.consumer.bitMap);
    called++;
    return lookup.apply(this, args);
  };
  const hash = state.fixture.sourceRefs['0/removed.js'];
  await fs.rm(path.join(state.scope.objects.getPath(), hash.slice(0, 2), hash.slice(2)));
  await assert.rejects(
    applyVersion(state.consumer, state.id, state.current, undefined, {}),
    /Source object is missing from the local scope/
  );
  assert.equal(called, 0, 'canonical model loading must fail before calling custom bitmap removal lookup');
  assert.ok(await fs.stat(path.join(state.componentRoot, 'added.js')));
});

test('prototype SourceFile getters keep checkout canonical without extra hook calls', async (t) => {
  const counts = [];
  for (const native of [false, true]) {
    const state = await setup(t, native);
    const original = Object.getOwnPropertyDescriptor(SourceFile.prototype, 'relative');
    let calls = 0;
    Object.defineProperty(SourceFile.prototype, 'relative', {
      configurable: true,
      get() {
        calls++;
        return Reflect.get(Object.getPrototypeOf(SourceFile.prototype), 'relative', this);
      },
    });
    try {
      const result = await applyVersion(state.consumer, state.id, state.current, undefined, {});
      assert.ok(result.component.files.every((file) => !getRustCheckoutSourceDescriptor(file)));
      assert.ok(calls > 0);
      counts.push(calls);
    } finally {
      if (original) Object.defineProperty(SourceFile.prototype, 'relative', original);
      else delete SourceFile.prototype.relative;
    }
  }
  assert.equal(counts[0], counts[1], 'native eligibility checks must not invoke prototype getters');
});

test('replacing the consumer loader during planning restores canonical transformed files', async (t) => {
  const state = await setup(t, true);
  const cp = require('node:child_process');
  const originalSpawn = cp.spawn;
  let replaced = false;
  let canonicalCalls = 0;
  cp.spawn = (...args) => {
    const child = originalSpawn(...args);
    if (args[0] === path.toNamespacedPath(helper)) {
      const originalWrite = child.stdin.write;
      child.stdin.write = function (bytes, ...rest) {
        if (!replaced && Buffer.isBuffer(bytes) && bytes.subarray(0, 4).toString() === 'BCK1') {
          replaced = true;
          state.consumer.loadComponentFromModelImportIfNeeded = async (id) => {
            canonicalCalls++;
            const component = await state.model.toConsumerComponent(
              id.version,
              'qualification.checkout',
              state.scope.objects
            );
            component.files.find((file) => file.relative === 'index.js').contents = Buffer.from('replaced loader\n');
            return component;
          };
        }
        return originalWrite.call(this, bytes, ...rest);
      };
    }
    return child;
  };
  t.after(() => {
    cp.spawn = originalSpawn;
  });
  const result = await applyVersion(state.consumer, state.id, state.current, undefined, {});
  assert.equal(replaced, true);
  assert.equal(canonicalCalls, 1);
  assert.equal(
    result.component.files.find((file) => file.relative === 'index.js').contents.toString(),
    'replaced loader\n'
  );
  assert.ok(result.component.files.every((file) => !getRustCheckoutSourceDescriptor(file)));
});
