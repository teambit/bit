const { test } = require('node:test');
const assert = require('node:assert/strict');
const { installed, source } = require('./load-source.cjs');
const api =
  process.env.BIT_TEST_MERGE_TRANSACTION_COMPILED === '1'
    ? installed('@teambit/component.modules.merge-helper/dist/rust-merge-body-plan.js')
    : source('scopes/component/modules/merge-helper/rust-merge-body-plan.ts');

function retained() {
  const body = Buffer.from('canonical current bytes');
  const clone = { _contents: body };
  let reads = 0;
  const row = { filePath: 'index.js' };
  Object.defineProperty(row, 'output', {
    configurable: true,
    enumerable: true,
    get() {
      reads++;
      return 'public output';
    },
  });
  const results = { modifiedFiles: [row] };
  const plan = {
    ownerToken: 'owner',
    snapshotDirectory: '/owned',
    token: 'plan',
    index: 0,
    bodies: [{ planIndex: 0, spoolPath: '/owned/spool', spoolHash: 'a'.repeat(40), bytes: body.length }],
    rows: [{ kind: 'modifiedFiles', current: 0, outputPlanIndex: 0 }],
    currentFiles: [],
    currentRows: [],
    currentClones: [clone],
    targetManifest: { hash: 'b'.repeat(40), files: [] },
    valid: () => true,
  };
  api.rememberRustMergeResultBodyPlan(results, plan);
  return { results, plan, row, clone, body, reads: () => reads };
}

test('retained merge row lookup preserves public lazy output without reading it', () => {
  const fixture = retained();
  const plan = api.getRustMergeResultBodyPlan(fixture.results);
  assert.ok(plan);
  assert.strictEqual(plan.currentClones[0], fixture.clone);
  assert.strictEqual(fixture.clone._contents, fixture.body);
  assert.equal(fixture.reads(), 0);
});

test('same-valued row replacement and changed output getter invalidate retained plan without invoking either getter', () => {
  const first = retained();
  first.results.modifiedFiles[0] = { filePath: 'index.js' };
  assert.equal(api.getRustMergeResultBodyPlan(first.results), undefined);
  assert.equal(first.reads(), 0);
  const second = retained();
  let replacementReads = 0;
  Object.defineProperty(second.row, 'output', {
    configurable: true,
    enumerable: true,
    get() {
      replacementReads++;
      return 'public output';
    },
  });
  assert.equal(api.getRustMergeResultBodyPlan(second.results), undefined);
  assert.equal(second.reads(), 0);
  assert.equal(replacementReads, 0);
});

