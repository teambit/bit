const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { source, installed } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_COMMAND_COMPILED === '1';
const load = (name) => (compiled ? installed(`@teambit/bit/dist/${name}.js`) : source(`scopes/harmony/bit/${name}.ts`));
const { parseRustWorkspaceCommand } = load('rust-workspace-command-options');

test('download progress preserves hundred-object boundaries and canonical CI suppression', async (t) => {
  const { loader } = installed('@teambit/legacy.loader');
  const { commandProgress } = load('rust-workspace-command-progress');
  const originalStart = loader.start;
  const originalCI = process.env.CI;
  const messages = [];
  loader.start = (message) => messages.push(message);
  t.after(() => {
    loader.start = originalStart;
    if (originalCI === undefined) delete process.env.CI;
    else process.env.CI = originalCI;
  });
  for (const ci of ['', 'true']) {
    process.env.CI = ci;
    for (const objects of [99, 100, 200, 201]) {
      messages.length = 0;
      const receipt = {
        bitmapCount: 1,
        imports: [{ reason: null, ids: ['scope/component@1.0.0'], components: 1, objects }],
      };
      const render = commandProgress(receipt, 'merge');
      assert.deepEqual(messages, [], 'receipt validation must not start visible progress');
      await render();
      const downloads = ci
        ? []
        : Array.from(
            { length: Math.floor(objects / 100) },
            (_, index) => `importing 1 components. downloaded ${(index + 1) * 100} objects.`
          );
      assert.deepEqual(messages, ['importing 1 components', ...downloads, 'successfully imported 1 components']);
    }
  }
});

test('lane import progress preserves raw-object requests and validates reasons before output', async (t) => {
  const { loader } = installed('@teambit/legacy.loader');
  const { commandProgress } = load('rust-workspace-command-progress');
  const originalStart = loader.start;
  const originalCI = process.env.CI;
  const messages = [];
  loader.start = (message) => messages.push(message);
  process.env.CI = 'true';
  t.after(() => {
    loader.start = originalStart;
    if (originalCI === undefined) delete process.env.CI;
    else process.env.CI = originalCI;
  });
  const row = { reason: null, ids: ['a'.repeat(40), 'b'.repeat(40)], components: 0, objects: 2, objectRequest: true };
  const render = commandProgress({ bitmapCount: 1, imports: [row] }, 'merge');
  assert.deepEqual(messages, []);
  await render();
  assert.deepEqual(messages, ['importing 2 objects', 'successfully imported 2 objects']);
  for (const reason of [
    'for fetching lane scope/feature',
    'for getting the common-snap between main and feature',
    'for filling the gap between the common-snap and the head of scope/feature',
    'to get all artifacts for 2 components from lane scope/feature',
    'import all history of given patterns components to check whether they have dependencies on the lane',
  ])
    assert.equal(typeof commandProgress({ bitmapCount: 1, imports: [{ ...row, reason }] }, 'merge'), 'function');
  messages.length = 0;
  for (const invalid of [
    { ...row, objectRequest: 'true' },
    { ...row, reason: 'for fetching lane invalid' },
  ])
    assert.throws(() => commandProgress({ bitmapCount: 1, imports: [row, invalid] }, 'merge'), /progress receipt/);
  assert.deepEqual(messages, []);
});

test('CLI binding verifies unchanged bootstrap modules and replacement overlay bytes', async (t) => {
  const { verifyCli } = require('./cold-command-binding.cjs');
  const { createHash } = require('node:crypto');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-cold-binding-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const modules = path.join(directory, 'node_modules/@teambit');
  await fs.mkdir(modules, { recursive: true });
  const entry = (name, bytes) => ({ path: name, sha256: createHash('sha256').update(bytes).digest('hex') });
  await fs.writeFile(
    path.join(directory, '.bit-rust-private-build.json'),
    JSON.stringify({ revision: 'base', compiledModules: [entry('bootstrap.js', 'base'), entry('overlay.js', 'old')] })
  );
  await fs.writeFile(
    path.join(directory, '.bit-object-import-build.json'),
    JSON.stringify({ installedRevision: 'base', compiledModules: [entry('overlay.js', 'new')] })
  );
  await fs.writeFile(path.join(modules, 'bootstrap.js'), 'base');
  await fs.writeFile(path.join(modules, 'overlay.js'), 'new');
  assert.equal((await verifyCli(directory)).modules.length, 2);
  await fs.writeFile(path.join(modules, 'bootstrap.js'), 'tampered');
  await assert.rejects(verifyCli(directory), /bootstrap.js/);
  await fs.writeFile(path.join(modules, 'bootstrap.js'), 'base');
  await fs.writeFile(path.join(modules, 'overlay.js'), 'tampered');
  await assert.rejects(verifyCli(directory), /overlay.js/);
});

test('qualification snap and lane history identities are independent of discarded comparison Version UUIDs', async () => {
  const preload = await fs.readFile(path.join(__dirname, 'checkout-transition-determinism.cjs'), 'utf8');
  function identities(discardedVersions) {
    const module = { _load: () => ({ v4: () => assert.fail('uncontrolled UUID') }) };
    require('node:vm').runInNewContext(preload, {
      require: (name) => (name === 'node:module' ? module : require(name)),
      process: {
        env: {
          BIT_CHECKOUT_TRANSITION_QUALIFICATION_SEED: 'same-command',
          BIT_CHECKOUT_TRANSITION_QUALIFICATION_CLOCK: '1800000000000',
        },
      },
    });
    const incidental = module._load('uuid', { filename: '/models/version.js' });
    const durable = module._load('uuid', { filename: '/snapping/new-snap-hash.js' });
    const history = module._load('uuid', { filename: '/objects/models/new-lane-history-key.js' });
    for (let index = 0; index < discardedVersions; index++) incidental.v4();
    return [durable.v4(), durable.v4(), history.v4(), history.v4()];
  }
  assert.deepEqual(identities(0), identities(3));
  assert.equal(new Set(identities(0)).size, 4);
});

