const { test } = require('node:test');
const assert = require('node:assert/strict');
const { source, installed } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_COMMAND_COMPILED === '1';
const load = (name) => (compiled ? installed(`@teambit/bit/dist/${name}.js`) : source(`scopes/harmony/bit/${name}.ts`));

test('resolve grammar owns ordinary snapshot selection without requiring an unrelated install flag', () => {
  const { parseRustWorkspaceResolve: parse } = load('rust-workspace-resolve-options');
  assert.deepEqual(parse(['merge', '--resolve']), { pattern: undefined, message: undefined });
  assert.deepEqual(parse(['merge', 'scope/component', '--resolve', '-m', 'resolved by hand']), {
    pattern: 'scope/component',
    message: 'resolved by hand',
  });
  assert.deepEqual(parse(['merge', '**', '--resolve', '-x', '--message', '']), { pattern: '**', message: '' });
  for (const args of [
    ['merge'],
    ['merge', '--abort'],
    ['merge', '--resolve', '--abort'],
    ['merge', '--resolve', '--build'],
    ['merge', '--resolve', '--no-snap'],
    ['merge', '--resolve', '--message'],
    ['merge', '--resolve', '--resolve'],
    ['merge', '--resolve', '-m', 'one', '--message', 'two'],
    ['merge', '--resolve', 'one', 'two'],
    ['merge', '--resolve', '$modified'],
    ['merge', '--resolve', 'scope/* AND $modified'],
    ['lane', 'merge', '--resolve'],
    ['snap', '--unmerged'],
  ])
    assert.equal(parse(args), undefined, args.join(' '));
});

test('resolve report matches the actual public MergeCmd resolved branch and rejects malformed receipts', async () => {
  const { formatRustWorkspaceResolve: report } = load('rust-workspace-resolve-report');
  const { MergeCmd } = installed('@teambit/merging/dist/merge-cmd.js');
  const { ComponentID } = installed('@teambit/component-id');
  const rows = [{ id: 'scope/first@1.0.0' }, { id: 'scope/second@' + 'a'.repeat(40) }];
  const command = new MergeCmd(
    {
      merge: async () => ({
        resolvedComponents: rows.map((row) => ({ id: ComponentID.fromString(row.id) })),
      }),
    },
    { getConfigBoolean: () => false }
  );
  assert.deepEqual(report({ resolvedComponents: rows }), await command.report([undefined], { resolve: true }));
  for (const value of [
    null,
    {},
    { resolvedComponents: 'wrong' },
    { resolvedComponents: rows, extra: true },
    { resolvedComponents: [{ id: 1 }] },
    { resolvedComponents: [rows[0], rows[0]] },
    { resolvedComponents: [{ ...rows[0], source: 'forbidden' }] },
  ])
    assert.throws(() => report(value));
});

test('resolve validates complete snapshot eligibility before identities and never replays after cache publication', async (t) => {
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
      resetDependencyCache: true,
    });
    return {
      captured: [],
      dependencyReadSet: [],
      fresh: () => true,
      commit: async () => {
        events.push('cache');
        if (failure === 'cache') throw new Error('cache failed');
      },
    };
  });
  replace(captureModule, 'withRustClientRequest', async (action, propagate) => {
    try {
      return await action(async (input) => {
        events.push(input.kind);
        if (input.kind === 'commandResolvePrepare')
          return { token: 'token', context: { targets: [target] }, targets: [target], selectedIds: [target.identity] };
        if (input.kind === 'commandResolvePlan')
          return {
            token: 'token',
            needsSnap: [target.identity],
            scalarPreparation: {},
            result: failure === 'report' ? { invalid: true } : { resolvedComponents: [{ id: 'scope/one@1.0.0' }] },
          };
        if (input.kind === 'commandResolveFinalize')
          return { token: 'token', result: { resolvedComponents: [{ id: 'scope/one@' + 'a'.repeat(40) }] } };
        assert.equal(input.kind, 'commandResolveApply');
        if (failure === 'apply') throw new Error('apply failed');
        return { applied: true };
      });
    } catch (error) {
      if (propagate()) throw error;
      return undefined;
    }
  });
  const driver = load('rust-workspace-resolve');
  const run = () => driver.readRustWorkspaceResolve('/workspace', '/home', {});
  assert.notEqual(await run(), undefined);
  assert.deepEqual(events, [
    'commandResolvePrepare',
    'commandResolvePlan',
    'issues',
    'identities',
    'commandResolveFinalize',
    'cache',
    'commandResolveApply',
  ]);
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

