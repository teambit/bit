const { test } = require('node:test');
const assert = require('node:assert/strict');
const { source, installed } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_COMMAND_COMPILED === '1';
const load = (name) => compiled ? installed(`@teambit/bit/dist/${name}.js`) : source(`scopes/harmony/bit/${name}.ts`);

test('ordinary tag grammar uses canonical release validation and leaves lifecycle flags canonical', () => {
  const { parseRustWorkspaceTag: parse } = load('rust-workspace-tag-options');
  const basic = parse(['tag']);
  assert.equal(basic.releaseType, 'patch'); assert.equal(basic.incrementBy, 1);
  assert.deepEqual(parse(['tag', 'constructor']).patterns, ['constructor']);
  assert.deepEqual(parse(['t', 'scope/*@minor', '-m', 'release', '--major']).patterns, ['scope/*@minor']);
  assert.equal(parse(['tag', '--increment', 'prerelease', '--prerelease-id', 'dev']).preReleaseId, 'dev');
  assert.equal(parse(['tag', '--ver', 'v2.0.0']).exactVersion, '2.0.0');
  for (const args of [ ['tag', '--build'], ['tag', '--soft'], ['tag', '--persist'], ['tag', '--editor'], ['tag', '--ignore-issues', '*'], ['tag', '--major', '--minor'], ['tag', '--increment', 'wrong'], ['tag', '--auto-tag-increment', 'minor', '--skip-auto-tag'], ['tag', '--increment-by', 'NaN'], ['tag', '--ver', 'wrong'], ['tag', '$modified'] ]) assert.equal(parse(args), undefined, args.join(' '));
});

test('tag report uses the actual canonical TagCmd with semantic IDs and unique publication counts', async () => {
  const { formatRustWorkspaceTag: report } = load('rust-workspace-tag-report');
  const { TagCmd } = installed('@teambit/snapping/dist/tag-cmd.js');
  const { ComponentID, ComponentIdList } = installed('@teambit/component-id');
  const id = (text) => ComponentID.fromString(text);
  const value = { taggedComponents: ['scope/new@0.0.1', 'scope/changed@2.0.0'], newComponents: ['scope/new'], autoTaggedResults: [{ id: 'scope/new@0.0.1', triggeredBy: ['scope/changed'] }], warnings: [], isSoftTag: false, totalComponentsCount: 2 };
  const canonical = { ...value, taggedComponents: value.taggedComponents.map((text) => ({ id: id(text) })), newComponents: ComponentIdList.fromArray(value.newComponents.map(id)), autoTaggedResults: value.autoTaggedResults.map((row) => ({ component: { id: id(row.id) }, triggeredBy: ComponentIdList.fromArray(row.triggeredBy.map(id)) })) };
  const command = new TagCmd({ tag: async () => canonical }, { consoleWarning() {} }, { getConfigBoolean: () => false });
  assert.deepEqual(report(value), await command.report([[]], { message: 'release' }));
  for (const bad of [{ ...value, isSoftTag: true }, { ...value, totalComponentsCount: 3 }, { ...value, taggedComponents: ['scope/new@' + 'a'.repeat(40)] }]) assert.throws(() => report(bad));
});

test('tag pattern receipts retain per-pattern version and order with native eligibility deferred', () => {
  const { tagPatternSelections: select } = load('rust-workspace-tag-selection');
  const context = { targets: [{ identity: 'scope/one' }, { identity: 'scope/two' }] };
  assert.deepEqual(select(context, ['two@minor', 'scope/o*@1.2.3']), [{ identity: 'scope/two', version: 'minor', patternIndex: 0 }, { identity: 'scope/one', version: '1.2.3', patternIndex: 1 }]);
  assert.deepEqual(select(context, ['scope/*', 'scope/missing*', 'two']), [
    { identity: 'scope/one', version: null, patternIndex: 0 },
    { identity: 'scope/two', version: null, patternIndex: 0 },
    { identity: 'scope/two', version: null, patternIndex: 2 },
  ], 'empty pattern groups remain visible through their missing index for native eligibility validation');
  assert.deepEqual(select(context, ['scope/o*,scope/t*']), [
    { identity: 'scope/one', version: null, patternIndex: 0 },
    { identity: 'scope/two', version: null, patternIndex: 0 },
  ]);
  assert.equal(select(context, []), undefined);
  assert.throws(() => select(context, ['$modified']));
  assert.throws(() => select(context, ['missing']));
});

