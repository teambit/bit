const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { installed, source } = require('./load-source.cjs');
const api =
  process.env.BIT_TEST_HISTORY_QUERY_COMPILED === '1'
    ? installed('@teambit/objects/dist/objects/rust-history-query.js')
    : source('scopes/scope/objects/objects/rust-history-query.ts');
const materializer = installed(
  path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
);
const restored = new WeakSet();

function owner(t, respond) {
  if (!restored.has(t)) {
    restored.add(t);
    const original = materializer.acquireWorkspaceSession;
    const flag = process.env.BIT_RUST_CLIENT_VCS;
    t.after(() => {
      materializer.acquireWorkspaceSession = original;
      if (flag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
      else process.env.BIT_RUST_CLIENT_VCS = flag;
    });
  }
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  const frames = [],
    effects = { leases: 0, release: 0, dispose: 0 };
  const session = {
    usable: true,
    async dispose() {
      this.usable = false;
      effects.dispose++;
    },
    async request(build, count, validate) {
      const input = JSON.parse(build(frames.length + 1).subarray(12));
      frames.push(input);
      const data = await respond(input);
      if (data !== undefined) {
        const response = { version: 1, id: frames.length, completed: count, skipped: [], failed: false, data };
        return validate(response) ? response : undefined;
      }
    },
  };
  materializer.acquireWorkspaceSession = () => {
    effects.leases++;
    return {
      session,
      executable: '/qualification/history-query-helper',
      release: async () => {
        effects.release++;
      },
    };
  };
  return { frames, effects, session };
}

test('nested parallel queries share one queue while public callbacks remain concurrent', async (t) => {
  let active = 0,
    maximum = 0;
  const mock = owner(t, async (input) => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setImmediate(resolve));
    active--;
    return { value: input.value };
  });
  const callbacks = [];
  await api.withRustHistoryQueryOperation(async () => {
    const results = await Promise.all(
      [1, 2, 3].map((value) =>
        api.withRustHistoryQueryOperation(async () => {
          callbacks.push(value);
          return api.requestRustHistoryQuery({ kind: 'historyQueryFiles', value }, (data) => data.value === value);
        })
      )
    );
    assert.deepEqual(
      results.map((result) => result.value),
      [1, 2, 3]
    );
  });
  assert.deepEqual(callbacks, [1, 2, 3]);
  assert.equal(maximum, 1);
  assert.equal(mock.effects.leases, 1);
  assert.equal(mock.effects.release, 1);
});

test('lost receipt retires owner and canonical suffix runs once without another lease', async (t) => {
  const mock = owner(t, async () => undefined);
  const callbacks = [];
  await api.withRustHistoryQueryOperation(async () => {
    callbacks.push('model lookup');
    assert.equal(await api.requestRustHistoryQuery({ kind: 'historyQueryBegin' }, () => true), undefined);
    callbacks.push('canonical suffix');
    assert.equal(await api.requestRustHistoryQuery({ kind: 'historyQueryFiles' }, () => true), undefined);
  });
  assert.deepEqual(callbacks, ['model lookup', 'canonical suffix']);
  assert.equal(mock.frames.length, 1);
  assert.equal(mock.effects.leases, 1);
  assert.equal(mock.session.usable, false);
});

test('token cleanup follows async public callback rejection and preserves exact error identity', async (t) => {
  const token = 'a'.repeat(40),
    error = new Error('public model callback failure');
  const events = [];
  const mock = owner(t, async (input) => {
    events.push(input.kind);
    return { finished: true };
  });
  await assert.rejects(
    api.withRustHistoryQueryOperation(async () => {
      assert.equal(api.retainRustHistoryQueryToken(token), true);
      await new Promise((resolve) => setImmediate(resolve));
      events.push('callback');
      throw error;
    }),
    (actual) => actual === error
  );
  assert.deepEqual(events, ['callback', 'historyQueryFinish']);
  assert.equal(mock.effects.release, 1);
});