test('resolve scalar allocation preserves batch, all hashes, basic log, squash and lane log order', async (t) => {
  const hashes = installed('@teambit/snapping/dist/new-snap-hash.js');
  const logs = installed('@teambit/harmony.modules.get-basic-log/dist/basic-log.js');
  const saved = [];
  const events = [];
  const replace = (object, key, value) => {
    const original = object[key];
    saved.push(() => {
      object[key] = original;
    });
    object[key] = value;
  };
  t.after(() => saved.reverse().forEach((restore) => restore()));
  let count = 0;
  replace(hashes, 'newSnapBatchId', () => {
    events.push('batch');
    return 'batch';
  });
  replace(hashes, 'newSnapHash', () => {
    events.push('hash');
    return String(++count).repeat(40);
  });
  replace(logs, 'getBasicLog', async () => {
    events.push('log');
    return { date: '1' };
  });
  replace(logs, 'getLogForSquash', async (lane) => {
    events.push(`squash:${lane.toString()}`);
    return { date: '2' };
  });
  const { resolveSnapshotReceipt } = load('rust-workspace-resolve-receipt');
  const receipt = await resolveSnapshotReceipt(['scope/one', 'scope/two'], {
    laneHistory: true,
    squash: [{ identity: 'scope/two', laneId: { scope: 'other', name: 'incoming' } }],
  });
  assert.deepEqual(events, ['batch', 'hash', 'hash', 'log', 'squash:other/incoming', 'log']);
  assert.equal(receipt.versions[0].squashLog, undefined);
  assert.deepEqual(receipt.versions[1].squashLog, { date: '2' });
  events.length = 0;
  await assert.rejects(
    resolveSnapshotReceipt(['scope/one'], {
      laneHistory: true,
      squash: [{ identity: 'scope/unknown', laneId: { scope: 'other', name: 'incoming' } }],
    })
  );
  assert.deepEqual(events, [], 'malformed scalar receipts cannot consume durable identities');
});

test('resolve pending policy matches canonical array extraction and respects bitmap precedence', () => {
  const { statusPolicy } = load('rust-status-policy');
  const { resolvePolicyProjection } = load('rust-workspace-resolve-config');
  const resolver = 'teambit.dependencies/dependency-resolver';
  const target = {
    identity: 'scope/component',
    resolveConfig: true,
    config: {
      propagate: false,
      extensions: { 'teambit.pkg/pkg': {}, [resolver]: { policy: { devDependencies: { '@types/node': '^18.0.0' } } } },
    },
    mergedConfig: {
      [resolver]: {
        policy: {
          devDependencies: [
            { name: '@types/node', version: '^22.0.0', force: true },
            { name: 'automatic-package', version: '^2.0.0', force: false },
          ],
        },
      },
    },
  };
  const original = JSON.stringify(target);
  const version = { schema: '2.0.0', extensions: [{ name: resolver, config: {}, data: { preserved: true } }] };
  const projected = resolvePolicyProjection(target, version);
  assert.deepEqual(projected.version.extensions[0].config.policy, { devDependencies: { '@types/node': '^22.0.0' } });
  assert.deepEqual(projected.target.autoDetectMergePolicy, [{}, { 'automatic-package': '^2.0.0' }, {}]);
  assert.deepEqual(projected.version.extensions[0].data, { preserved: true });
  assert.equal(JSON.stringify(target), original, 'retained pending metadata is never mutated');
  const context = { models: [], versions: [], workspace: {}, targets: [target] };
  const policy = statusPolicy(context, target, version);
  assert.equal(policy.extensions[0].name, resolver);
  assert.equal(policy.extensions[0].config.policy.devDependencies['@types/node'], '^22.0.0');
  const bitmap = statusPolicy(
    context,
    { ...target, bitmapConfig: { [resolver]: { policy: { devDependencies: { '@types/node': '^24.0.0' } } } } },
    version
  );
  assert.equal(bitmap.extensions[0].config.policy.devDependencies['@types/node'], '^24.0.0');
  const legacy = installed('@teambit/legacy.extension-data');
  const entry = new legacy.ExtensionDataEntry(
    undefined,
    undefined,
    resolver,
    structuredClone(target.mergedConfig[resolver])
  );
  const canonical = legacy.ExtensionDataList.fromArray([entry]);
  const automatic = canonical.extractAutoDepsFromConfig();
  assert.deepEqual(entry.config, projected.version.extensions[0].config);
  assert.deepEqual(automatic.devDependencies, [{ name: 'automatic-package', version: '^2.0.0', force: false }]);
  assert.throws(() => resolvePolicyProjection({ ...target, mergedConfig: { custom: {} } }, version));
});

test('resolve ordinary patterns match the canonical workspace identity matcher in order', async () => {
  const { parseRustWorkspaceResolve } = load('rust-workspace-resolve-options');
  const { resolvePatternIds } = load('rust-workspace-resolve-metadata');
  const { ScopeMain } = installed('@teambit/scope/dist/scope.main.runtime.js');
  const { ComponentID } = installed('@teambit/component-id');
  const identities = ['scope/first', 'scope/nested/second', 'other/third'];
  const context = { targets: identities.map((identity) => ({ identity })) };
  const ids = identities.map((identity) => ComponentID.fromString(identity + '@1.0.0'));
  for (const pattern of ['scope/**', 'other/*,scope/first', '!scope/first', '**,!other/*', 'scope/first@1.0.0']) {
    assert.equal(parseRustWorkspaceResolve(['merge', '--resolve', pattern]).pattern, pattern);
    const expected = await ScopeMain.prototype.filterIdsFromPoolIdsByPattern.call({}, pattern, ids);
    assert.deepEqual(
      resolvePatternIds(context, pattern),
      Array.from(expected, (id) => id.toStringWithoutVersion())
    );
  }
  assert.throws(() => resolvePatternIds(context, '$modified'), /state selector/);
  assert.throws(() => resolvePatternIds(context, 'absent/**'), /no matches/);
});