test('shared current clone byte mutation invalidates native reuse while preserving the original public Buffer alias', () => {
  const fixture = retained();
  fixture.body[0] ^= 1;
  assert.equal(api.getRustMergeResultBodyPlan(fixture.results), undefined);
  assert.strictEqual(fixture.clone._contents, fixture.body);
  assert.equal(fixture.reads(), 0);
});
test('empty retained body metadata keeps explicit snapshot directory and privately captures later body records', () => {
  // This exercises the empty protocol plan boundary; canonical public Versions require nonempty files.
  assert.equal(typeof installed('@teambit/objects').Version, 'function');
  const fixture = retained();
  fixture.plan.bodies = [];
  api.rememberRustMergeResultBodyPlan(fixture.results, fixture.plan);
  const retainedPlan = api.getRustMergeResultBodyPlan(fixture.results);
  assert.ok(retainedPlan);
  assert.equal(retainedPlan.snapshotDirectory, '/owned');
  const added = { planIndex: 7, spoolPath: '/owned/late-target', spoolHash: 'c'.repeat(40), bytes: 4 };
  assert.equal(api.appendRustMergeBodyPlanBodies(fixture.results, [added]), true);
  added.spoolPath = '/untrusted/changed';
  assert.equal(api.getRustMergeResultBodyPlan(fixture.results).bodies[0].spoolPath, '/owned/late-target');
  let reads = 0;
  const accessor = { planIndex: 8, spoolHash: 'd'.repeat(40), bytes: 4 };
  Object.defineProperty(accessor, 'spoolPath', {
    enumerable: true,
    get() {
      reads++;
      return '/owned/late-other';
    },
  });
  assert.equal(api.appendRustMergeBodyPlanBodies(fixture.results, [accessor]), false);
  assert.equal(reads, 0);
  assert.equal(retainedPlan.bodies.length, 1);
});
test('public merge row prototype mutation invalidates native plan without inspecting new inherited getters', () => {
  const fixture = retained();
  let reads = 0;
  const prototype = {};
  Object.defineProperty(prototype, 'fsFile', {
    get() {
      reads++;
      throw new Error('inherited getter must stay unread');
    },
  });
  Object.setPrototypeOf(fixture.row, prototype);
  assert.equal(api.getRustMergeResultBodyPlan(fixture.results), undefined);
  assert.equal(reads, 0);
});
test('private retained body prototype mutation invalidates native plan with identical own metadata', () => {
  const fixture = retained();
  Object.setPrototypeOf(fixture.plan.bodies[0], {});
  assert.equal(api.getRustMergeResultBodyPlan(fixture.results), undefined);
});
test('public merge array prototype mutation refuses native reuse without inherited iterator reads', () => {
  const fixture = retained();
  let reads = 0;
  const prototype = Object.create(Array.prototype);
  Object.defineProperty(prototype, Symbol.iterator, {
    get() {
      reads++;
      throw new Error('iterator must stay unread');
    },
  });
  Object.setPrototypeOf(fixture.results.modifiedFiles, prototype);
  assert.equal(api.getRustMergeResultBodyPlan(fixture.results), undefined);
  assert.equal(reads, 0);
});