test('bitmap backup identities are deterministic per command for canonical and cold helper imports', async () => {
  const preload = await fs.readFile(path.join(__dirname, 'checkout-transition-determinism.cjs'), 'utf8');
  function identity(seed, request) {
    const module = { _load: () => ({ currentDateAndTimeToFileName: () => 'real-clock' }) };
    const context = require('node:vm').createContext({
      require: (name) => (name === 'node:module' ? module : require(name)),
      process: {
        env: {
          BIT_CHECKOUT_TRANSITION_QUALIFICATION_SEED: seed,
          BIT_CHECKOUT_TRANSITION_QUALIFICATION_CLOCK: '1800000000000',
        },
      },
    });
    require('node:vm').runInContext(preload, context);
    assert.notEqual(
      require('node:vm').runInContext('new Date().getTime()', context),
      1800000000000,
      'Date.now override does not control new Date'
    );
    const helper = module._load(request);
    assert.equal(helper.currentDateAndTimeToFileName(), helper.currentDateAndTimeToFileName());
    return helper.currentDateAndTimeToFileName();
  }
  const canonical = identity('merge-command', './bitmap-history-file-id');
  assert.match(canonical, /^\d{4}-\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}-\d{1,2}$/);
  assert.equal(canonical, identity('merge-command', '/legacy/dist/bitmap-history-file-id.js'));
  assert.notEqual(canonical, identity('setup-command', './bitmap-history-file-id'));
});

test('wrapper benchmark bypasses only the cold entry and retains native kernel modules', async () => {
  const preload = await fs.readFile(path.join(__dirname, 'cold-command-wrapper-baseline.cjs'), 'utf8');
  const kernel = { request: () => 'native kernel' };
  const cold = { runRustWorkspaceCommand: () => assert.fail('cold entry must not run'), otherExport: true };
  const module = { _load: (name) => (name.endsWith('rust-workspace-command.js') ? cold : kernel) };
  require('node:vm').runInNewContext(preload, {
    require: (name) => (name === 'node:module' ? module : require(name)),
    process: { env: { BIT_COLD_COMMAND_WRAPPER_BASELINE: '1' } },
  });
  assert.equal(await module._load('./rust-workspace-command.js').runRustWorkspaceCommand(), false);
  assert.equal(module._load('./rust-workspace-command.js').otherExport, true);
  assert.equal(module._load('./rust-object-import.js'), kernel);
});

test('cold workspace command grammar rejects unsupported or ambiguous options before native dispatch', () => {
  for (const args of [
    ['checkout', 'head'],
    ['checkout', 'head', '-x', '--skip-dependency-installation'],
    ['checkout', 'head', '-x', '--force-ours', '--force-theirs'],
    ['checkout', 'head', '-x', '--manual', '-r', 'manual'],
    ['checkout', 'head', '-x', '--unknown'],
    ['checkout', 'head', '-x', 'component', 'extra'],
    ['checkout', 'head', '-x', '*'],
    ['checkout', 'head', '--all', '-x'],
    ['merge', '-x', '--build'],
    ['merge', '-x', '--no-snap', '-m', 'message'],
    ['merge', '-x', '-r', 'invalid'],
    ['merge', '-x', '--abort'],
    ['merge', '-x', '--resolve'],
    ['merge', '*', '-x'],
    ['merge', 'scope/*', '-x'],
    ['merge', 'scope/**', '-x'],
    ['checkout', 'head', '**', '-x'],
  ])
    assert.equal(parseRustWorkspaceCommand(args), undefined, args.join(' '));
  assert.equal(parseRustWorkspaceCommand(['checkout', 'head', 'scope/component', '-x']).operation, 'checkout');
  assert.equal(parseRustWorkspaceCommand(['merge', 'scope/component', '-x', '--no-snap']).noSnap, true);
  assert.equal(parseRustWorkspaceCommand(['merge', '**', '-x']).pattern, '**');
});