test('metadata accessors, sparse arrays and serialization hooks decline without speculative calls', async (t) => {
  const mock = owner(t, async () => ({ accepted: true }));
  let reads = 0;
  const input = { kind: 'historyQueryBegin' };
  Object.defineProperty(input, 'overlays', {
    enumerable: true,
    get() {
      reads++;
      return [];
    },
  });
  await api.withRustHistoryQueryOperation(async () => {
    assert.equal(await api.requestRustHistoryQuery(input, () => true), undefined);
    assert.equal(
      await api.requestRustHistoryQuery({ kind: 'historyQueryBegin', refs: Array(1) }, () => true),
      undefined
    );
    const original = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
    Object.defineProperty(Object.prototype, 'toJSON', {
      configurable: true,
      value() {
        reads++;
        return this;
      },
    });
    try {
      assert.equal(await api.requestRustHistoryQuery({ kind: 'historyQueryBegin' }, () => true), undefined);
    } finally {
      if (original) Object.defineProperty(Object.prototype, 'toJSON', original);
      else delete Object.prototype.toJSON;
    }
  });
  assert.equal(reads, 0);
  assert.equal(mock.frames.length, 0);
});

test('malformed successful ACK cannot mutate public cache or trigger another helper', async (t) => {
  const mock = owner(t, async () => ({ rows: 'not an array', token: 'x' }));
  const cache = { lastFoundTag: '1.0.0' },
    effects = [];
  await api.withRustHistoryQueryOperation(async () => {
    const result = await api.requestRustHistoryQuery(
      { kind: 'historyQueryBegin' },
      (data) => Array.isArray(data.rows) && /^[a-f0-9]{40}$/.test(data.token)
    );
    if (result) cache.lastFoundTag = 'incorrect native mutation';
    else effects.push('canonical traversal once');
    assert.equal(await api.requestRustHistoryQuery({ kind: 'historyQueryFiles' }, () => true), undefined);
  });
  assert.deepEqual(cache, { lastFoundTag: '1.0.0' });
  assert.deepEqual(effects, ['canonical traversal once']);
  assert.equal(mock.frames.length, 1);
  assert.equal(mock.effects.leases, 1);
});

test('late JSON.stringify replacement is never invoked for private frames', async (t) => {
  const mock = owner(t, async () => ({ accepted: true }));
  let calls = 0;
  await api.withRustHistoryQueryOperation(async () => {
    const descriptor = Object.getOwnPropertyDescriptor(JSON, 'stringify');
    Object.defineProperty(JSON, 'stringify', {
      ...descriptor,
      value() {
        calls++;
        throw new Error('private serialization hook');
      },
    });
    try {
      assert.equal(await api.requestRustHistoryQuery({ kind: 'historyQueryBegin' }, () => true), undefined);
    } finally {
      Object.defineProperty(JSON, 'stringify', descriptor);
    }
  });
  assert.equal(calls, 0);
  assert.equal(mock.frames.length, 0);
});

test('delayed sibling during Finish runs its canonical suffix without late token frames', async (t) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let sibling;
  const callbacks = [],
    original = new Error('first public branch rejected');
  const mock = owner(t, async (input) => {
    assert.equal(input.kind, 'historyQueryFinish');
    release();
    await sibling;
    return { finished: true };
  });
  await assert.rejects(
    api.withRustHistoryQueryOperation(async () => {
      api.retainRustHistoryQueryToken('a'.repeat(40));
      sibling = (async () => {
        await gate;
        callbacks.push('late original loader');
        assert.equal(
          await api.requestRustHistoryQuery({ kind: 'historyQueryFiles', token: 'a'.repeat(40) }, () => true),
          undefined
        );
        callbacks.push('late canonical suffix');
      })();
      throw original;
    }),
    (error) => error === original
  );
  assert.deepEqual(callbacks, ['late original loader', 'late canonical suffix']);
  assert.deepEqual(
    mock.frames.map((frame) => frame.kind),
    ['historyQueryFinish']
  );
  assert.equal(mock.effects.leases, 1);
});

