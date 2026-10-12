const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { installed, source, root } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_HISTORY_RESET_COMPILED === '1';
const api = compiled
  ? installed('@teambit/snapping/dist/rust-history-reset.js')
  : source('scopes/component/snapping/rust-history-reset.ts');
const { MaterializationSession } = installed(
  path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
);
const childPhases = [
  'model',
  'bitmap',
  'laneHeads',
  'localVersions',
  'headGuard',
  'dependents',
  'batchIds',
  'removeRefs',
  'result',
];
const options = { mode: 'real', pattern: false, head: false, force: true };
function setup(t, hook) {
  const original = MaterializationSession.prototype.request;
  const previous = { flag: process.env.BIT_RUST_CLIENT_VCS, helper: process.env.BIT_RUST_OBJECT_IMPORT };
  const frames = [];
  MaterializationSession.prototype.request = function (build, count, validate, ...rest) {
    const input = JSON.parse(build(0).subarray(12));
    const frame = { input, session: this };
    frames.push(frame);
    return original.call(
      this,
      build,
      count,
      (response) => {
        frame.response = response;
        return hook?.(input, response) === false ? false : validate(response);
      },
      ...rest
    );
  };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT =
    process.env.BIT_TEST_OBJECT_IMPORT ||
    path.join(root, 'native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));
  t.after(() => {
    MaterializationSession.prototype.request = original;
    for (const [key, value] of [
      ['BIT_RUST_CLIENT_VCS', previous.flag],
      ['BIT_RUST_OBJECT_IMPORT', previous.helper],
    ])
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  });
  return frames;
}
async function fork(count) {
  await api.completeRustHistoryResetPhase('captureLane');
  await api.completeRustHistoryResetPhase('candidates', count);
  const children = await api.forkRustHistoryResetComponents(count);
  assert.equal(children?.length, count, 'real native Fork must accept exact parent count');
  return children;
}
async function parentSuffix() {
  for (const phase of ['components', 'laneHistory', 'persist', 'bitmap', 'stagedWrite', 'destroy'])
    await api.completeRustHistoryResetPhase(phase);
}

test('real Fork children retain independent revisions and terminal count zero despite reversed completion', async (t) => {
  const frames = setup(t);
  const effects = [];
  let releaseFirst;
  const gate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  await api.withRustHistoryResetOperation(options, async () => {
    const children = await fork(2);
    await Promise.all(
      children.map((child, index) =>
        api.withRustHistoryResetComponent(child, async () => {
          if (index === 0) await gate;
          for (const phase of childPhases) {
            effects.push([index, phase]);
            await api.completeRustHistoryResetComponentPhase(phase);
          }
          if (index === 1) releaseFirst();
        })
      )
    );
    await parentSuffix();
  });
  assert.deepEqual(effects, [...childPhases.map((phase) => [1, phase]), ...childPhases.map((phase) => [0, phase])]);
  const forkFrame = frames.find((row) => row.input.kind === 'historyResetFork');
  assert.ok(forkFrame);
  for (const child of forkFrame.response.data.children) {
    const receipts = frames.filter(
      (row) => row.input.kind === 'historyResetReceipt' && row.input.token === child.token
    );
    assert.deepEqual(
      receipts.map((row) => row.input.revision),
      childPhases.map((_, index) => index)
    );
    assert.deepEqual(
      receipts.map((row) => row.input.phase),
      childPhases
    );
    assert.equal(receipts.at(-1).response.data.directive.phase, 'done');
    assert.equal(receipts.at(-1).response.data.directive.count, 0);
  }
  assert.equal(frames.at(-1).input.kind, 'historyResetFinish');
  assert.equal(new Set(frames.map((row) => row.session)).size, 1);
});

test('lost child receipt after public mutation preserves both canonical suffixes without callback replay', async (t) => {
  let firstToken;
  const frames = setup(t, (input) =>
    input.kind === 'historyResetReceipt' && input.token === firstToken && input.phase === 'removeRefs'
      ? false
      : undefined
  );
  const effects = [],
    modelHeads = [0, 0];
  await api.withRustHistoryResetOperation(options, async () => {
    const children = await fork(2);
    firstToken = children[0].token;
    await Promise.all(
      children.map((child, index) =>
        api.withRustHistoryResetComponent(child, async () => {
          for (const phase of childPhases) {
            if (phase === 'removeRefs') modelHeads[index]++;
            effects.push([index, phase]);
            await api.completeRustHistoryResetComponentPhase(phase);
          }
        })
      )
    );
    await parentSuffix();
  });
  assert.deepEqual(modelHeads, [1, 1]);
  for (let index = 0; index < 2; index++)
    assert.deepEqual(
      effects.filter((row) => row[0] === index).map((row) => row[1]),
      childPhases
    );
  const lost = frames.findIndex((row) => row.input.token === firstToken && row.input.phase === 'removeRefs');
  assert.ok(lost >= 0);
  assert.equal(frames.length, lost + 1, 'retired shared helper receives no later physical frames');
  assert.equal(new Set(frames.map((row) => row.session)).size, 1);
});

test('real child error reaches caller before delayed sibling joins and preserves original error identity', async (t) => {
  const frames = setup(t),
    original = new Error('original reset child failure');
  let releaseSibling;
  const gate = new Promise((resolve) => {
    releaseSibling = resolve;
  });
  let sibling;
  const effects = [];
  await assert.rejects(
    api.withRustHistoryResetOperation(options, async () => {
      const children = await fork(2);
      sibling = api.withRustHistoryResetComponent(children[1], async () => {
        effects.push('sibling started');
        await gate;
        effects.push('sibling completed');
        for (const phase of childPhases) await api.completeRustHistoryResetComponentPhase(phase);
      });
      await Promise.all([
        sibling,
        api.withRustHistoryResetComponent(children[0], async () => {
          await api.completeRustHistoryResetComponentPhase('model');
          effects.push('failing prefix');
          throw original;
        }),
      ]);
    }),
    (error) => error === original
  );
  assert.deepEqual(effects, ['sibling started', 'failing prefix']);
  const count = frames.length;
  releaseSibling();
  await sibling;
  assert.deepEqual(effects, ['sibling started', 'failing prefix', 'sibling completed']);
  assert.equal(frames.length, count, 'escaped sibling cannot reacquire closed owner');
});

test('child ref-plan ALS uses new ComponentPlan with cached Version.id provenance and falls back after retirement', async (t) => {
  const frames = setup(t);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-history-ref-alias-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const objects = installed('@teambit/objects'),
    { Scope } = installed('@teambit/legacy.scope');
  const scope = await Scope.ensure(directory, 'qualification.alias');
  const { Source, Version, ModelComponent, Ref } = objects;
  const body = Source.from(Buffer.from('export default "reset";\n'));
  const first = new Ref('1'.repeat(40)),
    second = new Ref('2'.repeat(40));
  const version = (ref, parents = []) =>
    new Version({
      hash: ref.toString(),
      mainFile: 'index.js',
      files: [{ name: 'index.js', relativePath: 'index.js', file: body.hash(), test: false }],
      log: { date: '1700000000000', message: 'alias' },
      dependencies: [],
      devDependencies: [],
      parents,
    });
  const v1 = version(first),
    v2 = version(second, [first]);
  const component = ModelComponent.from({
    name: 'component',
    scope: 'qualification.alias',
    versions: { '1.0.0': first, '2.0.0': second },
    head: second,
  });
  const flag = process.env.BIT_RUST_CLIENT_VCS;
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  for (const value of [body, v1, v2, component]) scope.objects.add(value);
  await scope.objects.persist();
  process.env.BIT_RUST_CLIENT_VCS = flag;
  const beforeWindows = process.env.BIT_RUST_OBJECT_IMPORT_WINDOWS_WRITES;
  if (process.platform === 'win32') process.env.BIT_RUST_OBJECT_IMPORT_WINDOWS_WRITES = 'on';
  t.after(() => {
    if (beforeWindows === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT_WINDOWS_WRITES;
    else process.env.BIT_RUST_OBJECT_IMPORT_WINDOWS_WRITES = beforeWindows;
  });
  await api.withRustHistoryResetOperation(options, async () => {
    await api.loadRustResetDependents(scope);
    const alias = v2.id;
    assert.equal(alias.toString(), 'qualification.alias/component');
    await api.withRustHistoryResetComponent(undefined, () =>
      scope.sources.removeComponentVersions(component, [second], ['2.0.0'], undefined, true)
    );
    assert.equal(component.head, first);
    assert.equal(v2.id, alias);
    assert.ok(
      frames.some((row) => row.input.kind === 'historyResetComponentPlan'),
      'actual Source ref plan must use new owned protocol'
    );
    const descriptor = Object.getOwnPropertyDescriptor(v2, 'id');
    let getterReads = 0;
    for (const variant of ['getter', 'replacement', 'method-shadow', 'nonconfigurable']) {
      component.versions['2.0.0'] = second;
      component.head = second;
      if (variant === 'getter') {
        Object.defineProperty(v2, 'id', {
          enumerable: true,
          configurable: true,
          get() {
            getterReads++;
            throw new Error('unexpected Version.id getter');
          },
        });
      } else if (variant === 'replacement') v2.id = alias.changeVersion('3.0.0');
      else if (variant === 'method-shadow')
        alias.toString = () => {
          throw new Error('unexpected ID hook');
        };
      else Object.defineProperty(v2, 'id', { ...descriptor, configurable: false });
      const nativePlans = frames.filter((row) => row.input.kind === 'historyResetComponentPlan').length;
      await api.withRustHistoryResetComponent(undefined, () =>
        scope.sources.removeComponentVersions(component, [second], ['2.0.0'], undefined, true)
      );
      assert.equal(component.head, first, variant + ' must preserve canonical ref mutation');
      assert.equal(frames.filter((row) => row.input.kind === 'historyResetComponentPlan').length, nativePlans, variant);
      if (variant === 'method-shadow') delete alias.toString;
      if (variant !== 'nonconfigurable') Object.defineProperty(v2, 'id', descriptor);
    }
    assert.equal(getterReads, 0);
    component.versions['2.0.0'] = second;
    component.head = second;
    const transaction = installed('@teambit/objects/dist/objects/rust-snapshot-transaction.js');
    await transaction.retireRustSnapshotTransaction();
    const count = frames.length;
    await api.withRustHistoryResetComponent(undefined, () =>
      scope.sources.removeComponentVersions(component, [second], ['2.0.0'], undefined, true)
    );
    assert.equal(component.head, first);
    assert.equal(v2.id, alias);
    assert.equal(frames.length, count, 'retired child ref-plan continues canonically without new session');
  });
});

test('concurrent genuine Unmerged removals share fresh revisions and persist keeps the same owner', async (t) => {
  const frames = setup(t);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-history-unmerged-concurrent-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const { UnmergedComponents } = installed('@teambit/legacy.scope/dist/lanes/unmerged-components.js');
  const { ComponentID } = installed('@teambit/component-id');
  const { LaneId } = installed('@teambit/lane-id');
  const { Ref } = installed('@teambit/objects');
  const entries = ['first', 'second', 'retained'].map((name, index) => ({
    id: { name, scope: 'qualification.concurrent' },
    head: new Ref(String(index + 1).repeat(40)),
    laneId: new LaneId({ name: 'reset', scope: 'qualification.concurrent' }),
  }));
  const retained = entries[2];
  const state = new UnmergedComponents(path.join(directory, 'unmerged.json'), entries);
  const id = (name) => ComponentID.fromString('qualification.concurrent/' + name);
  await api.withRustHistoryResetOperation(options, async () => {
    assert.deepEqual(
      await Promise.all([state.removeComponentsNative([id('first')]), state.removeComponentsNative([id('second')])]),
      [true, true]
    );
    assert.deepEqual(state.unmerged, [retained]);
    assert.equal(state.unmerged[0], retained);
    assert.equal(state.hasChanged, true);
    const transitions = frames.filter((row) => row.input.kind === 'transition');
    assert.equal(transitions.length, 2, 'both concurrent removals must reach native transitions');
    for (const row of transitions) {
      assert.equal(row.response.completed, 1);
      assert.equal(row.response.failed, false);
    }
    if (process.platform === 'linux') {
      await Promise.all([state.write(), state.removeComponentsNative([id('retained')])]);
      assert.deepEqual(state.unmerged, []);
      await state.write();
      assert.deepEqual(JSON.parse(await fs.readFile(state.filePath, 'utf8')), []);
      assert.equal(frames.filter((row) => row.input.kind === 'transition').length, 3);
      assert.equal(frames.filter((row) => row.input.kind === 'commit').length, 2);
    }
  });
  for (const row of frames) {
    assert.equal(row.response.completed, 1, row.input.kind);
    assert.equal(row.response.failed, false, row.input.kind);
  }
  assert.equal(
    new Set(frames.map((row) => row.session)).size,
    1,
    'no retirement or helper reacquisition after concurrent mutations'
  );
});

test('first child rejection closes receipts before a delayed Native Finish acknowledgement returns', async (t) => {
  const frames = setup(t);
  const observed = MaterializationSession.prototype.request;
  let releaseSibling, siblingReady, sibling, lateFrames, completedWhileFinishPending;
  const gate = new Promise((resolve) => {
    releaseSibling = resolve;
  });
  const ready = new Promise((resolve) => {
    siblingReady = resolve;
  });
  const original = new Error('first child callback failed');
  const effects = [];
  MaterializationSession.prototype.request = function (build, ...args) {
    const input = JSON.parse(build(0).subarray(12));
    const result = observed.call(this, build, ...args);
    if (input.kind !== 'historyResetFinish') return result;
    const count = frames.length;
    releaseSibling();
    return result.then(async (value) => {
      let timer;
      completedWhileFinishPending = await Promise.race([
        sibling.then(() => true),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(false), 300);
        }),
      ]);
      clearTimeout(timer);
      lateFrames = frames.slice(count);
      return value;
    });
  };
  await assert.rejects(
    api.withRustHistoryResetOperation(options, async () => {
      const children = await fork(2);
      sibling = api.withRustHistoryResetComponent(children[1], async () => {
        effects.push('sibling model');
        await api.completeRustHistoryResetComponentPhase('model');
        siblingReady();
        await gate;
        for (const phase of childPhases.slice(1)) {
          effects.push(phase);
          await api.completeRustHistoryResetComponentPhase(phase);
        }
      });
      await Promise.all([
        sibling,
        api.withRustHistoryResetComponent(children[0], async () => {
          await api.completeRustHistoryResetComponentPhase('model');
          await ready;
          throw original;
        }),
      ]);
    }),
    (error) => error === original
  );
  await sibling;
  assert.equal(
    completedWhileFinishPending,
    true,
    'late canonical suffix must not wait on the pending private Finish acknowledgement'
  );
  assert.deepEqual(
    effects,
    ['sibling model', ...childPhases.slice(1)],
    'late public suffix must execute once without an artificial production join'
  );
  assert.deepEqual(
    lateFrames,
    [],
    'no child token request may follow parent Finish, even while its acknowledgement is pending'
  );
  assert.equal(frames.at(-1).input.kind, 'historyResetFinish');
  assert.equal(new Set(frames.map((row) => row.session)).size, 1);
});