test('lane grammar keeps no-snap and no-auto-snap distinct and rejects unsupported effects before dispatch', () => {
  const parsed = parseRustWorkspaceCommand([
    'lane',
    'merge',
    'scope/incoming',
    'scope/component',
    '-x',
    '--skip-fetch',
    '--include-deps',
    '--no-snap',
    '-m',
    'merged files',
    '-r',
    'theirs',
  ]);
  assert.equal(parsed.operation, 'merge');
  assert.equal(parsed.lane.name, 'scope/incoming');
  assert.equal(parsed.lane.skipFetch, true);
  assert.equal(parsed.lane.includeDeps, true);
  assert.equal(parsed.lane.noAutoSnap, false);
  assert.equal(parsed.noSnap, true);
  assert.equal(parsed.message, 'merged files');
  assert.equal(parsed.strategy, 'theirs');
  assert.equal(parseRustWorkspaceCommand(['lane', 'merge', 'main', '-x', '--no-auto-snap']).lane.noAutoSnap, true);
  assert.equal(
    parseRustWorkspaceCommand(['lane', 'merge', 'incoming', '-x', '--pattern', 'scope/component', '--include-deps'])
      .pattern,
    'scope/component'
  );
  for (const suffix of [
    ['--no-auto-snap', '-m', 'message'],
    ['--include-deps'],
    ['--squash', '--no-squash'],
    ['--build'],
    ['--tag'],
    ['--resolve-unrelated', 'ours'],
    ['--skip-fetch', '--skip-fetch'],
    ['-r', 'invalid'],
    ['--manual', '-r', 'theirs'],
    ['--ours'],
    ['--pattern'],
    ['--pattern', 'scope/a', '--pattern', 'scope/b'],
    ['scope/a', '--pattern', 'scope/b'],
  ])
    assert.equal(parseRustWorkspaceCommand(['lane', 'merge', 'incoming', '-x', ...suffix]), undefined);
  assert.equal(parseRustWorkspaceCommand(['lane', 'merge', 'incoming']), undefined);
  assert.equal(parseRustWorkspaceCommand(['lane', 'merge', '-x']), undefined);
  assert.equal(parseRustWorkspaceCommand(['lane', 'merge-abort', 'incoming', '-x']), undefined);
  for (const pattern of ['scope/*,!scope/first', '!scope/first', 'scope/first@1.0.0', 'scope/?irst'])
    assert.equal(parseRustWorkspaceCommand(['lane', 'merge', 'incoming', pattern, '-x']).pattern, pattern);
  for (const pattern of ['$modified', 'scope/* AND $modified', 'scope/*,$new'])
    assert.equal(parseRustWorkspaceCommand(['lane', 'merge', 'incoming', pattern, '-x']), undefined);
});

test('lane pattern metadata uses canonical glob order, negation and version stripping', async () => {
  const { commandLanePatternIds, commandOtherLane } = load('rust-workspace-command-lane');
  const { ScopeMain } = installed('@teambit/scope/dist/scope.main.runtime.js');
  const { ComponentID } = installed('@teambit/component-id');
  const identities = ['scope/third', 'scope/first', 'other/second'];
  const ids = identities.map((identity) => ComponentID.fromString(`${identity}@1.0.0`));
  const context = { lane: { targets: identities.map((identity) => ({ identity })) } };
  const main = { lane: { otherId: { scope: 'workspace.scope', name: 'main' } } };
  assert.equal(commandOtherLane(main, 'component.scope/namespace/component').toString(), 'component.scope/main');
  assert.equal(
    commandOtherLane(main).toString(),
    'workspace.scope/main',
    'shared fast-forward squash retains incoming lane identity'
  );
  assert.equal(
    commandOtherLane(
      { lane: { otherId: { scope: 'workspace.scope', name: 'incoming' } } },
      'component.scope/name'
    ).toString(),
    'workspace.scope/incoming'
  );
  assert.throws(() => commandOtherLane(main, 'unscoped'), /component identity/);
  for (const pattern of [
    '**',
    '!scope/first',
    'other/*, scope/*',
    'scope/first@2.0.0',
    'scope/*,!scope/first',
    'scope/?irst',
  ]) {
    const canonical = await ScopeMain.prototype.filterIdsFromPoolIdsByPattern.call({}, pattern, ids);
    assert.deepEqual(
      commandLanePatternIds(context, pattern),
      Array.from(canonical, (id) => id.toStringWithoutVersion()),
      pattern
    );
  }
  assert.deepEqual(commandLanePatternIds(context, 'other/*,scope/*'), identities);
  assert.throws(() => commandLanePatternIds(context, 'absent/*'), /no matches/);
  assert.throws(() => commandLanePatternIds(context, '$modified'), /workspace callbacks/);
  assert.throws(
    () =>
      commandLanePatternIds({ lane: { targets: [{ identity: 'scope/first' }, { identity: 'scope/first' }] } }, '**'),
    /identities/
  );
});