test('retained Buffer aliases preserve inert metadata and reject behavior hooks without observing getters', async (t) => {
  const path = require('node:path');
  const disk = require('node:fs/promises');
  const base = await disk.mkdtemp(path.join(require('node:os').tmpdir(), 'retained-buffer-alias-'));
  t.after(() => disk.rm(base, { recursive: true, force: true }));
  const { createHash } = require('node:crypto');
  const sources = installed('@teambit/component.sources');
  const materializer = installed('@teambit/component.sources/dist/rust-workspace-materializer.js');
  const original = materializer.acquireWorkspaceSession;
  const flag = process.env.BIT_RUST_CLIENT_VCS;
  materializer.acquireWorkspaceSession = () => ({
    session: { usable: true, dispose: async () => {} },
    release: async () => {},
  });
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  t.after(() => {
    materializer.acquireWorkspaceSession = original;
    if (flag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = flag;
  });
  let reads = 0;
  await sources.withRustWorkspaceEngine(async () => {
    for (const key of [
      undefined,
      'extra',
      Symbol('extra'),
      'accessor',
      'length',
      'byteLength',
      'byteOffset',
      'buffer',
      'toString',
      'utf8Slice',
      'equals',
      'slice',
      'subarray',
      'copy',
      'constructor',
      'then',
      '_isBuffer',
    ]) {
      const body = Buffer.alloc(64 * 1024, 97);
      if (key === 'extra' || key === 'accessor' || typeof key === 'symbol')
        Object.defineProperty(body, key, {
          configurable: true,
          get() {
            reads++;
            throw new Error('Buffer decoration must remain unread');
          },
        });
      const file = new sources.SourceFile({ base, path: path.join(base, 'index.js'), contents: body });
      const results = {};
      const bodyRecord = {
        planIndex: 0,
        spoolPath: path.join(base, 'private-spool'),
        spoolHash: createHash('sha1').update(body).digest('hex'),
        bytes: body.length + Number(key === 'length'),
      };
      api.rememberRustMergeResultBodyPlan(results, {
        ownerToken: 'a'.repeat(40),
        token: 'b'.repeat(40),
        index: 0,
        snapshotDirectory: base,
        bodies: [bodyRecord],
        rows: [],
        currentFiles: [],
        currentRows: [],
        currentClones: [file],
        targetManifest: { hash: 'c'.repeat(40), files: [] },
        valid: () => true,
      });
      if (typeof key === 'string' && !['extra', 'accessor'].includes(key))
        Object.defineProperty(body, key, {
          configurable: true,
          get() {
            reads++;
            throw new Error('shadowed Buffer length must remain unread');
          },
        });
      assert.equal(
        api.attachRustMergeResultBodies(results, [file], {
          files: [{ index: 0, planIndex: 0, relativePath: 'index.js', aliasKind: 'current', aliasIndex: 0 }],
        }),
        key === undefined || key === 'extra' || key === 'accessor'
      );
      assert.strictEqual(file.contents, body);
      if (key === undefined || key === 'extra' || key === 'accessor') {
        await file.write();
        assert.deepEqual(await disk.readFile(file.path), body);
        assert.strictEqual(file.contents, body);
      }
    }
  });
  assert.equal(reads, 0);
});

test('private Buffer snapshots avoid prototype getters and decline changed byte operations', () => {
  const bytes = Buffer.from([17, 29, 43]);
  let reads = 0;
  for (const [prototype, key] of [
    [Buffer.prototype, 'toString'],
    [Object.getPrototypeOf(Uint8Array.prototype), 'length'],
    [Object.prototype, 'then'],
  ]) {
    const previous = Object.getOwnPropertyDescriptor(prototype, key);
    try {
      Object.defineProperty(prototype, key, {
        configurable: true,
        get() {
          reads++;
          throw new Error('prototype hook');
        },
      });
      assert.equal(api.hasRustMergeBufferPrototypes(), false);
      const copy = api.copyRustMergeBuffer(bytes);
      assert.equal(copy[0], 17);
      assert.equal(copy[2], 43);
    } finally {
      if (previous) Object.defineProperty(prototype, key, previous);
      else delete prototype[key];
    }
  }
  assert.equal(reads, 0);
  assert.equal(api.hasRustMergeBufferPrototypes(), true);
});

test('retarget additions and attachment share one freshness check and copy body metadata', () => {
  assert.equal(typeof installed('@teambit/objects').Version, 'function');
  const fixture = retained();
  let checks = 0;
  fixture.plan.valid = () => {
    checks++;
    return true;
  };
  api.rememberRustMergeResultBodyPlan(fixture.results, fixture.plan);
  const addition = { planIndex: 1, spoolPath: '/owned/retarget', spoolHash: 'c'.repeat(40), bytes: 4 };
  assert.equal(api.attachRustMergeResultBodies(fixture.results, [], { files: [] }, [addition]), true);
  assert.equal(checks, 1);
  addition.bytes = 5;
  const plan = api.getRustMergeResultBodyPlan(fixture.results);
  assert.equal(plan.bodies[1].bytes, 4);
  const before = plan.bodies.slice();
  let reads = 0;
  const invalid = { ...addition, planIndex: 2 };
  Object.defineProperty(invalid, 'bytes', {
    get() {
      reads++;
      throw Error('must remain unread');
    },
  });
  assert.equal(api.attachRustMergeResultBodies(fixture.results, [], { files: [] }, [invalid]), false);
  assert.deepEqual(plan.bodies, before);
  assert.equal(reads, 0);
});

test('combined assembly rechecks retained rows before observing a changed public accessor', () => {
  const fixture = retained();
  const expected = api.getRustMergeResultBodyPlan(fixture.results);
  let reads = 0;
  Object.defineProperty(fixture.row, 'filePath', {
    configurable: true,
    get() {
      reads++;
      throw Error('must remain unread');
    },
  });
  assert.equal(api.assembleRustMergeResultBodies(fixture.results, expected, [], [], []), undefined);
  assert.equal(reads, 0);
});
