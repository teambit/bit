const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { source, installed, root } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_SNAPSHOT_TRANSACTION_COMPILED === '1';
const adapter = compiled
  ? require(path.join(path.dirname(installed.resolve('@teambit/objects')), 'objects/rust-snapshot-transaction.js'))
  : source('scopes/scope/objects/objects/rust-snapshot-transaction.ts');
const phases = [
  'initialize',
  'preSnap',
  'prepareVersions',
  'captureLane',
  'softTag',
  'flattenDependencies',
  'addObjects',
  'updateWorkspace',
  'stagedWrite',
  'hydrateBuild',
  'removeWorkspace',
  'addLane',
  'persist',
  'mergeConfigCleanup',
  'linkWorkspace',
  'clearCache',
];

// A helper may disappear AFTER a public effect; the journal must never replay that effect.
async function withLostHelper(receipt, action) {
  const sources = require(
    path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-persistence.js')
  );
  const original = sources.withWorkspaceSession;
  const oldFlag = process.env.BIT_RUST_CLIENT_VCS;
  const requests = [];
  const session = {
    usable: true,
    async dispose() {
      this.usable = false;
    },
  };
  session.request = async (build, _count, validate) => {
    const input = JSON.parse(build(0).subarray(12));
    requests.push(input);
    if (input.kind === 'snapshotTransactionBegin') {
      validate({
        completed: 1,
        failed: false,
        data: {
          token: 'a'.repeat(40),
          revision: 0,
          directive: { kind: 'initialize', index: 0, count: 1 },
        },
      });
      return;
    }
    if (receipt(input, requests)) {
      session.usable = false;
      return;
    }
    const full = [
      ['initialize', 0],
      ['preSnap', 0],
      ['prepareVersions', 0],
      ['captureLane', 0],
      ['flattenDependencies', 0],
      ['addObjects', 0],
      ['updateWorkspace', 0],
      ['addObjects', 1],
      ['updateWorkspace', 1],
      ['stagedWrite', 0],
      ['hydrateBuild', 0],
      ['removeWorkspace', 0],
      ['addLane', 0],
      ['persist', 0],
      ['mergeConfigCleanup', 0],
      ['linkWorkspace', 0],
      ['clearCache', 0],
      ['done', 0],
    ];
    const [kind, index] = full[input.revision + 1];
    validate({
      completed: 1,
      failed: false,
      data: {
        token: 'a'.repeat(40),
        revision: input.revision + 1,
        directive: { kind, index, count: kind === 'done' ? 0 : 1 },
      },
    });
  };
  sources.withWorkspaceSession = (callback) => callback(session);
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  try {
    return await action(requests);
  } finally {
    sources.withWorkspaceSession = original;
    if (oldFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = oldFlag;
  }
}
function options(events, extra = {}) {
  return {
    soft: false,
    eligible: () => true,
    componentCount: () => 2,
    actions: Object.fromEntries(phases.map((phase) => [phase, async (index) => events.push([phase, index])])),
    result: () => events,
    ...extra,
  };
}

test('lost receipt after initialize completes the remaining public phases exactly once', async () => {
  const events = [];
  await withLostHelper(
    () => true,
    async (requests) => {
      const result = await adapter.runRustSnapshotPhases(options(events));
      assert.equal(result, events);
      assert.deepEqual(events, [
        ['initialize', 0],
        ['preSnap', 0],
        ['prepareVersions', 0],
        ['captureLane', 0],
        ['flattenDependencies', 0],
        ['addObjects', 0],
        ['updateWorkspace', 0],
        ['addObjects', 1],
        ['updateWorkspace', 1],
        ['stagedWrite', 0],
        ['hydrateBuild', 0],
        ['removeWorkspace', 0],
        ['addLane', 0],
        ['persist', 0],
        ['mergeConfigCleanup', 0],
        ['linkWorkspace', 0],
        ['clearCache', 0],
      ]);
      assert.equal(requests.length, 2);
      assert.equal(requests[1].completed, 1);
    }
  );
});

test('soft tag captures the lane and stops before object persistence or workspace linking', async () => {
  const events = [];
  await withLostHelper(
    () => true,
    () => adapter.runRustSnapshotPhases(options(events, { soft: true }))
  );
  assert.deepEqual(
    events.map(([phase]) => phase),
    ['initialize', 'preSnap', 'prepareVersions', 'captureLane', 'softTag']
  );
});

test('canonical suffix follows an adaptive component iterator after completed workspace callbacks', async () => {
  const events = [],
    components = ['first', 'second'];
  const config = options(events, { componentCount: () => components.length });
  config.actions.addObjects = async (index) => events.push(['object', components[index]]);
  config.actions.updateWorkspace = async (index) => {
    events.push(['workspace', components[index]]);
    if (index === 0) {
      components[1] = 'replacement';
      components.push('appended');
    }
  };
  await withLostHelper(
    () => true,
    () => adapter.runRustSnapshotPhases(config)
  );
  assert.deepEqual(
    events.filter(([phase]) => ['object', 'workspace'].includes(phase)),
    [
      ['object', 'first'],
      ['workspace', 'first'],
      ['object', 'replacement'],
      ['workspace', 'replacement'],
      ['object', 'appended'],
      ['workspace', 'appended'],
    ]
  );
});

test('public failure keeps the original error and completed prefix without cleanup phases', async () => {
  const events = [],
    failure = new Error('public workspace hook failed');
  const config = options(events);
  config.actions.updateWorkspace = async () => {
    throw failure;
  };
  await withLostHelper(
    () => true,
    async () => {
      await assert.rejects(adapter.runRustSnapshotPhases(config), (error) => error === failure);
    }
  );
  assert.deepEqual(
    events.map(([phase]) => phase),
    ['initialize', 'preSnap', 'prepareVersions', 'captureLane', 'flattenDependencies', 'addObjects']
  );
});

test('pre-snap callback can change soft tagging before the capture-lane decision', async () => {
  const events = [];
  let soft = false;
  const config = options(events, { soft: () => soft });
  config.actions.preSnap = async () => {
    events.push(['preSnap', 0]);
    soft = true;
  };
  await withLostHelper(
    () => true,
    () => adapter.runRustSnapshotPhases(config)
  );
  assert.deepEqual(
    events.map(([phase]) => phase),
    ['initialize', 'preSnap', 'prepareVersions', 'captureLane', 'softTag']
  );
});

test('lost receipts after public preparation, workspace and persistence effects never repeat callbacks', async () => {
  for (const revision of [1, 3, 6, 13]) {
    const events = [];
    await withLostHelper(
      (input) => input.revision === revision,
      () => adapter.runRustSnapshotPhases(options(events))
    );
    assert.equal(events.length, 17);
    assert.equal(events.filter(([phase]) => phase === 'persist').length, 1);
    assert.equal(events.filter(([phase]) => phase === 'preSnap').length, 1);
    assert.deepEqual(
      events.filter(([phase]) => phase === 'updateWorkspace').map(([, index]) => index),
      [0, 1]
    );
  }
});

test('ordinary metadata cannot forge the ArtifactFiles transport marker', () => {
  const projection = compiled
    ? require(path.join(path.dirname(installed.resolve('@teambit/objects')), 'objects/rust-snapshot-projection.js'))
    : source('scopes/scope/objects/objects/rust-snapshot-projection.ts');
  const guards = compiled
    ? require(path.join(path.dirname(installed.resolve('@teambit/objects')), 'objects/rust-snapshot-guards.js'))
    : source('scopes/scope/objects/objects/rust-snapshot-guards.ts');
  guards.registerRustSnapshotTransactionClass('Array', Array);
  const ref = 'a'.repeat(40);
  const data = {
    artifacts: [{ files: { snapshotArtifactFiles: true, refs: [{ relativePath: 'dist/index.js', ref }] } }],
  };
  assert.equal(projection.projectRustSnapshotFields(data), undefined);
  assert.ok(projection.projectRustSnapshotFields({ artifacts: [], message: 'ordinary metadata' }));
});

test('the real native journal drives public phases using a single pinned session', async () => {
  const helper =
    process.env.BIT_TEST_OBJECT_IMPORT ||
    path.join(root, 'native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));
  assert.ok(helper, 'BIT_TEST_OBJECT_IMPORT must identify the built native helper');
  const Session = require(
    path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
  ).MaterializationSession;
  const originalRequest = Session.prototype.request;
  const oldFlag = process.env.BIT_RUST_CLIENT_VCS,
    oldHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  const owners = new Set(),
    replies = [];
  Session.prototype.request = function (build, count, validate, ...rest) {
    const input = JSON.parse(build(0).subarray(12));
    if (!['snapshotTransactionBegin', 'snapshotTransactionReceipt'].includes(input.kind))
      return originalRequest.call(this, build, count, validate, ...rest);
    owners.add(this);
    return originalRequest.call(
      this,
      build,
      count,
      (response) => {
        replies.push(response);
        return validate(response);
      },
      ...rest
    );
  };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  const events = [];
  try {
    await adapter.runRustSnapshotPhases(options(events));
    assert.equal(events.length, 17);
    assert.equal(owners.size, 1);
    assert.equal(replies.length, 18, JSON.stringify(replies));
    assert.ok(replies.every((reply) => reply.completed === 1 && !reply.failed));
    assert.equal(replies.at(-1).data.directive.kind, 'done');
  } finally {
    Session.prototype.request = originalRequest;
    if (oldFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = oldFlag;
    if (oldHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = oldHelper;
  }
});

test('snapshot metadata accessors and JSON callbacks decline without speculative invocation', () => {
  const projection = compiled
    ? require(path.join(path.dirname(installed.resolve('@teambit/objects')), 'objects/rust-snapshot-projection.js'))
    : source('scopes/scope/objects/objects/rust-snapshot-projection.ts');
  let calls = 0;
  const data = {};
  Object.defineProperty(data, 'message', {
    enumerable: true,
    get() {
      calls++;
      throw new Error('metadata getter');
    },
  });
  assert.equal(projection.projectRustSnapshotFields({ data }), undefined);
  assert.equal(calls, 0);
  const callback = {
    toJSON() {
      calls++;
      return { message: 'custom' };
    },
  };
  assert.equal(projection.projectRustSnapshotFields({ data: callback }), undefined);
  assert.equal(calls, 0);
  const cycle = {};
  cycle.self = cycle;
  assert.equal(projection.projectRustSnapshotFields({ data: cycle }), undefined);
  assert.equal(projection.projectRustSnapshotFields({ data: { count: 1n } }), undefined);
});

test('native journal retirement honors a soft-mode change without repeating capture callbacks', async () => {
  const helper =
    process.env.BIT_TEST_OBJECT_IMPORT ||
    path.join(root, 'native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));
  const oldFlag = process.env.BIT_RUST_CLIENT_VCS,
    oldHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  let soft = false;
  const events = [];
  const config = options(events, { soft: () => soft });
  config.actions.preSnap = async () => {
    events.push(['preSnap', 0]);
    soft = true;
  };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  try {
    await adapter.runRustSnapshotPhases(config);
    assert.deepEqual(
      events.map(([phase]) => phase),
      ['initialize', 'preSnap', 'prepareVersions', 'captureLane', 'softTag']
    );
  } finally {
    if (oldFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = oldFlag;
    if (oldHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = oldHelper;
  }
});

test('changed JSON transport intrinsics decline without invoking hooks or repeating public phases', async () => {
  for (const target of ['stringify', 'object', 'array']) {
    const events = [];
    let calls = 0;
    await withLostHelper(
      () => false,
      async (requests) => {
        const owner = target === 'stringify' ? JSON : target === 'object' ? Object.prototype : Array.prototype;
        const name = target === 'stringify' ? 'stringify' : 'toJSON';
        const original = Object.getOwnPropertyDescriptor(owner, name);
        Object.defineProperty(owner, name, {
          configurable: true,
          writable: true,
          value() {
            calls++;
            throw new Error('private JSON hook invoked');
          },
        });
        try {
          await adapter.runRustSnapshotPhases(options(events));
        } finally {
          if (original) Object.defineProperty(owner, name, original);
          else delete owner[name];
        }
        assert.equal(calls, 0, target);
        assert.equal(requests.length, 0, target);
        assert.equal(events.length, 17, target);
        assert.equal(events.filter(([phase]) => phase === 'initialize').length, 1);
        assert.equal(events.filter(([phase]) => phase === 'persist').length, 1);
      }
    );
  }
});