test('cold driver validates the complete plan before writes and propagates failures once commit starts', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-cold-driver-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const addon = path.join(directory, 'test-addon.cjs');
  await fs.writeFile(addon, 'module.exports = {};');
  const discovery = installed('@teambit/objects/dist/objects/rust-object-discovery.js');
  const originalExecutable = discovery.resolveRustObjectImportExecutable;
  const originalAddon = discovery.resolveRustWorkspaceAddon;
  discovery.resolveRustObjectImportExecutable = () => path.join(directory, 'unused-helper');
  discovery.resolveRustWorkspaceAddon = () => addon;
  const capture = load('rust-client-capture');
  const originalCapture = capture.captureRustClientCurrent;
  const { readRustWorkspaceCommand } = load('rust-workspace-command');
  const events = [];
  let failure;
  let failedReceipt;
  let wrongToken;
  let missingApplyReceipt = false;
  let invalidReport = false;
  let needsSnap = false;
  let invalidProgress = false;
  let captures = 0;
  let failedSnap = false;
  let issueFailure = false;
  let lanePreparation = false;
  let hiddenOnly = false;
  let dependencyTarget;
  const progressModule = load('rust-workspace-command-progress');
  const originalProgress = progressModule.commandProgress;
  const progressReceipts = [];
  progressModule.commandProgress = (receipt, operation) => {
    progressReceipts.push(receipt);
    return originalProgress(receipt, operation);
  };
  const laneModule = load('rust-workspace-command-lane');
  const originalLaneReceipt = laneModule.commandLaneReceipt;
  laneModule.commandLaneReceipt = async () => {
    events.push('allocate lane history receipt');
    return { importHistories: [] };
  };
  const issuesModule = load('rust-workspace-command-issues');
  const originalIssueCheck = issuesModule.validateRustCommandIssues;
  issuesModule.validateRustCommandIssues = async () => {
    if (issueFailure) throw new Error('command unsupported snapshot issue: CircularDependencies');
  };
  const captureInputs = [];
  const dependencyReadSet = [{ path: '/retained-dependency', sha256: 'a'.repeat(64) }];
  const failedTarget = { identity: 'qualification.policy/component', version: '1.0.0' };
  const unrelatedTarget = { identity: 'qualification.policy/unrelated', version: '1.0.0' };
  const cacheRows = [{ identity: 'qualification.policy/component@1.0.0', rawData: '{}', cacheable: true, readSet: [] }];
  const policyModule = load('rust-workspace-command-policy');
  const originalPolicy = policyModule.prepareRustCommandPolicy;
  policyModule.prepareRustCommandPolicy = async (_prepared, plan) => ({
    plan: {
      ...plan,
      snapFailed: true,
      progress: { bitmapCount: 2, imports: [], loads: [2, 1], snapFailed: true },
      result: {
        components: [],
        failedComponents: [],
        mergeSnapError: {
          kind: 'componentsHaveIssues',
          components: [
            {
              id: 'qualification.policy/component@1.0.0',
              issues: [{ type: 'MissingManuallyConfiguredPackages', data: JSON.stringify(['missing-package']) }],
            },
          ],
        },
      },
    },
    dependencyCaches: cacheRows,
  });
  const snap = installed('@teambit/snapping/dist/new-snap-hash.js');
  const originalHash = snap.newSnapHash;
  const originalBatch = snap.newSnapBatchId;
  snap.newSnapHash = () => {
    events.push('allocate snap hash');
    return 'a'.repeat(40);
  };
  snap.newSnapBatchId = () => {
    events.push('allocate snap batch');
    return 'batch';
  };
  require(addon).WorkspaceEngine = class {
    async request(frame) {
      const input = JSON.parse(frame.subarray(12));
      events.push(input.kind);
      if (input.kind === 'commandApply') assert.deepEqual(input.dependencyReadSet, dependencyReadSet);
      if (failure === input.kind) throw new Error(`failure at ${failure}`);
      const data =
        input.kind === 'commandPrepare'
          ? {
              token: 'retained',
              context: {
                models: [],
                targets: [failedTarget, unrelatedTarget],
                ...(hiddenOnly
                  ? { lane: { targets: [{ identity: 'scope/component', hidden: true, bitmapPresent: false }] } }
                  : {}),
              },
              targets: [],
            }
          : input.kind === 'commandPlan'
            ? {
                token: 'retained',
                ...(needsSnap ? { needsSnap: ['scope/component'] } : {}),
                ...(dependencyTarget ? { dependencyCacheVersions: [{ identity: 'scope/ff', version: '2.0.0' }] } : {}),
                ...(failedSnap ? { policyPreparation: { targets: [] } } : {}),
                ...(lanePreparation ? { lanePreparation: { history: false, importHistoryCount: 0 } } : {}),
                ...(invalidProgress ? { progress: { unsupported: true } } : {}),
                result: invalidReport ? { invalid: true } : { components: [], failedComponents: [] },
              }
            : ['commandLaneFinalize', 'commandFinalize'].includes(input.kind)
              ? {
                  token: 'retained',
                  result: { components: [], failedComponents: [] },
                  ...(failedSnap
                    ? {
                        progress: {
                          bitmapCount: 2,
                          imports: [{ reason: null, ids: ['scope/new@1.0.0'], components: 1, objects: 2 }],
                        },
                      }
                    : {}),
                }
              : { applied: true };
      if (wrongToken === input.kind) data.token = 'different-retained-plan';
      if (missingApplyReceipt && input.kind === 'commandApply') data.applied = false;
      return Buffer.from(
        JSON.stringify({
          version: 1,
          id: frame.readUInt32BE(4),
          failed: failedReceipt === input.kind,
          skipped: [],
          data,
        })
      );
    }
    close() {
      events.push('close');
    }
  };
  capture.captureRustClientCurrent = async (...args) => {
    captureInputs.push(args);
    captures++;
    return {
      captured: dependencyTarget
        ? [
            {
              files: [],
              current: {
                dependencies: [{ id: { scope: 'scope', name: dependencyTarget, version: '2.0.0' } }],
                devDependencies: [],
              },
            },
          ]
        : [],
      components: [],
      dependencyReadSet,
      fresh: () => true,
      commit: async (rows, replacementsOnly) => {
        if (failedSnap) {
          assert.deepEqual(rows, cacheRows);
          assert.equal(replacementsOnly, true);
        }
        events.push('cache/history commit');
        if (failure === 'commit') throw new Error('cache commit failure');
      },
    };
  };
  t.after(() => {
    progressModule.commandProgress = originalProgress;
    laneModule.commandLaneReceipt = originalLaneReceipt;
    issuesModule.validateRustCommandIssues = originalIssueCheck;
    policyModule.prepareRustCommandPolicy = originalPolicy;
    snap.newSnapHash = originalHash;
    snap.newSnapBatchId = originalBatch;
    discovery.resolveRustObjectImportExecutable = originalExecutable;
    discovery.resolveRustWorkspaceAddon = originalAddon;
    capture.captureRustClientCurrent = originalCapture;
    delete require.cache[addon];
  });
  let options = parseRustWorkspaceCommand(['merge', '-x']);
  const run = () =>
    readRustWorkspaceCommand(directory, directory, options, async () => {
      events.push('beforeCommit');
      if (failure === 'beforeCommit') throw new Error('presentation setup failure');
    });
  for (const phase of ['commandPrepare', 'commandPlan']) {
    failure = phase;
    events.length = 0;
    assert.equal(await run(), undefined, `${phase}: read-only failure can fall back`);
    assert.equal(events.includes('beforeCommit'), false);
    assert.equal(events.includes('cache/history commit'), false);
    assert.equal(events.includes('commandApply'), false);
    assert.equal(events.at(-1), 'close');
  }
  failure = undefined;
  invalidReport = true;
  events.length = 0;
  assert.equal(await run(), undefined, 'unknown report data must decline before any writes');
  assert.deepEqual(events, ['commandPrepare', 'commandPlan', 'close']);
  needsSnap = true;
  for (const receipt of ['report', 'progress']) {
    invalidReport = receipt === 'report';
    invalidProgress = receipt === 'progress';
    events.length = 0;
    captures = 0;
    assert.equal(await run(), undefined, `invalid ${receipt} declines before snapshot identity allocation`);
    assert.equal(captures, 2, 'complete workspace capture was validated before rejecting presentation');
    assert.deepEqual(
      events,
      ['commandPrepare', 'commandPlan', 'close'],
      'no UUID, finalize, cache/history or apply effects'
    );
  }
  needsSnap = false;
  invalidProgress = false;
  invalidReport = false;
  needsSnap = true;
  dependencyTarget = 'ff';
  events.length = 0;
  assert.ok(await run(), 'fixed incoming fast-forward dependency does not require a snapshot cascade');
  assert.ok(events.includes('commandApply'));
  dependencyTarget = 'component';
  events.length = 0;
  assert.equal(await run(), undefined, 'dependency on an actual pending snapshot still declines');
  assert.equal(events.includes('allocate snap hash'), false);
  assert.equal(events.includes('commandApply'), false);
  dependencyTarget = undefined;
  needsSnap = false;
  for (const phase of ['beforeCommit', 'commit', 'commandApply']) {
    failure = phase;
    events.length = 0;
    await assert.rejects(run(), /failure/, `${phase}: must not return fallback after durable boundary`);
    assert.equal(events.at(-1), 'close');
    assert.equal(events.filter((event) => event === 'commandApply').length, phase === 'commandApply' ? 1 : 0);
  }
  failure = undefined;
  events.length = 0;
  assert.ok(await run());
  assert.deepEqual(events, [
    'commandPrepare',
    'commandPlan',
    'beforeCommit',
    'cache/history commit',
    'commandApply',
    'close',
  ]);
  failedSnap = true;
  events.length = 0;
  captureInputs.length = 0;
  assert.ok(await run(), 'a failed snap still applies the retained merge result');
  assert.equal(captureInputs[1][3], undefined, 'all workspace targets are checked before a failed snap commits');
  assert.equal(captureInputs[1][4].resetDependencyCache, true);
  assert.deepEqual(
    events,
    ['commandPrepare', 'commandPlan', 'beforeCommit', 'cache/history commit', 'commandApply', 'close'],
    'failed snap publishes merge and caches without allocating IDs or finalizing'
  );
  issueFailure = true;
  events.length = 0;
  assert.equal(await run(), undefined, 'an extra projected cycle declines the failed-snap path');
  assert.deepEqual(
    events,
    ['commandPrepare', 'commandPlan', 'close'],
    'issue rejection precedes UUIDs and every publication boundary'
  );
  issueFailure = false;
  failedSnap = false;
  lanePreparation = true;
  options = parseRustWorkspaceCommand(['lane', 'merge', 'incoming', '-x', '--no-snap']);
  invalidReport = true;
  events.length = 0;
  assert.equal(await run(), undefined, 'lane report is validated before history key allocation');
  assert.deepEqual(events, ['commandPrepare', 'commandPlan', 'close']);
  invalidReport = false;
  failure = 'commandLaneFinalize';
  events.length = 0;
  assert.equal(await run(), undefined, 'lane staging failure declines before any publication');
  assert.deepEqual(events, [
    'commandPrepare',
    'commandPlan',
    'allocate lane history receipt',
    'commandLaneFinalize',
    'close',
  ]);
  failure = undefined;
  events.length = 0;
  assert.ok(await run(), 'no-snap lane merge still finalizes history once before apply');
  assert.deepEqual(events, [
    'commandPrepare',
    'commandPlan',
    'allocate lane history receipt',
    'commandLaneFinalize',
    'beforeCommit',
    'cache/history commit',
    'commandApply',
    'close',
  ]);
  failedSnap = true;
  options = parseRustWorkspaceCommand(['lane', 'merge', 'incoming', '-x']);
  progressReceipts.length = 0;
  assert.ok(await run(), 'lane finalization preserves failed-snap load progress');
  assert.deepEqual(progressReceipts.at(-1), {
    bitmapCount: 2,
    imports: [{ reason: null, ids: ['scope/new@1.0.0'], components: 1, objects: 2 }],
    loads: [2, 1],
    snapFailed: true,
  });
  failedSnap = false;
  hiddenOnly = true;
  needsSnap = true;
  options = parseRustWorkspaceCommand(['lane', 'merge', 'incoming', '-x']);
  captureInputs.length = 0;
  events.length = 0;
  assert.ok(await run(), 'hidden-only snapshots retain scope state without a workspace reload');
  assert.equal(captureInputs.length, 1, 'no workspace cache reset or callback capture');
  assert.equal(captureInputs[0][4].resetDependencyCache, undefined);
  assert.ok(events.includes('commandFinalize'));
  assert.ok(events.indexOf('allocate lane history receipt') < events.indexOf('allocate snap hash'));
  assert.ok(events.indexOf('commandFinalize') < events.indexOf('commandApply'));
  for (const phase of ['commandPlan', 'commandLaneFinalize', 'commandFinalize']) {
    failedReceipt = phase;
    events.length = 0;
    assert.equal(await run(), undefined, `${phase}: rejected native receipt can decline before publication`);
    assert.equal(events.includes('beforeCommit'), false);
    assert.equal(events.includes('cache/history commit'), false);
    assert.equal(events.includes('commandApply'), false);
    if (phase !== 'commandFinalize') {
      assert.equal(events.includes('allocate snap batch'), false);
      assert.equal(events.includes('allocate snap hash'), false);
    }
    assert.equal(events.at(-1), 'close');
  }
  failedReceipt = undefined;
  for (const phase of ['commandLaneFinalize', 'commandFinalize']) {
    wrongToken = phase;
    events.length = 0;
    assert.equal(await run(), undefined, `${phase}: receipt for another retained plan must not publish`);
    assert.equal(events.includes('beforeCommit'), false);
    assert.equal(events.includes('cache/history commit'), false);
    assert.equal(events.includes('commandApply'), false);
  }
  wrongToken = undefined;
  failedReceipt = 'commandApply';
  events.length = 0;
  await assert.rejects(run(), /native request declined/, 'failed Apply receipt must never return canonical fallback');
  assert.equal(events.filter((event) => event === 'beforeCommit').length, 1);
  assert.equal(events.filter((event) => event === 'cache/history commit').length, 1);
  assert.equal(events.filter((event) => event === 'commandApply').length, 1);
  assert.equal(events.at(-1), 'close');
  failedReceipt = undefined;
  missingApplyReceipt = true;
  events.length = 0;
  await assert.rejects(
    run(),
    /native command apply receipt/,
    'an ACK without publication cannot trigger canonical replay'
  );
  assert.equal(events.filter((event) => event === 'commandApply').length, 1);
});