test('in-flight ACK after public action closes is discarded before result hydration', async (t) => {
  let release, received;
  const acknowledged = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    received = resolve;
  });
  const mock = owner(t, async () => {
    received();
    await acknowledged;
    return { rows: ['late private result'] };
  });
  let request,
    hydrations = 0;
  const operation = api.withRustHistoryQueryOperation(async () => {
    request = api
      .requestRustHistoryQuery({ kind: 'historyQueryBegin' }, (data) => Array.isArray(data.rows))
      .then((result) => {
        if (result) hydrations++;
        return result;
      });
    return 'original public return';
  });
  await started;
  await new Promise((resolve) => setImmediate(resolve));
  release();
  assert.equal(await request, undefined);
  assert.equal(await operation, 'original public return');
  assert.equal(hydrations, 0);
  assert.equal(mock.session.usable, false);
  assert.equal(mock.frames.length, 1);
  assert.equal(mock.effects.leases, 1);
});

function versionFixture() {
  const compiled = process.env.BIT_TEST_HISTORY_QUERY_COMPILED === '1';
  const objects = compiled ? installed('@teambit/objects') : source('scopes/scope/objects/models/index.ts');
  const Ref = compiled ? objects.Ref : source('scopes/scope/objects/objects/ref.ts').default;
  const version = new objects.Version({
    mainFile: 'index.js',
    files: [],
    parents: [new Ref('b'.repeat(40))],
    log: { message: 'genuine metadata 😀', date: '1700000000000' },
    bindingPrefix: '@qualification',
  });
  version._hash = 'a'.repeat(40);
  return { version, Ref };
}

test('selected log capture preserves aliases and ignores docs/config model-hook getters', () => {
  const { version } = versionFixture();
  let reads = 0;
  for (const name of ['docs', 'overrides'])
    Object.defineProperty(version, name, {
      configurable: true,
      enumerable: true,
      get() {
        reads++;
        throw new Error('unselected field read');
      },
    });
  const parents = version.parents,
    log = version.log;
  const capture = api.captureRustHistoryQueryVersionGuard(version);
  assert.ok(capture, 'genuine default Version must be eligible');
  assert.equal(capture.fresh(), true);
  assert.deepEqual(capture.metadata.parents, ['b'.repeat(40)]);
  assert.equal(version.parents, parents);
  assert.equal(version.log, log);
  assert.equal(reads, 0);
});

test('equal JSON replacements and changed parent Ref invalidate captured aliases', () => {
  for (const mutate of [
    (version) => {
      version.log = { ...version.log };
    },
    (version) => {
      version.parents = [...version.parents];
    },
    (version, Ref) => {
      version.parents[0] = new Ref(version.parents[0].hash);
    },
    (version) => {
      version.parents[0].hash = 'c'.repeat(40);
    },
  ]) {
    const { version, Ref } = versionFixture();
    const capture = api.captureRustHistoryQueryVersionGuard(version);
    assert.ok(capture);
    mutate(version, Ref);
    assert.equal(capture.fresh(), false);
  }
});

test('selected parent/log accessors decline without touching getter or public model methods', () => {
  for (const name of ['parents', 'log']) {
    const { version } = versionFixture();
    let reads = 0;
    Object.defineProperty(version, name, {
      configurable: true,
      enumerable: true,
      get() {
        reads++;
        return [];
      },
    });
    assert.equal(api.captureRustHistoryQueryVersionGuard(version), undefined);
    assert.equal(reads, 0);
  }
});

test('proxy Version/Ref metadata declines before any descriptor or prototype trap', () => {
  const { version } = versionFixture();
  let traps = 0;
  const handler = {
    ownKeys() {
      traps++;
      throw new Error('proxy ownKeys');
    },
    getOwnPropertyDescriptor() {
      traps++;
      throw new Error('proxy descriptor');
    },
    getPrototypeOf() {
      traps++;
      throw new Error('proxy prototype');
    },
    get() {
      traps++;
      throw new Error('proxy get');
    },
  };
  assert.equal(api.captureRustHistoryQueryVersionGuard(new Proxy(version, handler)), undefined);
  version.parents[0] = new Proxy(version.parents[0], handler);
  assert.equal(api.captureRustHistoryQueryVersionGuard(version), undefined);
  assert.equal(traps, 0);
});

