const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { installed, source, root } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_HISTORY_RESET_COMPILED === '1';
const api = compiled
  ? installed('@teambit/snapping/dist/rust-history-reset.js')
  : source('scopes/component/snapping/rust-history-reset.ts');
const { ModelComponent, Ref, Version, Lane } = installed('@teambit/objects');
const { ComponentID, ComponentIdList } = installed('@teambit/component-id');
const { SnapsDistance } = installed('@teambit/component.snap-distance');
const { DependencyGraph } = installed('@teambit/legacy.dependency-graph');
const { MaterializationSession } = installed(
  path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
);
const options = { mode: 'real', pattern: false, head: false, force: true };
const hash = (n) => (n + 1).toString(16).padStart(40, '0');
function setup(t, hook) {
  const original = MaterializationSession.prototype.request;
  const previous = { flag: process.env.BIT_RUST_CLIENT_VCS, helper: process.env.BIT_RUST_OBJECT_IMPORT };
  const frames = [];
  MaterializationSession.prototype.request = function (build, count, validate, ...rest) {
    const input = JSON.parse(build(0).subarray(12));
    frames.push({ input, session: this });
    return original.call(
      this,
      build,
      count,
      (response, body) => {
        const keep = hook?.(input, response);
        return keep === false ? false : validate(response, body);
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
function model() {
  const refs = [new Ref(hash(1)), new Ref(hash(2)), new Ref(hash(3))];
  const component = ModelComponent.from({
    name: 'component',
    scope: 'qualification',
    versions: { '1.0.0': refs[0], '1.0.1': refs[1] },
    head: refs[2],
  });
  component.divergeData = new SnapsDistance([...refs], [], undefined);
  return { component, refs };
}
function version(index, deps = []) {
  return new Version({
    hash: hash(index),
    mainFile: 'index.js',
    files: [{ name: 'index.js', relativePath: 'index.js', test: false, file: new Ref(hash(99)) }],
    log: { date: '1700000000000', message: 'reset adapter' },
    dependencies: [],
    devDependencies: [],
    flattenedDependencies: ComponentIdList.fromArray(deps),
  });
}
function scopeFixture() {
  const dependency = ComponentID.fromString('qualification/dependency@1.0.0');
  const cached = version(20, [dependency]);
  const component = ModelComponent.from({
    name: 'component',
    scope: 'qualification',
    versions: { '1.0.0': cached.hash() },
  });
  const counts = { list: 0, load: 0 };
  const scope = {
    async list() {
      counts.list++;
      return [component];
    },
    objects: {
      async load() {
        counts.load++;
        return cached;
      },
    },
  };
  return { scope, cached, component, dependency, counts };
}

test('genuine default local selection preserves cached source array and Ref aliases; labels mutate canonical cache once', async (t) => {
  const frames = setup(t),
    { component, refs } = model(),
    alias = component.divergeData.snapsOnSourceOnly;
  await api.withRustHistoryResetOperation(options, async () => {
    const local = await api.getRustResetLocalHashes(component, {}, undefined);
    assert.equal(local, alias);
    assert.deepEqual(local, [refs[2], refs[1], refs[0]]);
    const labels = await api.selectRustResetLabels(component, [refs[1], refs[0]]);
    assert.deepEqual(labels, ['1.0.1', '1.0.0']);
    assert.equal(component.lastFoundTag, '1.0.0');
    component.divergeData = new SnapsDistance([], [], undefined);
    const empty = component.divergeData.snapsOnSourceOnly;
    const result = await api.getRustResetLocalHashes(component, {}, undefined);
    assert.deepEqual(result, []);
    assert.notEqual(result, empty);
  });
  assert.ok(
    frames.filter((row) => row.input.kind === 'historyResetLocalVersions').length >= 2,
    'actual default adapters must request native plans'
  );
  assert.equal(new Set(frames.map((row) => row.session)).size, 1);
});

test('label ACK equal-JSON map/Ref/descriptor mutations decline without invoking newly installed cache getter', async (t) => {
  let current,
    variant,
    reads = 0;
  const frames = setup(t, (input) => {
    if (input.kind !== 'historyResetLocalVersions' || input.reverse !== false) return;
    if (variant === 'map') current.component.versions = { ...current.component.versions };
    if (variant === 'ref') current.component.versions['1.0.1'] = new Ref(current.refs[1].toString());
    if (variant === 'getter')
      Object.defineProperty(current.component, 'lastFoundTag', {
        configurable: true,
        enumerable: true,
        get() {
          reads++;
          throw Error('late cache getter');
        },
      });
    if (variant === 'readonly')
      Object.defineProperty(current.component, 'lastFoundTag', {
        value: undefined,
        writable: false,
        configurable: true,
        enumerable: true,
      });
  });
  for (variant of ['map', 'ref', 'getter', 'readonly']) {
    current = model();
    await api.withRustHistoryResetOperation(options, async () => {
      assert.equal(await api.selectRustResetLabels(current.component, [current.refs[1]]), undefined, variant);
    });
  }
  assert.equal(reads, 0);
  assert.equal(frames.filter((row) => row.input.reverse === false).length, 4);
});

test('Native dependency index retains exact defining query identity and original Version.id assignments', async (t) => {
  const frames = setup(t),
    fixture = scopeFixture();
  await api.withRustHistoryResetOperation(options, async () => {
    const graph = await api.loadRustResetDependents(fixture.scope);
    assert.equal(graph.getImmediateDependentsPerId, DependencyGraph.prototype.getImmediateDependentsPerId);
    assert.deepEqual(graph.getImmediateDependentsPerId(fixture.dependency), ['qualification/component@1.0.0']);
    assert.equal(graph.graph.node('qualification/component@1.0.0'), fixture.cached);
    assert.equal(fixture.cached.id.toString(), 'qualification/component');
    assert.deepEqual(fixture.counts, { list: 1, load: 1 });
  });
  assert.equal(frames.filter((row) => row.input.kind === 'historyResetDependents').length, 1);
});

test('lost dependency ACK reconstructs captured edges without repeating loaders or cache assignment', async (t) => {
  const frames = setup(t, (input) => (input.kind === 'historyResetDependents' ? false : undefined)),
    fixture = scopeFixture();
  await api.withRustHistoryResetOperation(options, async () => {
    const graph = await api.loadRustResetDependents(fixture.scope);
    assert.deepEqual(graph.getImmediateDependentsPerId(fixture.dependency), ['qualification/component@1.0.0']);
    assert.deepEqual(
      graph.graph.inEdges(fixture.dependency.toString()).map((row) => row.v),
      ['qualification/component@1.0.0']
    );
    assert.deepEqual(fixture.counts, { list: 1, load: 1 });
    assert.equal(fixture.cached.id.toString(), 'qualification/component');
  });
  assert.equal(frames.filter((row) => row.input.kind === 'historyResetDependents').length, 1);
});

test('late prototype query patch and own assignment hydrate original edges before custom query callback', async (t) => {
  const frames = setup(t);
  const original = DependencyGraph.prototype.getImmediateDependentsPerId;
  t.after(() => {
    DependencyGraph.prototype.getImmediateDependentsPerId = original;
  });
  for (const variant of ['prototype', 'own']) {
    const fixture = scopeFixture();
    const prior = frames.filter((row) => row.input.kind === 'historyResetDependents').length;
    await api.withRustHistoryResetOperation(options, async () => {
      const graph = await api.loadRustResetDependents(fixture.scope);
      assert.equal(
        frames.filter((row) => row.input.kind === 'historyResetDependents').length,
        prior + 1,
        'positive index required before late query mutation'
      );
      const custom = function (id) {
        return this.graph.inEdges(id.toString()).map((row) => row.v);
      };
      if (variant === 'prototype') DependencyGraph.prototype.getImmediateDependentsPerId = custom;
      else graph.getImmediateDependentsPerId = custom;
      assert.equal(graph.getImmediateDependentsPerId, custom);
      assert.deepEqual(graph.getImmediateDependentsPerId(fixture.dependency), ['qualification/component@1.0.0']);
      if (variant === 'own')
        assert.deepEqual(Object.getOwnPropertyDescriptor(graph, 'getImmediateDependentsPerId'), {
          value: custom,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      assert.deepEqual(fixture.counts, { list: 1, load: 1 });
      DependencyGraph.prototype.getImmediateDependentsPerId = original;
    });
  }
});

test('genuine ComponentIdList selectors accept native DTOs and preserve model/ID duplicates', async (t) => {
  const frames = setup(t);
  const first = model().component;
  const second = ModelComponent.from({ name: 'second', scope: 'qualification', versions: {} });
  const firstId = ComponentID.fromString('qualification/component');
  const secondId = ComponentID.fromString('qualification/second');
  const absentId = ComponentID.fromString('qualification/absent');
  const matches = ComponentIdList.fromArray([secondId, firstId, firstId]);
  const removed = ComponentIdList.fromArray([firstId, absentId, absentId]);
  assert.notEqual(Object.getPrototypeOf(matches), Array.prototype);
  await api.withRustHistoryResetOperation(options, async () => {
    const selected = await api.selectRustResetPattern([first, second], matches);
    assert.deepEqual(selected, [first, second]);
    assert.equal(selected[0], first);
    assert.equal(selected[1], second);
    assert.deepEqual(await api.selectRustResetCandidates([first, second], removed), [1, 2]);
    const never = await api.selectRustNeverExported(matches);
    assert.ok(never);
    assert.deepEqual(never.unique, [0, 1]);
    assert.equal(never.hashes[1], never.hashes[2]);
    assert.equal(never.hashes.length, matches.length);
  });
  for (const kind of ['historyResetPattern', 'historyResetCandidates', 'historyResetNeverExported']) {
    assert.equal(frames.filter((row) => row.input.kind === kind).length, 1, kind + ' must reach real Native');
  }
  assert.equal(matches[0], secondId);
  assert.equal(matches[1], firstId);
  assert.equal(matches[2], firstId);
});

test('LocalRead ACK lane-head mutation uses remaining canonical loads exactly once', async (t) => {
  const { component, refs } = model();
  const head = new Ref(refs[1].toString());
  const lane = new Lane({
    name: 'reset',
    scope: 'qualification',
    hash: hash(40),
    components: [{ id: component.toComponentId(), head }],
  });
  const frames = setup(t, (input) => {
    if (input.kind === 'historyResetLocalRead') head.hash = hash(99);
  });
  const loads = [];
  const repo = {
    async load(ref) {
      loads.push(ref);
      const value = version(1);
      value.squashed = { previousParents: [], laneId: { name: 'reset', scope: 'qualification' }, log: value.log };
      return value;
    },
  };
  await api.withRustHistoryResetOperation(options, async () => {
    const result = await api.getRustResetLocalHashes(component, repo, undefined, lane);
    assert.deepEqual(result, [refs[2], refs[1], refs[0]]);
    assert.notEqual(result, component.divergeData.snapsOnSourceOnly);
  });
  assert.deepEqual(loads, refs);
  assert.equal(frames.filter((row) => row.input.kind === 'historyResetLocalRead').length, 1);
  assert.equal(
    frames.filter((row) => row.input.kind === 'historyResetLocalVersions').length,
    0,
    'stale recorded head must never reach final native plan'
  );
});

test('soft selector reads genuine bitmap backing aliases without speculative public callbacks', async (t) => {
  const { BitMap } = installed('@teambit/legacy.bit-map');
  const bitmap = BitMap.loadFromContentWithoutLoadingFiles(
    Buffer.from(
      JSON.stringify({
        component: {
          name: 'component',
          scope: 'qualification',
          version: '1.0.0',
          mainFile: 'index.js',
          rootDir: 'component',
          nextVersion: { version: '2.0.0' },
        },
        second: { name: 'second', scope: 'qualification', version: '1.0.0', mainFile: 'index.js', rootDir: 'second' },
      })
    ),
    path.join(process.cwd(), '.bitmap'),
    process.cwd(),
    'qualification'
  );
  const first = bitmap.components.find((row) => row.id.name === 'component');
  const second = bitmap.components.find((row) => row.id.name === 'second');
  const ids = ComponentIdList.fromArray([first.id, first.id, second.id]);
  const frames = setup(t);
  await api.withRustHistoryResetOperation({ mode: 'soft', pattern: false, head: false, force: false }, async () => {
    const plan = await api.selectRustResetSoft(bitmap, ids);
    assert.ok(plan);
    assert.deepEqual(plan.selected, [0]);
    assert.equal(plan.entries[0], first);
    assert.equal(plan.entries[1], first);
    assert.equal(plan.entries[2], second);
    assert.equal(plan.valid(), true);
    first.nextVersion.version = '3.0.0';
    assert.equal(plan.valid(), false);
  });
  assert.equal(frames.filter((row) => row.input.kind === 'historyResetSoft').length, 1);
  let reads = 0;
  Object.defineProperty(first, 'nextVersion', {
    configurable: true,
    enumerable: true,
    get() {
      reads++;
      throw Error('unexpected soft getter');
    },
  });
  await api.withRustHistoryResetOperation({ mode: 'soft', pattern: false, head: false, force: false }, async () => {
    assert.equal(await api.selectRustResetSoft(bitmap, ids), undefined);
  });
  assert.equal(reads, 0);
  assert.equal(frames.filter((row) => row.input.kind === 'historyResetSoft').length, 1);
});