test('manual native merge reports match actual main and lane commands including enum hydration', async () => {
  const { formatRustWorkspaceCommand } = load('rust-workspace-command-report');
  const { MergeCmd, mergeReport } = installed('@teambit/merging/dist/merge-cmd.js');
  const { MergeLaneCmd } = installed('@teambit/merge-lanes/dist/merge-lane.cmd.js');
  const { ComponentID } = installed('@teambit/component-id');
  const { FileStatus } = installed('@teambit/component.modules.merge-helper/dist/merge-version.js');
  const wire = {
    components: [{ id: 'qualification.policy/component@1.0.0', filesStatus: { 'index.js': 'manual' } }],
    failedComponents: [],
    leftUnresolvedConflicts: true,
    removedComponents: ['qualification.policy/removed@1.0.0'],
  };
  const canonical = {
    ...wire,
    components: [{ id: ComponentID.fromString(wire.components[0].id), filesStatus: { 'index.js': FileStatus.manual } }],
    removedComponents: wire.removedComponents.map((id) => ComponentID.fromString(id)),
  };
  for (const verbose of [false, true]) {
    const command = new MergeCmd({ merge: async () => canonical }, { getConfigBoolean: () => false });
    const expected = await command.report(['qualification.policy/component'], {
      manual: true,
      skipDependencyInstallation: true,
      verbose,
    });
    const options = {
      ...parseRustWorkspaceCommand(['merge', 'qualification.policy/component', '-x', '--manual']),
      verbose,
    };
    assert.deepEqual(formatRustWorkspaceCommand(wire, options), expected);
    assert.notDeepEqual(
      expected,
      mergeReport({ ...canonical, verbose }),
      'MergeCmd deliberately selects only public fields'
    );
    const laneCommand = new MergeLaneCmd(
      { mergeLaneByCLI: async () => ({ mergeResults: canonical, deleteResults: {}, configMergeResults: [] }) },
      { getConfigBoolean: () => false }
    );
    const laneExpected = await laneCommand.report(['incoming'], {
      manual: true,
      skipDependencyInstallation: true,
      verbose,
    });
    const laneOptions = {
      ...parseRustWorkspaceCommand(['lane', 'merge', 'incoming', '-x', '--manual']),
      verbose,
    };
    assert.deepEqual(formatRustWorkspaceCommand(wire, laneOptions), laneExpected);
    assert.notDeepEqual(laneExpected, expected, 'lane command retains manual conflict and removal sections');
  }
});