function fileApi() {
  return process.env.BIT_TEST_HISTORY_QUERY_COMPILED === '1'
    ? installed('@teambit/objects/dist/objects/rust-history-query-files.js')
    : source('scopes/scope/objects/objects/rust-history-query-files.ts');
}

test('file lineage captures original Source Ref/row aliases without reading unrelated artifact metadata', () => {
  const { version, Ref } = versionFixture();
  const row = { relativePath: 'unicodé.js', name: 'unicodé.js', test: false, file: new Ref('c'.repeat(40)) };
  version.files = [row];
  let reads = 0;
  Object.defineProperty(version, 'docs', {
    configurable: true,
    get() {
      reads++;
      throw new Error('docs read');
    },
  });
  const captured = fileApi().captureRustHistoryFileVersion(version);
  assert.ok(captured);
  assert.equal(captured.fresh(), true);
  assert.equal(version.files[0], row);
  assert.equal(captured.overlay.files[0].file, row.file.hash);
  const original = row.file;
  row.file = new Ref(original.hash);
  assert.equal(captured.fresh(), false, 'equal Source hash cannot hide a changed public Ref alias');
  assert.equal(reads, 0);
});

test('file row getter and late equal-valued row replacement refuse native lineage without getter reads', () => {
  const { version, Ref } = versionFixture();
  const row = { relativePath: 'index.js', file: new Ref('c'.repeat(40)) };
  version.files = [row];
  const captured = fileApi().captureRustHistoryFileVersion(version);
  assert.ok(captured);
  version.files[0] = { ...row };
  assert.equal(captured.fresh(), false);
  let reads = 0;
  Object.defineProperty(version.files[0], 'file', {
    configurable: true,
    enumerable: true,
    get() {
      reads++;
      return row.file;
    },
  });
  assert.equal(fileApi().captureRustHistoryFileVersion(version), undefined);
  assert.equal(reads, 0);
});

test('genuine diamond/hidden/squashed/unrelated/lane topology retains parent and log identities', () => {
  const { createTopology, kinds } = require('./history-query-topology.cjs');
  const compiled = process.env.BIT_TEST_HISTORY_QUERY_COMPILED === '1';
  const models = compiled ? installed('@teambit/objects') : source('scopes/scope/objects/models/index.ts');
  const Ref = compiled ? models.Ref : source('scopes/scope/objects/objects/ref.ts').default;
  const { LaneId } = installed('@teambit/lane-id');
  for (const kind of kinds) {
    const topology = createTopology({ ...models, Ref, LaneId }, kind);
    for (const alias of topology.aliases) {
      const captured = api.captureRustHistoryQueryVersionGuard(alias.version);
      assert.ok(captured, `${kind}: actual Version projection`);
      assert.equal(captured.fresh(), true);
      assert.equal(alias.version.parents, alias.parents);
      assert.equal(alias.version.log, alias.log);
    }
    assert.equal(topology.versions[3].parents.length, 2, 'diamond must retain both parents');
    if (kind === 'hidden') assert.equal(topology.versions[4].hidden, true);
    if (kind === 'squashed') assert.equal(topology.versions[5].squashed.previousParents[0].hash, topology.hashes[4]);
    if (kind === 'unrelated') assert.equal(topology.versions[5].unrelated.head.hash, topology.hashes[2]);
  }
});

function graphFixture() {
  // Loading the actual defining VersionHistory module supplies defaults; tests
  // never register an arbitrary graph constructor as trusted.
  if (process.env.BIT_TEST_HISTORY_QUERY_COMPILED === '1') installed('@teambit/objects');
  else source('scopes/scope/objects/models/version-history.ts');
  const { Graph, Node, Edge } = installed('@teambit/graph.cleargraph');
  const nodes = ['root', 'left', 'right', 'merge'].map((id) => new Node(id, { original: id }));
  const graph = new Graph();
  graph.setNodes(nodes);
  graph.setEdges([
    new Edge('merge', 'left', 'parent'),
    new Edge('merge', 'right', 'parent'),
    new Edge('left', 'root', 'parent'),
    new Edge('right', 'root', 'parent'),
  ]);
  const api =
    process.env.BIT_TEST_HISTORY_QUERY_COMPILED === '1'
      ? installed('@teambit/objects/dist/objects/rust-history-query-graph.js')
      : source('scopes/scope/objects/objects/rust-history-query-graph.ts');
  return { graph, nodes, Node, api };
}