test('resolve issue eligibility distinguishes proven missing heads from omitted or unsupported heads', () => {
  const { ordinaryResolveIssueHeads: eligible } = load('rust-workspace-resolve-heads');
  const main = 'a'.repeat(40),
    lane = 'b'.repeat(40);
  const context = {
    models: [{ scope: 'scope', name: 'one', head: main }],
    lane: { targets: [{ identity: 'scope/one', currentHead: lane }] },
  };
  const heads = [
    {
      identity: 'scope/one',
      heads: [
        { hash: main, version: null },
        { hash: lane, version: { extensions: [] } },
      ],
    },
  ];
  assert.equal(eligible(context, heads), true);
  for (const changed of [
    [],
    [{ ...heads[0], heads: heads[0].heads.slice(1) }],
    [{ ...heads[0], heads: [...heads[0].heads].reverse() }],
    [{ ...heads[0], heads: [{ hash: main }, heads[0].heads[1]] }],
    [
      {
        ...heads[0],
        heads: [{ hash: main, version: { extensions: [{ name: 'teambit.component/remove' }] } }, heads[0].heads[1]],
      },
    ],
    [
      {
        ...heads[0],
        heads: [
          heads[0].heads[0],
          { hash: lane, version: { extensions: [{ name: 'teambit.component/deprecation' }] } },
        ],
      },
    ],
  ])
    assert.equal(Boolean(eligible(context, changed)), false);
  assert.equal(eligible({ ...context, models: [{ ...context.models[0], deprecated: true }] }, heads), false);
});

test('proven missing resolve heads preserve ordinary status fallback and all snapshot issue blockers', async () => {
  const { collectRustStatusIssues } = load('rust-status-issues');
  const { validateResolveIssues } = load('rust-workspace-resolve-metadata');
  const main = 'a'.repeat(40);
  const component = { identity: 'scope/one@1.0.0', packageName: '@scope/one', dependencies: [], issues: [] };
  const context = {
    models: [{ scope: 'scope', name: 'one', head: main }],
    versions: [],
    workspace: {},
    targets: [{ identity: 'scope/one', directory: 'one' }],
    resolveIssueHeads: [{ identity: 'scope/one', heads: [{ hash: main, version: null }] }],
  };
  assert.equal(await collectRustStatusIssues(process.cwd(), context, [component]), undefined);
  await validateResolveIssues(process.cwd(), context, { components: [component] }, ['scope/one']);
  await assert.rejects(
    validateResolveIssues(
      process.cwd(),
      { ...context, packageJson: { dependencies: { '@scope/one': '1.0.0' } } },
      { components: [component] },
      ['scope/one']
    ),
    /snapshot issues/
  );
});

test('snapshot external issue graph retains cycles and requires every absent-model proof', async () => {
  const { collectRustStatusIssues } = load('rust-status-issues');
  const { validateResolveIssues } = load('rust-workspace-resolve-metadata');
  const { resolveExternalIssueVertices: vertices } = load('rust-workspace-resolve-heads');
  const component = {
    identity: 'scope/one@1.0.0',
    packageName: '@scope/one',
    dependencies: ['external/aspect@2.0.0'],
    issues: [],
  };
  const context = {
    models: [],
    versions: [],
    workspace: {},
    targets: [{ identity: 'scope/one', directory: 'one' }],
    resolveIssueHeads: [],
  };
  const receipt = { external: [{ identity: 'external/aspect@2.0.0', dependencies: [], model: null }] };
  assert.equal(await collectRustStatusIssues(process.cwd(), context, [component]), undefined);
  await validateResolveIssues(process.cwd(), context, { components: [component] }, ['scope/one'], receipt);
  const cycle = structuredClone(receipt);
  cycle.external[0].dependencies.push(component.identity);
  await assert.rejects(
    validateResolveIssues(process.cwd(), context, { components: [component] }, ['scope/one'], cycle),
    /snapshot issues/
  );
  for (const bad of [
    undefined,
    { external: [] },
    { external: [{ ...receipt.external[0], model: {} }] },
    { external: [{ ...receipt.external[0], dependencies: ['external/missing@1.0.0'] }] },
    { external: [...receipt.external, receipt.external[0]] },
    { external: [...receipt.external, { identity: 'external/unreachable@1.0.0', dependencies: [], model: null }] },
  ])
    assert.equal(vertices([component], bad), undefined);
  const transit = structuredClone(receipt);
  transit.external[0].dependencies.push('external/leaf@3.0.0');
  transit.external.push({ identity: 'external/leaf@3.0.0', dependencies: [], model: null });
  assert.equal(vertices([component], transit).length, 2);
});