test('native failed-snap issue receipts match canonical ComponentsHaveIssues and reject malformed data', async () => {
  const { formatRustWorkspaceCommand } = load('rust-workspace-command-report');
  const { MergeCmd } = installed('@teambit/merging/dist/merge-cmd.js');
  const { ComponentID } = installed('@teambit/component-id');
  const { IssuesList } = installed('@teambit/component-issues');
  const { ComponentsHaveIssues } = installed('@teambit/builder/dist/exceptions/components-have-issues.js');
  const issues = [
    { type: 'MissingManuallyConfiguredPackages', data: JSON.stringify(['missing-package', '@scope/other']) },
  ];
  const identity = 'qualification.policy/component@1.0.0';
  const wire = {
    components: [],
    failedComponents: [],
    mergeSnapError: {
      kind: 'componentsHaveIssues',
      components: [{ id: identity, issues }],
    },
  };
  const canonical = {
    ...wire,
    mergeSnapError: new ComponentsHaveIssues([
      { id: ComponentID.fromString(identity), issues: IssuesList.deserialize(issues) },
    ]),
  };
  const command = new MergeCmd({ merge: async () => canonical }, { getConfigBoolean: () => false });
  const expected = await command.report([identity], { skipDependencyInstallation: true });
  const options = parseRustWorkspaceCommand(['merge', identity.split('@')[0], '-x']);
  assert.deepEqual(formatRustWorkspaceCommand(wire, options), expected);
  for (const invalid of [
    { kind: 'unknown', components: [] },
    { kind: 'componentsHaveIssues', components: [] },
    { kind: 'componentsHaveIssues', components: [{ id: identity, issues: [] }] },
    ...['null', '[]', '[1]', 'invalid json'].map((data) => ({
      kind: 'componentsHaveIssues',
      components: [{ id: identity, issues: [{ type: 'MissingManuallyConfiguredPackages', data }] }],
    })),
    {
      kind: 'componentsHaveIssues',
      components: [{ id: identity, issues: [{ type: 'CustomIssue', data: '["package"]' }] }],
    },
  ])
    assert.throws(() => formatRustWorkspaceCommand({ ...wire, mergeSnapError: invalid }, options));
});