test('graph ranking returns original Node/data aliases under actual defining defaults', async (t) => {
  const { graph, api: graphApi } = graphFixture();
  const canonical = graph.toposort();
  const mock = owner(t, async (input) => ({ order: canonical.map((node) => input.nodes.indexOf(node.id)) }));
  const ranked = await api.withRustHistoryQueryOperation(() => graphApi.getRustHistoryQueryGraphOrder(graph));
  assert.ok(ranked);
  assert.deepEqual(ranked, canonical);
  for (let index = 0; index < ranked.length; index++) {
    assert.equal(ranked[index], canonical[index]);
    assert.equal(ranked[index].attr, canonical[index].attr);
  }
  assert.deepEqual(
    mock.frames.map((frame) => frame.kind),
    ['historyQueryToposort']
  );
});

test('graph same-value node replacement during ACK declines without recomputing public discovery', async (t) => {
  const { graph, Node, api: graphApi } = graphFixture();
  const canonical = graph.toposort();
  const mock = owner(t, async (input) => {
    const node = canonical[0];
    graph._nodes.set(node.id, new Node(node.id, node.attr));
    return { order: canonical.map((entry) => input.nodes.indexOf(entry.id)) };
  });
  const ranked = await api.withRustHistoryQueryOperation(() => graphApi.getRustHistoryQueryGraphOrder(graph));
  assert.equal(ranked, undefined);
  assert.equal(mock.frames.length, 1);
});

test('graph id accessor and malformed rank refuse without speculative getter or graph mutation', async (t) => {
  for (const mode of ['getter', 'duplicate-rank']) {
    const { graph, nodes, api: graphApi } = graphFixture();
    const ids = nodes.map((node) => node.id);
    let reads = 0;
    if (mode === 'getter')
      Object.defineProperty(nodes[0], 'id', {
        configurable: true,
        enumerable: true,
        get() {
          reads++;
          return ids[0];
        },
      });
    const mock = owner(t, async () => ({ order: [0, 0, 2, 3] }));
    const result = await api.withRustHistoryQueryOperation(() => graphApi.getRustHistoryQueryGraphOrder(graph));
    assert.equal(result, undefined);
    assert.equal(reads, 0);
    assert.equal(mock.frames.length, mode === 'getter' ? 0 : 1);
    if (mode === 'duplicate-rank')
      assert.deepEqual(
        nodes.map((node) => node.id),
        ids
      );
  }
});

function repositoryFixture() {
  const compiled = process.env.BIT_TEST_HISTORY_QUERY_COMPILED === '1';
  const models = compiled ? installed('@teambit/objects') : source('scopes/scope/objects/models/index.ts');
  const Repository = compiled ? models.Repository : source('scopes/scope/objects/objects/repository.ts').default;
  // Source TypeScript import-star creates accessors; Babel uses node:path DATA.
  if (!compiled)
    source('scopes/scope/objects/objects/rust-snapshot-guards.ts').registerRustSnapshotFunctions(
      'SnapshotRepositoryPath',
      require('node:path'),
      ['join', 'resolve', 'dirname', 'basename']
    );
  const repository = new Repository(path.join(require('node:os').tmpdir(), 'history-query-cache-fixture'), {
    name: 'qualification.history',
  });
  return { repository, models };
}

