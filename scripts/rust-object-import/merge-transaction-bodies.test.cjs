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