test('failed-snap cache commit drops other captured entries after checking the full workspace', async (t) => {
  const capture = load('rust-client-capture');
  const fresh = load('rust-fresh-dependencies');
  const policy = load('rust-status-policy');
  const inventory = installed('@teambit/legacy.bit-map/dist/rust-inventory-policy.js');
  const originals = [];
  const replace = (module, key, value) => {
    originals.push([module, key, module[key]]);
    module[key] = value;
  };
  t.after(() => originals.reverse().forEach(([module, key, value]) => (module[key] = value)));
  const detected = [];
  const committed = [];
  replace(inventory, 'captureRustInventoryPolicy', () => ({ policy: {}, fresh: () => true }));
  replace(policy, 'statusPolicy', () => ({ input: {}, packageName: '@scope/component' }));
  replace(policy, 'currentStatusMetadata', () => ({}));
  replace(fresh, 'planFreshDependencyCache', async () => ({ reset: true }));
  replace(fresh, 'readFreshDependencies', async (_root, _context, target) => {
    detected.push(target.identity);
    return {
      cache: { identity: `${target.identity}@1.0.0`, rawData: target.identity, readSet: [] },
      dependencies: { state: { entries: [], components: [[], [], []] }, issues: [] },
    };
  });
  replace(fresh, 'commitFreshDependencies', async (plan, entries) => committed.push({ plan, entries }));
  const targets = ['scope/divergent', 'scope/unrelated'].map((identity, index) => ({
    identity,
    version: '1.0.0',
    directory: `component-${index}`,
    mainFile: 'index.js',
  }));
  const context = { targets, options: { patterns: [], ignoredFiles: [], trackAllFiles: false } };
  const captured = await capture.captureRustClientCurrent('/workspace', context, async ({ kind }) => {
    if (kind === 'inventoryBegin') return { token: 'scan', nested: [], own: [] };
    if (kind === 'inventoryFinish') return { files: [{ relativePath: 'index.js' }] };
    throw new Error(`unexpected native request ${kind}`);
  });
  assert.deepEqual(
    detected,
    targets.map((target) => target.identity),
    'every workspace component is checked'
  );
  const replacement = { identity: 'scope/divergent@1.0.0', rawData: 'post-merge', readSet: [] };
  await captured.commit([replacement], true);
  assert.deepEqual(committed[0], { plan: { reset: true }, entries: [replacement] });
  await captured.commit([replacement], true, new Set(['scope/unrelated@2.0.0']));
  assert.deepEqual(
    committed[1].entries,
    [replacement],
    'a different dependency version never restores workspace cache'
  );
  await captured.commit([replacement], true, new Set(['scope/unrelated@1.0.0']));
  assert.deepEqual(
    committed[2].entries.map((entry) => entry.identity),
    ['scope/unrelated@1.0.0', replacement.identity]
  );
  await captured.commit([replacement]);
  assert.deepEqual(
    committed[3].entries.map((entry) => entry.identity),
    ['scope/unrelated@1.0.0', 'scope/divergent@1.0.0'],
    'successful snap still preserves other captured cache rows'
  );
  await captured.commit([], false, undefined, true);
  assert.equal(committed.length, 4, 'scope-only snapshot neither writes rows nor resets an invalidated cache');
  await assert.rejects(captured.commit([replacement], false, undefined, true), /scope-only command/);
  replace(inventory, 'captureRustInventoryPolicy', () => ({ policy: {}, fresh: () => false }));
  const stale = await capture.captureRustClientCurrent('/workspace', { ...context, targets: [] }, async () => {});
  await assert.rejects(stale.commit([], false, undefined, true), /policy changed/);
});