test('ordinary pending Version takes precedence over cached aliases without model callbacks', async (t) => {
  const { repository } = repositoryFixture();
  const original = versionFixture().version;
  const pending = versionFixture().version;
  pending.log.message = 'pending live alias wins';
  repository.add(original);
  repository.objects[original.hash().toString()] = pending;
  const mock = owner(t, async () => {
    throw new Error('pure capture must not request a helper');
  });
  await api.withRustHistoryQueryOperation(async () => {
    assert.equal(api.canUseRustHistoryQueryRepository(repository), true, 'actual defining Repository/bootstrap');
    const captured = api.captureRustHistoryQueryObjects(repository);
    assert.ok(captured);
    assert.equal(captured.filter(([hash]) => hash === original.hash().toString()).length, 1);
    assert.equal(captured.find(([hash]) => hash === original.hash().toString())[1], pending);
  });
  assert.equal(mock.frames.length, 0);
});

test('cached Source forbids native blame bypass without reading its live body getter', async (t) => {
  const { repository, models } = repositoryFixture();
  const value = models.Source.from(Buffer.from('cached live Source\n'));
  const hash = value.hash().toString();
  repository.add(value);
  let reads = 0;
  Object.defineProperty(value, 'contents', {
    configurable: true,
    enumerable: true,
    get() {
      reads++;
      throw new Error('cached body read');
    },
  });
  const mock = owner(t, async () => {
    throw new Error('cached Source must not enter Native reader');
  });
  await api.withRustHistoryQueryOperation(async () => {
    api.rememberRustHistoryQueryLogToken('a'.repeat(40));
    const result = await fileApi().getRustHistoryBlame(repository, [
      { hash: 'b'.repeat(40), fileHash: hash, parentHashes: [], message: 'cached body callback' },
    ]);
    assert.equal(result, undefined);
  });
  assert.equal(reads, 0);
  assert.equal(mock.frames.length, 0);
});

test('Files receipt freshness rejects late getters/equal-row replacements and retains healthy extra aliases', async (t) => {
  for (const mode of ['getter', 'row', 'parents', 'healthy']) {
    const { version, Ref } = versionFixture();
    version.files = [{ relativePath: 'index.js', file: new Ref('c'.repeat(40)) }];
    const captures = [fileApi().captureRustHistoryFileVersion(version)];
    assert.ok(captures[0]);
    const extra = { nested: ['caller metadata alias'] };
    const logs = [{ hash: version._hash, message: 'observed loader result', parentHashes: [], extra }];
    let reads = 0;
    const mock = owner(t, async () => {
      if (mode === 'getter')
        Object.defineProperty(logs[0], 'hash', {
          configurable: true,
          enumerable: true,
          get() {
            reads++;
            return version._hash;
          },
        });
      if (mode === 'row') logs[0] = { ...logs[0] };
      if (mode === 'parents') logs[0].parentHashes = [];
      return { logs: [{ hash: version._hash, fileHash: 'c'.repeat(40), parentHashes: [], logIndex: 0 }] };
    });
    const result = await api.withRustHistoryQueryOperation(async () => {
      api.rememberRustHistoryQueryLogToken('a'.repeat(40));
      return fileApi().getRustHistoryFileLineage('index.js', logs, captures);
    });
    if (mode === 'healthy') {
      assert.ok(result);
      assert.equal(result[0].extra, extra);
    } else assert.equal(result, undefined);
    assert.equal(reads, 0);
    assert.equal(mock.frames.length, 1);
  }
});

