const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { installed, source, root } = require('./load-source.cjs');
const { createTopology } = require('./history-query-topology.cjs');
const compiled = process.env.BIT_TEST_HISTORY_QUERY_COMPILED === '1';
const objects = compiled ? installed('@teambit/objects') : source('scopes/scope/objects/models/index.ts');
const Ref = compiled ? objects.Ref : source('scopes/scope/objects/objects/ref.ts').default;
const Repository = compiled ? objects.Repository : source('scopes/scope/objects/objects/repository.ts').default;
const broker = compiled
  ? installed('@teambit/objects/dist/objects/rust-history-query.js')
  : source('scopes/scope/objects/objects/rust-history-query.ts');
const graphApi = compiled
  ? installed('@teambit/objects/dist/objects/rust-history-query-graph.js')
  : source('scopes/scope/objects/objects/rust-history-query-graph.ts');
if (!compiled)
  source('scopes/scope/objects/objects/rust-snapshot-guards.ts').registerRustSnapshotFunctions(
    'SnapshotRepositoryPath',
    require('node:path'),
    ['join', 'resolve', 'dirname', 'basename']
  );

function setup(t, onReply) {
  const helper =
    process.env.BIT_TEST_OBJECT_IMPORT ||
    path.join(root, 'native/target/debug', `bit-object-import${process.platform === 'win32' ? '.exe' : ''}`);
  assert.ok(fs.existsSync(helper), 'real current Native helper required; this suite must not silently skip');
  const previous = { client: process.env.BIT_RUST_CLIENT_VCS, helper: process.env.BIT_RUST_OBJECT_IMPORT };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  const session = installed(
    path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
  ).MaterializationSession;
  const original = session.prototype.request;
  const frames = [];
  session.prototype.request = async function (build, ...args) {
    let input;
    const result = await original.call(
      this,
      (id) => {
        const bytes = build(id);
        if (bytes.subarray(0, 4).toString() === 'BMT1') input = JSON.parse(bytes.subarray(12));
        return bytes;
      },
      ...args
    );
    if (input) {
      frames.push({ input, accepted: typeof result === 'number' && result > 0 });
      await onReply?.(input, result);
    }
    return result;
  };
  t.after(() => {
    session.prototype.request = original;
    for (const [name, value] of [
      ['BIT_RUST_CLIENT_VCS', previous.client],
      ['BIT_RUST_OBJECT_IMPORT', previous.helper],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  return frames;
}

function fixture(kind) {
  const topology = createTopology({ ...objects, Ref, LaneId: installed('@teambit/lane-id').LaneId }, kind);
  const history = new objects.VersionHistory({
    name: topology.model.name,
    scope: topology.model.scope,
    versions: topology.versions.map((version) => ({
      hash: version.hash(),
      parents: version.parents,
      ...(version.squashed ? { squashed: version.squashed.previousParents } : {}),
      ...(version.unrelated ? { unrelated: version.unrelated.head } : {}),
    })),
  });
  const repository = new Repository(path.join(require('node:os').tmpdir(), 'history-query-graph-fixture'), {
    name: topology.model.scope,
  });
  const heads = { [topology.hashes[5]]: ['main'], [topology.hashes[2]]: ['qualification.history/lane'] };
  return { ...topology, history, repository, heads };
}

function graphShape(graph) {
  return {
    nodes: [...graph._nodes.values()].map((node) => ({ id: node.id, attr: node.attr })),
    edges: [...graph._edges.values()].map((edge) => ({
      source: edge.sourceId,
      target: edge.targetId,
      attr: edge.attr,
    })),
  };
}

test('real Native graph construction matches original VersionHistory.getGraph full/short/limits and edge precedence', async (t) => {
  const frames = setup(t);
  let cases = 0;
  for (const kind of ['diamond', 'hidden', 'squashed', 'unrelated', 'lean-lane'])
    for (const short of [false, true])
      for (const limit of [undefined, 2, -2]) {
        const value = fixture(kind);
        const canonical = value.history.getGraph(value.model, value.heads, short, limit);
        const native = await broker.withRustHistoryQueryOperation(() =>
          graphApi.getRustHistoryQueryHistoryGraph(
            value.history,
            value.model,
            value.repository,
            value.heads,
            short,
            limit
          )
        );
        assert.ok(native, `${kind}/${short}/${limit}: actual default guard positive`);
        assert.deepEqual(graphShape(native), graphShape(canonical));
        cases++;
      }
  assert.equal(cases, 30);
  assert.equal(frames.filter((frame) => frame.input.kind === 'historyQueryShow' && frame.accepted).length, cases);
});

test('nonenumerable history row is excluded before limit and never reaches native input', async (t) => {
  const frames = setup(t),
    value = fixture('diamond');
  const hiddenHash = value.hashes[5];
  Object.defineProperty(value.history.versionsObj, hiddenHash, {
    ...Object.getOwnPropertyDescriptor(value.history.versionsObj, hiddenHash),
    enumerable: false,
  });
  const canonical = value.history.getGraph(value.model, value.heads, false, 1);
  const native = await broker.withRustHistoryQueryOperation(() =>
    graphApi.getRustHistoryQueryHistoryGraph(value.history, value.model, value.repository, value.heads, false, 1)
  );
  assert.ok(native);
  assert.deepEqual(graphShape(native), graphShape(canonical));
  const input = frames.find((frame) => frame.input.kind === 'historyQueryShow').input;
  assert.equal(input.versions.length, 1);
  assert.notEqual(input.versions[0].hash, hiddenHash);
});

function collisionFixture() {
  const first = new Ref('123456789' + 'a'.repeat(31)),
    second = new Ref('123456789' + 'b'.repeat(31)),
    parent = new Ref('c'.repeat(40));
  const history = new objects.VersionHistory({
    name: 'collision',
    scope: 'qualification.history',
    versions: [
      { hash: first, parents: [parent], unrelated: parent, squashed: [parent] },
      { hash: second, parents: [parent] },
    ],
  });
  const model = objects.ModelComponent.from({
    name: 'collision',
    scope: 'qualification.history',
    versions: {
      '1.0.0': first,
      '1.1.0': second,
    },
    head: second,
  });
  const repository = new Repository(path.join(require('node:os').tmpdir(), 'history-query-collision'), {
    name: model.scope,
  });
  const heads = { [second.hash]: ['main'] };
  return { history, model, repository, heads };
}

test('short-hash collisions preserve last metadata, first edge position and canonical edge precedence', async (t) => {
  const frames = setup(t),
    value = collisionFixture();
  const canonical = value.history.getGraph(value.model, value.heads, true);
  const native = await broker.withRustHistoryQueryOperation(() =>
    graphApi.getRustHistoryQueryHistoryGraph(value.history, value.model, value.repository, value.heads, true)
  );
  assert.ok(native);
  assert.deepEqual(graphShape(native), graphShape(canonical));
  assert.equal(native._nodes.get('123456789').attr.tag, '1.1.0');
  assert.equal(native._edges.size, 1);
  assert.equal([...native._edges.values()][0].attr, 'parent');
  assert.equal(frames.filter((frame) => frame.input.kind === 'historyQueryShow' && frame.accepted).length, 1);
});

test('late model callback replacement after real Show ACK executes only canonical callbacks once per full Ref', async (t) => {
  const value = collisionFixture();
  const original = value.model.getTagOfRefIfExists;
  const observed = [];
  const frames = setup(t, async (input, accepted) => {
    if (input.kind === 'historyQueryShow' && accepted > 0)
      value.model.getTagOfRefIfExists = function (ref) {
        observed.push(ref);
        return original.call(this, ref);
      };
  });
  const native = await broker.withRustHistoryQueryOperation(() =>
    graphApi.getRustHistoryQueryHistoryGraph(value.history, value.model, value.repository, value.heads, true)
  );
  assert.equal(native, undefined);
  assert.equal(observed.length, 0, 'declined private attempt must not invoke changed public callback');
  const fallback = value.history.getGraph(value.model, value.heads, true);
  assert.equal(fallback._nodes.size, 2);
  assert.equal(observed.length, 3, 'short collisions still call canonical callback once per unique full Ref');
  assert.equal(new Set(observed.map((ref) => ref.hash)).size, 3);
  assert.equal(frames.filter((frame) => frame.input.kind === 'historyQueryShow' && frame.accepted).length, 1);
});

test('cycle refusal preserves the observed history for canonical graph/error suffix', async (t) => {
  const frames = setup(t),
    value = fixture('cycle');
  const rows = value.history.versionsObj;
  const native = await broker.withRustHistoryQueryOperation(() =>
    graphApi.getRustHistoryQueryHistoryGraph(value.history, value.model, value.repository, value.heads)
  );
  assert.equal(native, undefined);
  assert.equal(value.history.versionsObj, rows);
  const fallback = value.history.getGraph(value.model, value.heads);
  assert.throws(() => fallback.toposort(), /cycl/i);
  assert.equal(frames.filter((frame) => frame.input.kind === 'historyQueryShow').length, 1);
});

test('late Graph method shadow after accepted Show declines before metadata callbacks and executes canonical suffix once', async (t) => {
  const { Graph } = installed('@teambit/graph.cleargraph');
  const descriptor = Object.getOwnPropertyDescriptor(Graph.prototype, 'setNodes');
  t.after(() => Object.defineProperty(Graph.prototype, 'setNodes', descriptor));
  const value = collisionFixture(),
    initialTag = value.model.lastFoundTag;
  let writes = 0;
  const frames = setup(t, async (input, accepted) => {
    if (input.kind === 'historyQueryShow' && accepted > 0)
      Object.defineProperty(Graph.prototype, 'setNodes', {
        ...descriptor,
        value(nodes) {
          writes++;
          return descriptor.value.call(this, nodes);
        },
      });
  });
  const native = await broker.withRustHistoryQueryOperation(() =>
    graphApi.getRustHistoryQueryHistoryGraph(value.history, value.model, value.repository, value.heads, true)
  );
  assert.equal(native, undefined);
  assert.equal(value.model.lastFoundTag, initialTag, 'no speculative getTag metadata callbacks');
  assert.equal(writes, 0, 'changed Graph method must not receive Native payload');
  value.history.getGraph(value.model, value.heads, true);
  assert.equal(writes, 1, 'public canonical graph suffix runs its current method once');
  assert.equal(frames.filter((frame) => frame.input.kind === 'historyQueryShow' && frame.accepted).length, 1);
});
