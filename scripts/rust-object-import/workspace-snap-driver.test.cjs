const { test } = require('node:test');
const assert = require('node:assert/strict');
const { source, installed } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_COMMAND_COMPILED === '1';
const load = (name) => (compiled ? installed(`@teambit/bit/dist/${name}.js`) : source(`scopes/harmony/bit/${name}.ts`));

test('ordinary snap grammar preserves selection flags and declines lifecycle extensions', () => {
  const { parseRustWorkspaceSnap: parse } = load('rust-workspace-snap-options');
  assert.deepEqual(parse(['snap']), {});
  assert.deepEqual(parse(['snap', 'scope/*,!scope/peer', '-m', 'iteration', '-u', '--skip-auto-snap']), {
    pattern: 'scope/*,!scope/peer',
    message: 'iteration',
    unmodified: true,
    skipAutoSnap: true,
  });
  assert.deepEqual(parse(['snap', '--unmerged', '--message', '']), { unmerged: true, message: '' });
  for (const args of [
    ['merge', '--resolve'],
    ['snap', '--build'],
    ['snap', '--editor'],
    ['snap', '--ignore-issues', '*'],
    ['snap', '--no-lock-deps'],
    ['snap', '--rebuild-deps-graph'],
    ['snap', '--detach-head'],
    ['snap', '-m'],
    ['snap', '-m', 'one', '--message', 'two'],
    ['snap', '-u', '--unmodified'],
    ['snap', 'one', 'two'],
    ['snap', '$modified'],
    ['snap', 'scope/* AND $modified'],
  ])
    assert.equal(parse(args), undefined, args.join(' '));
});

test('snap ID-only report equals canonical SnapCmd for new, changed, automatic and empty results', async () => {
  const { formatRustWorkspaceSnap: report } = load('rust-workspace-snap-report');
  const { SnapCmd } = installed('@teambit/snapping/dist/snap-cmd.js');
  const { ComponentID, ComponentIdList } = installed('@teambit/component-id');
  const id = (value) => ComponentID.fromString(value);
  const list = (values) => ComponentIdList.fromArray(values.map(id));
  const cases = [
    null,
    {
      snappedComponents: ['scope/new@' + 'a'.repeat(40), 'scope/changed@' + 'b'.repeat(40)],
      newComponents: ['scope/new@' + 'a'.repeat(40)],
      autoSnappedResults: [],
      laneName: null,
      totalComponentsCount: 2,
    },
    {
      snappedComponents: ['scope/leaf@' + 'c'.repeat(40)],
      newComponents: [],
      autoSnappedResults: [{ id: 'scope/parent@' + 'd'.repeat(40), triggeredBy: ['scope/leaf@1.0.0'] }],
      laneName: 'scope/dev',
      totalComponentsCount: 2,
    },
    {
      snappedComponents: ['scope/new@' + 'a'.repeat(40), 'scope/changed@' + 'b'.repeat(40)],
      newComponents: ['scope/new@' + 'a'.repeat(40)],
      autoSnappedResults: [{ id: 'scope/new@' + 'a'.repeat(40), triggeredBy: ['scope/changed@1.0.0'] }],
      laneName: null,
      totalComponentsCount: 2,
    },
  ];
  for (const value of cases) {
    const canonical = value && {
      ...value,
      snappedComponents: value.snappedComponents.map((text) => ({ id: id(text) })),
      newComponents: list(value.newComponents),
      autoSnappedResults: value.autoSnappedResults.map((row) => ({
        component: { id: id(row.id) },
        triggeredBy: list(row.triggeredBy),
      })),
    };
    const command = new SnapCmd(
      { snap: async () => canonical },
      { consoleWarning() {} },
      { getConfigBoolean: () => false }
    );
    assert.deepEqual(report(value), await command.report([], { message: 'iteration' }));
  }
  const good = cases[1];
  for (const value of [
    {},
    { ...good, totalComponentsCount: 1 },
    { ...good, warnings: ['unowned'] },
    { ...good, snappedComponents: [good.snappedComponents[0], good.snappedComponents[0]] },
    { ...good, newComponents: ['scope/missing@1.0.0'] },
    { ...cases[3], newComponents: [] },
    { ...cases[3], totalComponentsCount: 3 },
  ])
    assert.throws(() => report(value));
});

test('ordinary snap validates complete snapshot eligibility before identities and never replays after cache publication', async (t) => {
  const captureModule = load('rust-client-capture');
  const metadata = load('rust-workspace-resolve-metadata');
  const scalars = load('rust-workspace-resolve-receipt');
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
  replace(scalars, 'resolveSnapshotReceipt', async () => {
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
        if (input.kind === 'commandSnapPrepare')
          return { token: 'token', context: { targets: [target] }, targets: [target], selectedIds: [target.identity] };
        if (input.kind === 'commandSnapPlan' && failure === 'noop')
          return { token: 'token', noop: true, needsSnap: [], result: null };
        if (input.kind === 'commandSnapPlan')
          return {
            token: 'token',
            needsSnap: [target.identity],
            scalarPreparation: {},
            result:
              failure === 'report'
                ? { invalid: true }
                : {
                    snappedComponents: ['scope/one@1.0.0'],
                    newComponents: [],
                    autoSnappedResults: [],
                    laneName: null,
                    totalComponentsCount: 1,
                  },
          };
        if (input.kind === 'commandSnapFinalize')
          return {
            token: 'token',
            result: {
              snappedComponents: ['scope/one@' + 'a'.repeat(40)],
              newComponents: [],
              autoSnappedResults: [],
              laneName: null,
              totalComponentsCount: 1,
            },
          };
        assert.equal(input.kind, 'commandSnapApply');
        if (failure === 'apply') throw new Error('apply failed');
        return { applied: true };
      });
    } catch (error) {
      if (propagate()) throw error;
      return undefined;
    }
  });
  const driver = load('rust-workspace-snap');
  const run = () => driver.readRustWorkspaceSnap('/workspace', '/home', {});
  assert.notEqual(await run(), undefined);
  assert.deepEqual(events, [
    'commandSnapPrepare',
    'commandSnapPlan',
    'issues',
    'identities',
    'commandSnapFinalize',
    'cache',
    'commandSnapApply',
  ]);
  failure = 'noop';
  events.length = 0;
  assert.notEqual(await run(), undefined);
  assert.ok(!events.includes('issues'));
  assert.ok(!events.includes('identities'));
  assert.ok(!events.includes('commandSnapFinalize'));
  assert.ok(events.includes('commandSnapApply'));
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