test('genuine hydrated Source clone retains owner provenance and refuses live Buffer/cache changes', async (t) => {
  // The defining Sources module depends on the installed Objects owner in both loader modes.
  const query = installed('@teambit/objects/dist/objects/rust-history-query.js');
  const { Repository, Source, Ref } = installed('@teambit/objects');
  const provenance = installed('@teambit/component.sources/dist/rust-checkout-source.js');
  const repository = new Repository(path.join(require('node:os').tmpdir(), 'history-query-hydrated-source'), {
    name: 'qualification.history',
  });
  const value = Source.from(Buffer.from('immutable capsule body\n'));
  const reference = new Ref(value.hash().toString());
  repository.setCache(value);
  const mock = owner(t, async () => {
    throw new Error('provenance capture is pure');
  });
  const model = { name: 'file.txt', relativePath: 'file.txt', file: reference, test: false };
  await query.withRustHistoryQueryOperation(async () => {
    const file = provenance.createRustCheckoutSourceFile(model, repository, true);
    assert.ok(file, 'genuine repository and default SourceFile factory');
    assert.equal(file.contents, value.contents, 'canonical getter preserves cached Source Buffer');
    const clone = file.clone();
    assert.equal(clone.contents, file.contents);
    assert.ok(provenance.getRustHistorySourceDescriptor(file, repository));
    assert.ok(provenance.getRustHistorySourceDescriptor(clone, repository));
    const originalEquals = Object.getOwnPropertyDescriptor(Buffer.prototype, 'equals');
    let reads = 0;
    Object.defineProperty(Buffer.prototype, 'equals', {
      configurable: true,
      get() {
        reads++;
        throw new Error('equals getter');
      },
    });
    try {
      assert.equal(provenance.getRustHistorySourceDescriptor(file, repository), undefined);
    } finally {
      Object.defineProperty(Buffer.prototype, 'equals', originalEquals);
    }
    assert.equal(reads, 0);
    file.contents[0] ^= 1;
    assert.equal(provenance.getRustHistorySourceDescriptor(file, repository), undefined);
    assert.equal(provenance.getRustHistorySourceDescriptor(clone, repository), undefined);
  });
  assert.equal(mock.frames.length, 0);
});

test('Source setter and arbitrary cached replacement cannot retain query provenance', async (t) => {
  const query = installed('@teambit/objects/dist/objects/rust-history-query.js');
  const { Repository, Source, Ref } = installed('@teambit/objects');
  const provenance = installed('@teambit/component.sources/dist/rust-checkout-source.js');
  const repository = new Repository(path.join(require('node:os').tmpdir(), 'history-query-source-replacement'), {
    name: 'qualification.history',
  });
  const value = Source.from(Buffer.from('original immutable body\n'));
  const reference = new Ref(value.hash().toString());
  repository.setCache(value);
  owner(t, async () => {
    throw new Error('no private Source request');
  });
  const model = { name: 'file.txt', relativePath: 'file.txt', file: reference, test: false };
  await query.withRustHistoryQueryOperation(async () => {
    const file = provenance.createRustCheckoutSourceFile(model, repository, true);
    const body = file.contents;
    assert.ok(provenance.getRustHistorySourceDescriptor(file, repository));
    let reads = 0;
    const changed = Source.from(Buffer.from(body));
    Object.defineProperty(changed, 'contents', {
      configurable: true,
      enumerable: true,
      get() {
        reads++;
        throw new Error('cached body getter');
      },
    });
    repository.objects[reference.toString()] = changed;
    assert.equal(provenance.getRustHistorySourceDescriptor(file, repository), undefined);
    assert.equal(reads, 0);
    delete repository.objects[reference.toString()];
    file.contents = Buffer.from(body);
    assert.equal(provenance.getRustHistorySourceDescriptor(file, repository), undefined);
  });
});
// Append to history-query.test.cjs after final frozen proof exits. Uses genuine defining installed owner in both loaders.
test('private Source capsule cleanup preserves captured authority after a late fs.remove hook', async (t) => {
  const query = installed('@teambit/objects/dist/objects/rust-history-query.js');
  assert.equal(typeof installed('@teambit/objects').Repository, 'function', 'load genuine defining FS registration');
  const disk = installed('fs-extra');
  const promises = require('node:fs/promises');
  const original = Object.getOwnPropertyDescriptor(disk, 'remove');
  let directory, calls = 0;
  owner(t, async () => { throw new Error('private directory cleanup needs no Native request'); });
  try {
    await query.withRustHistoryQueryOperation(async () => {
      directory = await query.getRustHistoryQuerySourceDirectory();
      assert.ok(directory, 'default defining FS eligibility creates real private directory');
      Object.defineProperty(disk, 'remove', { ...original, value: async () => { calls++; } });
    });
  } finally {
    Object.defineProperty(disk, 'remove', original);
  }
  assert.equal(calls, 0, 'private cleanup must not invoke newly installed public compatibility hook');
  await assert.rejects(promises.stat(directory), { code: 'ENOENT' });
});