test('projected snapshot blockers include new cycles and duplicate workspace packages', async (t) => {
  const { validateRustCommandIssues } = load('rust-workspace-command-issues');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-command-issues-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const components = ['alpha', 'beta'].map((name) => ({
    identity: `test.scope/${name}@1.0.0`,
    packageName: `@test/scope.${name}`,
    dependencies: name === 'beta' ? ['test.scope/alpha@1.0.0'] : [],
    issues: [],
  }));
  for (const component of components)
    await fs.mkdir(path.join(root, 'node_modules', component.packageName, 'dist'), { recursive: true });
  const context = {
    workspace: {},
    packageJson: {},
    models: [],
    versions: [],
    targets: components.map((component) => ({ identity: component.identity.split('@')[0], directory: 'component' })),
  };
  const selected = components[0];
  const plan = {
    needsSnap: ['test.scope/alpha'],
    policyPreparation: { targets: [{ identity: 'test.scope/alpha', fastForward: false }] },
    issueTargets: [selected],
  };
  await validateRustCommandIssues(root, context, components, plan);
  const circular = { ...selected, dependencies: ['test.scope/beta@1.0.0'] };
  await assert.rejects(
    validateRustCommandIssues(root, context, components, { ...plan, issueTargets: [circular] }),
    /snapshot issue/
  );
  const duplicate = { ...context, packageJson: { dependencies: { [selected.packageName]: '1.0.0' } } };
  await assert.rejects(validateRustCommandIssues(root, duplicate, components, plan), /snapshot issue/);
  const issue = { type: 'MissingManuallyConfiguredPackages', data: JSON.stringify(['missing-package']) };
  const failed = {
    ...plan,
    snapFailed: true,
    issueTargets: [{ ...selected, issues: [issue] }],
    result: { mergeSnapError: { components: [{ id: selected.identity, issues: [issue] }] } },
  };
  await validateRustCommandIssues(root, context, components, failed);
  await assert.rejects(
    validateRustCommandIssues(root, context, components, {
      ...failed,
      issueTargets: [{ ...circular, issues: [issue] }],
    }),
    /snapshot issue/,
    'matching manual issue must not conceal an additional projected cycle'
  );
  const addition = {
    identity: 'test.scope/new@incoming',
    packageName: '@test/scope.new',
    dependencies: [],
    issues: [],
  };
  const addedContext = {
    ...context,
    lane: { addedTargets: [{ identity: 'test.scope/new', version: 'incoming', directory: 'new' }] },
  };
  const addedPlan = {
    ...plan,
    policyPreparation: {
      targets: [...plan.policyPreparation.targets, { identity: 'test.scope/new', fastForward: true }],
    },
    issueTargets: [{ ...selected, dependencies: [addition.identity] }, addition],
  };
  await validateRustCommandIssues(root, addedContext, components, addedPlan);
  await assert.rejects(validateRustCommandIssues(root, context, components, addedPlan), /target identity/);
  await assert.rejects(
    validateRustCommandIssues(root, addedContext, components, {
      ...addedPlan,
      issueTargets: [{ ...addition, identity: 'test.scope/new@unproven' }],
    }),
    /target identity/
  );
  await assert.rejects(
    validateRustCommandIssues(root, addedContext, components, {
      ...addedPlan,
      issueTargets: [addedPlan.issueTargets[0], { ...addition, dependencies: [selected.identity] }],
    }),
    /snapshot issue/,
    'new incoming components participate in projected cycle checks before their files exist'
  );
});

test('lane snapshot cache replay follows exact projected workspace dependency closure', () => {
  const { rustCommandSnapshotCacheClosure, rustCommandAddedSnapshotCaches } = load('rust-workspace-command-issues');
  const components = [
    { identity: 'scope/root@1', dependencies: [] },
    { identity: 'scope/reachable@1', dependencies: ['scope/transitive@1'] },
    { identity: 'scope/transitive@1', dependencies: ['scope/root@1'] },
    { identity: 'scope/unrelated@1', dependencies: [] },
    { identity: 'scope/different-version@2', dependencies: [] },
  ];
  const plan = {
    result: { mergeSnapError: { components: [{ id: 'scope/root@1' }] } },
    policyPreparation: { targets: [{ identity: 'scope/root', fastForward: false }] },
    issueTargets: [{ identity: 'scope/root@1', dependencies: ['scope/reachable@1', 'scope/different-version@1'] }],
  };
  assert.deepEqual(
    [...rustCommandSnapshotCacheClosure(components, plan)],
    ['scope/root@1', 'scope/reachable@1', 'scope/transitive@1']
  );
  const addition = { identity: 'scope/new@incoming', dependencies: ['scope/reachable@1'] };
  const addedPlan = {
    ...plan,
    policyPreparation: { targets: [...plan.policyPreparation.targets, { identity: 'scope/new', fastForward: true }] },
    issueTargets: [{ identity: 'scope/root@1', dependencies: [addition.identity] }, addition],
  };
  const context = { lane: { addedTargets: [{ identity: 'scope/new', version: 'incoming' }] } };
  assert.deepEqual(
    [...rustCommandSnapshotCacheClosure(components, addedPlan, context)],
    ['scope/root@1', addition.identity, 'scope/reachable@1', 'scope/transitive@1']
  );
  assert.throws(() => rustCommandSnapshotCacheClosure(components, addedPlan), /target identity/);
  const successful = { ...addedPlan, result: {} };
  const reached = rustCommandSnapshotCacheClosure(components, successful, context);
  assert.deepEqual([...reached], ['scope/root@1', addition.identity, 'scope/reachable@1', 'scope/transitive@1']);
  const caches = [
    { identity: 'scope/unrelated@1' },
    { identity: addition.identity },
    { identity: 'scope/new@other-version' },
    { identity: 'scope/new-unused@incoming' },
  ];
  const moreAdditions = {
    lane: { addedTargets: [...context.lane.addedTargets, { identity: 'scope/new-unused', version: 'incoming' }] },
  };
  assert.deepEqual(
    rustCommandAddedSnapshotCaches(caches, moreAdditions, reached),
    caches.slice(0, 2),
    'only newly introduced components actually reloaded after snapshot cache reset acquire cache entries'
  );
});