test('ordinary tag validates complete snapshot eligibility before identities and never replays after cache publication', async (t) => {
  const captureModule = load('rust-client-capture');
  const metadata = load('rust-workspace-resolve-metadata');
  const scalars = load('rust-workspace-tag-receipt');
  const config = installed('@teambit/config-store/dist/config-getter.js').configGetter;
  const saved = [];
  const replace = (object, key, value) => {
    const original = object[key];
    saved.push(() => {
      object[key] = original;
    });
    object[key] = value;
  };
  t.after(() => saved.reverse().forEach((restore) => restore()));
  const events = [];
  let failure;
  let forceBuild = false;
  const target = { identity: 'scope/one', version: '1.0.0', directory: 'one' };
  replace(config, 'getConfigBoolean', () => forceBuild);
  replace(metadata, 'resolveSemver', () => ({}));
  replace(metadata, 'resolvePatternIds', () => undefined);
  replace(metadata, 'resolveComponentReceipts', () => []);
  replace(metadata, 'validateResolveIssues', async () => {
    events.push('issues');
    if (failure === 'issues') throw new Error('blocking callback');
  });
  replace(scalars, 'tagSnapshotReceipt', async () => {
    events.push('identities');
    return {};
  });
  replace(captureModule, 'captureRustClientCurrent', async (_root, _context, _request, targets, options) => {
    assert.deepEqual(targets, [target]);
    assert.deepEqual(options, {
      verifyFreshDependencies: true,
      retainDependencyState: true,
      resetDependencyCache: false,
    });
    return {
      captured: [],
      dependencyReadSet: [],
      fresh: () => true,
      commit: async (...args) => {
        assert.deepEqual(args, failure === 'noop' ? [] : [[], false, undefined, false, true]);
        events.push('cache');
        if (failure === 'cache') throw new Error('cache failed');
      },
    };
  });
  replace(captureModule, 'withRustClientRequest', async (action, propagate) => {
    try {
      return await action(async (input) => {
        events.push(input.kind);
        if (input.kind === 'commandTagPrepare')
          return { token: 'token', context: { targets: [target] }, targets: [target], selectedIds: [target.identity] };
        if (input.kind === 'commandTagPlan' && failure === 'noop')
          return { token: 'token', noop: true, needsSnap: [], result: null };
        if (input.kind === 'commandTagPlan')
          return {
            token: 'token',
            needsSnap: [target.identity],
            scalarPreparation: {},
            result:
              failure === 'report'
                ? { invalid: true }
                : {
                    taggedComponents: ['scope/one@1.0.0'],
                    newComponents: [],
                    autoTaggedResults: [],
                    warnings: [], isSoftTag: false,
                    totalComponentsCount: 1,
                  },
          };
        if (input.kind === 'commandTagFinalize')
          return {
            token: 'token',
            result: {
              taggedComponents: ['scope/one@1.0.1'],
              newComponents: [],
              autoTaggedResults: [],
              warnings: [], isSoftTag: false,
              totalComponentsCount: 1,
            },
          };
        assert.equal(input.kind, 'commandTagApply');
        if (failure === 'apply') throw new Error('apply failed');
        return { applied: true };
      });
    } catch (error) {
      if (propagate()) throw error;
      return undefined;
    }
  });
  const driver = load('rust-workspace-tag');
  const run = () => driver.readRustWorkspaceTag('/workspace', '/home', { patterns: [], releaseType: 'patch', incrementBy: 1, unmodified: false, unmerged: false, snapped: false, skipAutoTag: false });
  assert.notEqual(await run(), undefined);
  assert.deepEqual(events, [
    'commandTagPrepare',
    'commandTagPlan',
    'issues',
    'identities',
    'commandTagFinalize',
    'cache',
    'commandTagApply',
  ]);
  failure = 'noop';
  events.length = 0;
  assert.notEqual(await run(), undefined);
  assert.ok(!events.includes('issues'));
  assert.ok(!events.includes('identities'));
  assert.ok(!events.includes('commandTagFinalize'));
  assert.ok(events.includes('commandTagApply'));
  for (failure of ['issues', 'report']) {
    events.length = 0;
    assert.equal(await run(), undefined);
    assert.ok(!events.includes('identities'));
    assert.ok(!events.includes('cache'));
  }
  for (failure of ['cache', 'apply']) await assert.rejects(run(), /failed/);
  events.length = 0;
  forceBuild = true;
  assert.equal(await run(), undefined);
  assert.deepEqual(events, []);
});

test('tag scalar allocation orders each hash before its squash log and validates before IDs', async (t) => {
  const hashes = installed('@teambit/snapping/dist/new-snap-hash.js');
  const logs = installed('@teambit/harmony.modules.get-basic-log/dist/basic-log.js');
  const tagHashes = installed('@teambit/objects/dist/models/new-tag-hash.js');
  const events = [], saved = [];
  const replace = (object, key, value) => { const original = object[key]; saved.push(() => { object[key] = original; }); object[key] = value; };
  t.after(() => saved.reverse().forEach((restore) => restore()));
  replace(hashes, 'newSnapBatchId', () => { events.push('batch'); return 'batch'; });
  replace(tagHashes, 'newTagHash', () => { events.push('hash'); return 'a'.repeat(40); });
  replace(logs, 'getBasicLog', async () => { events.push('log'); return { date: '1' }; });
  replace(logs, 'getLogForSquash', async (lane) => { events.push(`squash:${lane.toString()}`); return { date: '2' }; });
  const { tagSnapshotReceipt } = load('rust-workspace-tag-receipt');
  await tagSnapshotReceipt(['scope/one', 'scope/two'], { laneHistory: false, squash: [] });
  assert.deepEqual(events, ['batch', 'log', 'hash', 'hash']);
  events.length = 0;
  const receipt = await tagSnapshotReceipt(['scope/one', 'scope/two'], { laneHistory: false, squash: [{ identity: 'scope/one', laneId: { scope: 'scope', name: 'incoming' } }] });
  assert.deepEqual(events, ['batch', 'log', 'hash', 'squash:scope/incoming', 'hash']);
  assert.deepEqual(receipt.versions[0].squashLog, { date: '2' });
  assert.equal(receipt.versions[1].squashLog, undefined);
  events.length = 0;
  const row = { identity: 'scope/one', laneId: { scope: 'scope', name: 'incoming' } };
  for (const preparation of [
    { laneHistory: false, squash: [{ identity: 'scope/one' }] },
    { laneHistory: false, squash: [null] },
    { laneHistory: false, squash: [row, row] },
    { laneHistory: false, squash: [{ ...row, identity: 'scope/other' }] },
    { laneHistory: true, squash: [] },
  ]) {
    await assert.rejects(tagSnapshotReceipt(['scope/one'], preparation));
    assert.deepEqual(events, [], 'invalid preparation must not allocate identities or logs');
  }
});
