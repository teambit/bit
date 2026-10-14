const { test } = require('node:test');
const assert = require('node:assert/strict');
const { source, installed } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_COMMAND_COMPILED === '1';
const load = (name) => (compiled ? installed(`@teambit/bit/dist/${name}.js`) : source(`scopes/harmony/bit/${name}.ts`));

test('recovery grammar requires explicit noninteractive install-free lane semantics', () => {
  const { parseRustWorkspaceRecovery: parse } = load('rust-workspace-recovery-options');
  assert.deepEqual(parse(['merge', 'scope/component', '--abort', '-x']), {
    operation: 'componentAbort',
    pattern: 'scope/component',
    skipDependencyInstallation: true,
  });
  assert.equal(parse(['lane', 'merge-abort', '-x', '-s']).operation, 'laneAbort');
  for (const args of [
    ['merge', '--abort'],
    ['merge', '--abort', '--resolve', '-x'],
    ['merge', '--abort', '-x', '--build'],
    ['lane', 'merge-abort', '-x'],
    ['lane', 'merge-abort', '-x', '-s', '--silent'],
    ['lane', 'merge-abort', '-x', '-s', 'extra'],
  ])
    assert.equal(parse(args), undefined, args.join(' '));
});

test('recovery reports share the actual lane command formatter including partial checkout failure', async () => {
  const { formatRustWorkspaceRecovery } = load('rust-workspace-recovery-report');
  const canonical = compiled
    ? installed('@teambit/merge-lanes/dist/merge-abort.cmd.js')
    : source('scopes/lanes/merge-lanes/merge-abort.cmd.ts');
  const options = { operation: 'laneAbort', silent: true, skipDependencyInstallation: true, verbose: true };
  const result = {
    restoredItems: ['.bitmap file', 'workspace.jsonc file'],
    checkoutError: { message: 'missing retained Version' },
  };
  const cmd = new canonical.MergeAbortLaneCmd({ abortLaneMerge: async () => result });
  assert.deepEqual(
    formatRustWorkspaceRecovery(result, options),
    await cmd.report([], { silent: true, skipDependencyInstallation: true, verbose: true })
  );
  assert.throws(() => formatRustWorkspaceRecovery({ ...result, checkoutError: { message: 1 } }, options));
  assert.throws(() => formatRustWorkspaceRecovery({ ...result, unknown: true }, options));
});

test('public component abort propagates -x and clears pending only after reset succeeds', async () => {
  const { MergingMain } = compiled
    ? installed('@teambit/merging/dist/merging.main.runtime.js')
    : source('scopes/component/merging/merging.main.runtime.ts');
  const prior = process.env.BIT_RUST_CLIENT_VCS;
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  try {
    for (const skip of [false, true]) {
      const events = [];
      const id = { toString: () => 'scope/component@1.0.0' };
      const unmerged = { removeComponent: () => events.push('clear'), write: async () => events.push('write') };
      const owner = Object.create(MergingMain.prototype);
      owner.workspace = {
        consumer: {
          scope: { objects: { unmergedComponents: unmerged } },
          onDestroy: async () => events.push('destroy'),
        },
      };
      owner.getIdsForUnmerged = async () => [id];
      owner.checkout = {
        checkout: async (props) => {
          assert.equal(props.skipNpmInstall, skip);
          assert.equal(props.reset, true);
          events.push('reset');
          return { components: [] };
        },
      };
      await owner.merge(undefined, undefined, true, false, false, undefined, false, skip);
      assert.deepEqual(events, ['reset', 'clear', 'write', 'destroy']);
      events.length = 0;
      owner.checkout.checkout = async () => {
        events.push('reset');
        throw new Error('reset failed');
      };
      await assert.rejects(
        owner.merge(undefined, undefined, true, false, false, undefined, false, skip),
        /reset failed/
      );
      assert.deepEqual(events, ['reset']);
    }
  } finally {
    if (prior === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = prior;
  }
});

test('recovery adapter excludes native missing roots and never falls back after publication starts', async () => {
  const capture = load('rust-client-capture');
  const originals = { request: capture.withRustClientRequest, capture: capture.captureRustClientCurrent };
  const driver = load('rust-workspace-recovery');
  const options = { operation: 'componentAbort', skipDependencyInstallation: true };
  const current = { identity: 'scope/current', version: '1.0.0', directory: 'current' };
  const missing = { identity: 'scope/missing', version: '1.0.0', directory: 'missing', missingRoot: true };
  const proofs = [{ path: '/workspace/control', hash: 'retained' }];
  let failure;
  const events = [];
  capture.captureRustClientCurrent = async (_root, _context, _request, targets) => {
    assert.deepEqual(targets, [current]);
    return {
      captured: [],
      dependencyReadSet: proofs,
      fresh: () => true,
      commit: async () => {
        events.push('cache');
        if (failure === 'cache') throw new Error('cache failed');
      },
    };
  };
  capture.withRustClientRequest = async (action, propagate) => {
    try {
      return await action(async (input) => {
        events.push(input.kind);
        if (input.kind === failure) throw new Error('request failed');
        if (input.kind === 'commandRecoveryPrepare')
          return { token: 'token', context: { models: [] }, targets: [current, missing], captureTargets: [current] };
        if (input.kind === 'commandRecoveryPlan') return { token: 'token', result: { abortedComponents: [] } };
        assert.deepEqual(input.dependencyReadSet, proofs);
        return { applied: true };
      });
    } catch (error) {
      if (propagate()) throw error;
      return undefined;
    }
  };
  try {
    assert.notEqual(await driver.readRustWorkspaceRecovery('/workspace', '/home', options), undefined);
    assert.deepEqual(events, ['commandRecoveryPrepare', 'commandRecoveryPlan', 'cache', 'commandRecoveryApply']);
    failure = 'commandRecoveryPlan';
    events.length = 0;
    assert.equal(await driver.readRustWorkspaceRecovery('/workspace', '/home', options), undefined);
    assert.ok(!events.includes('cache'));
    for (failure of ['cache', 'commandRecoveryApply'])
      await assert.rejects(driver.readRustWorkspaceRecovery('/workspace', '/home', options), /failed/);
  } finally {
    capture.withRustClientRequest = originals.request;
    capture.captureRustClientCurrent = originals.capture;
  }
});

test('recovery report adapter loads no canonical workspace or Version/Source model classes', () => {
  const cp = require('node:child_process');
  const script = `
    const { source, installed } = require('./scripts/rust-object-import/load-source.cjs');
    const adapter = process.env.BIT_TEST_COMMAND_COMPILED === '1'
      ? installed('@teambit/bit/dist/rust-workspace-recovery-report.js')
      : source('scopes/harmony/bit/rust-workspace-recovery-report.ts');
    adapter.formatRustWorkspaceRecovery({restoredItems:['.bitmap file']},{operation:'laneAbort',silent:true,skipDependencyInstallation:true});
    const loaded = Object.keys(require.cache).map(file => file.split(require('node:path').sep).join('/')).filter(file => /\\/(?:load-bit|consumer-component|model-component)\\.js$|\\/models\\/(?:version|source)\\.js$|\\/workspace\\/dist\\/workspace\\.js$/.test(file));
    require('node:assert/strict').deepEqual(loaded, []);
  `;
  cp.execFileSync(process.execPath, ['-e', script], {
    cwd: require('node:path').resolve(__dirname, '../..'),
    env: process.env,
  });
});

test('recovery retains Source inventory without inventing dependencies when discarded conflict Sources fail detection', async (t) => {
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
  replace(inventory, 'captureRustInventoryPolicy', () => ({ policy: {}, fresh: () => true }));
  replace(policy, 'statusPolicy', () => ({ input: {}, packageName: '@scope/component' }));
  replace(fresh, 'planFreshDependencyCache', async () => ({ reset: false }));
  replace(fresh, 'readFreshDependencies', async () => {
    throw new Error('conflict-marker syntax');
  });
  replace(fresh, 'commitFreshDependencies', async () => assert.fail('failed detection must not create a cache'));
  const target = { identity: 'scope/component', version: '1.0.0', directory: 'component', mainFile: 'index.js' };
  const context = { targets: [target], options: { patterns: [], ignoredFiles: [], trackAllFiles: false } };
  const request = async ({ kind }) => {
    if (kind === 'inventoryBegin') return { token: 'scan', nested: [], own: [] };
    if (kind === 'inventoryFinish') return { files: [{ relativePath: 'index.js' }, { relativePath: 'added.js' }] };
    if (kind === 'dependencyPolicyCached') return { needsDetection: true };
    throw new Error(`unexpected request ${kind}`);
  };
  await assert.rejects(capture.captureRustClientCurrent('/workspace', context, request), /conflict-marker syntax/);
  const retained = await capture.captureRustClientCurrent('/workspace', context, request, [target], {
    recoveryDiscardedSources: true,
  });
  assert.deepEqual(retained.captured, [
    {
      identity: target.identity,
      version: target.version,
      directory: target.directory,
      files: ['index.js', 'added.js'],
      current: { mainFile: 'index.js' },
      peerDependencies: [],
    },
  ]);
  assert.deepEqual(retained.components, []);
  assert.deepEqual(retained.dependencyReadSet, []);
  await retained.commit();
  replace(policy, 'statusPolicy', () => {
    throw new Error('unsupported policy');
  });
  await assert.rejects(
    capture.captureRustClientCurrent('/workspace', context, request, [target], { recoveryDiscardedSources: true }),
    /unsupported policy/
  );
});

test('actual CLI bootstrap dispatches lane merge-abort before loading the canonical workspace', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const path = require('node:path');
  const filename = compiled
    ? installed.resolve('@teambit/bit/dist/run-bit.js')
    : path.join(__dirname, '../../scopes/harmony/bit/run-bit.ts');
  const raw = fs.readFileSync(filename, 'utf8');
  const code = compiled
    ? raw
    : installed('typescript').transpileModule(raw, {
        compilerOptions: {
          target: installed('typescript').ScriptTarget.ES2022,
          module: installed('typescript').ModuleKind.CommonJS,
          esModuleInterop: true,
        },
      }).outputText;
  for (const command of [
    ['lane', 'merge-abort', '-x', '--silent'],
    ['merge', '--abort', '-x'],
  ]) {
    const events = [];
    const module = { exports: {} };
    const sandbox = {
      module,
      exports: module.exports,
      process: { argv: ['node', 'bit', ...command], env: { BIT_RUST_CLIENT_VCS: 'on' }, on: () => {} },
      require: (name) => {
        if (name === 'fs') return {};
        if (name === 'graceful-fs') return { gracefulify: () => {} };
        if (name === './bootstrap') return { bootstrap: async () => events.push('bootstrap') };
        if (name === './server-commander') return { shouldUseBitServer: () => false };
        if (name === './rust-workspace-command')
          return {
            runRustWorkspaceCommand: async () => {
              events.push('native');
              return true;
            },
          };
        if (name === './load-bit') return { runCLI: async () => events.push('canonical') };
        if (name.includes('handle-errors'))
          return {
            handleErrorAndExit: async (error) => {
              throw error;
            },
          };
        return {};
      },
    };
    vm.runInNewContext(code, sandbox, { filename });
    await module.exports.runBit();
    assert.deepEqual(events, ['bootstrap', 'native']);
  }
});

test('recovery bitmap policy overrides component and model policy without admitting custom callbacks', () => {
  const { statusPolicy } = load('rust-status-policy');
  const resolver = 'teambit.dependencies/dependency-resolver';
  const target = {
    identity: 'qualification.policy/component',
    config: {
      propagate: true,
      extensions: { [resolver]: { policy: { devDependencies: { '@types/node': '^20.0.0' } } } },
    },
    bitmapConfig: { [resolver]: { policy: { devDependencies: { '@types/node': '^22.0.0' } } } },
  };
  const context = { models: [], versions: [], workspace: {}, targets: [target] };
  const version = {
    schema: '2.0.0',
    extensions: [{ name: resolver, config: { policy: { devDependencies: { '@types/node': '^18.0.0' } } } }],
  };
  const policy = statusPolicy(context, target, version);
  assert.equal(policy.extensions[0].config.policy.devDependencies['@types/node'], '^22.0.0');
  const ordinary = statusPolicy(context, { ...target, bitmapConfig: undefined }, version);
  assert.equal(ordinary.extensions[0].config.policy.devDependencies['@types/node'], '^20.0.0');
  for (const bitmapConfig of [
    { custom: {} },
    { [resolver]: '-' },
    { 'teambit.pipelines/builder': { pipeline: 'custom' } },
  ]) {
    assert.throws(() => statusPolicy(context, { ...target, bitmapConfig }, version), /recovery bitmap/);
  }
});

test('internal recovery progress emits retained imports without public checkout lifecycle', async (t) => {
  const { loader } = installed('@teambit/legacy.loader');
  const original = { start: loader.start, succeed: loader.succeed };
  const messages = [];
  loader.start = (message) => messages.push(message);
  loader.succeed = (message) => messages.push(`success:${message}`);
  t.after(() => Object.assign(loader, original));
  const { commandProgress } = load('rust-workspace-command-progress');
  const receipt = {
    bitmapCount: 1,
    imports: [{ reason: null, ids: ['scope/component@1.0.0'], components: 1, objects: 1 }],
  };
  await commandProgress(receipt, 'recovery')();
  assert.deepEqual(messages, ['importing 1 components', 'successfully imported 1 components']);
  messages.length = 0;
  await commandProgress({ bitmapCount: 1, imports: [] }, 'recovery')();
  assert.deepEqual(messages, []);
  await commandProgress(receipt, 'checkout')();
  assert.deepEqual(messages.slice(0, 3), [
    'switching component version...',
    'importing components',
    'success:importing components',
  ]);
});

test('recovery accepts actual eject-conf empty builtins while preserving ordinary eligibility', () => {
  const { statusPolicy } = load('rust-status-policy');
  const names = [
    'teambit.envs/envs',
    'teambit.dependencies/dependency-resolver',
    'teambit.component/dev-files',
    'teambit.semantics/schema',
    'teambit.pkg/pkg',
    'teambit.preview/preview',
    'teambit.compositions/compositions',
    'teambit.docs/docs',
  ];
  const target = {
    identity: 'qualification.policy/component',
    config: { propagate: false, extensions: Object.fromEntries(names.map((name) => [name, {}])) },
  };
  const context = { models: [], versions: [], workspace: {}, targets: [target] };
  const version = { schema: '2.0.0', extensions: [] };
  assert.throws(() => statusPolicy(context, target, version), /status component extension/);
  const policy = statusPolicy(context, { ...target, recoveryConfig: true }, version);
  assert.deepEqual(
    policy.extensions.map((extension) => extension.name),
    names
  );
  assert.ok(policy.extensions.every((extension) => extension.config.__specific === true));
  target.config.extensions['teambit.pkg/pkg'] = { packageJson: { custom: true } };
  assert.throws(
    () => statusPolicy(context, { ...target, recoveryConfig: true }, version),
    /status component extension/
  );
});

test('lane recovery restores before invalidating cache and validates projected controls without losing Source proofs', async (t) => {
  const captureModule = load('rust-client-capture');
  const originals = { request: captureModule.withRustClientRequest, capture: captureModule.captureRustClientCurrent };
  t.after(() => {
    captureModule.withRustClientRequest = originals.request;
    captureModule.captureRustClientCurrent = originals.capture;
  });
  const driver = load('rust-workspace-recovery');
  const path = require('node:path');
  const root = path.resolve('recovery-driver-workspace');
  const target = { identity: 'scope/component', version: '1.0.0', directory: 'component' };
  const original = [
    { path: path.join(root, '.bitmap'), hash: '1'.repeat(64) },
    { path: path.join(root, 'component', 'index.js'), hash: '3'.repeat(64) },
  ];
  const projected = [{ ...original[0], hash: '2'.repeat(64) }, original[1]];
  const events = [];
  let failCache = false;
  captureModule.captureRustClientCurrent = async (_root, _context, request, _targets, options) => {
    assert.equal(options.resetDependencyCache, true);
    return {
      captured: [],
      dependencyReadSet: original,
      fresh: () => true,
      commit: async () => {
        events.push('cache');
        await request({ kind: 'dependencyFreshValidate', readSet: original });
        if (failCache) throw new Error('cache commit failed');
      },
    };
  };
  captureModule.withRustClientRequest = async (action, propagate) => {
    try {
      return await action(async (input) => {
        events.push(input.kind);
        if (input.kind === 'commandRecoveryPrepare')
          return { token: 'retained', context: { models: [] }, targets: [target], captureTargets: [target] };
        if (input.kind === 'commandRecoveryPlan')
          return { token: 'retained', result: { restoredItems: ['.bitmap file'] } };
        if (input.kind === 'commandRecoveryRestore') {
          assert.deepEqual(input.dependencyReadSet, original);
          return { restored: true, dependencyReadSet: projected, restoredControls: [original[0].path] };
        }
        if (input.kind === 'dependencyFreshValidate') {
          assert.deepEqual(input.readSet, projected);
          return { fresh: true };
        }
        assert.equal(input.kind, 'commandRecoveryApply');
        assert.deepEqual(input.dependencyReadSet, projected);
        assert.deepEqual(input.checkoutError, failCache ? { message: 'cache commit failed' } : undefined);
        return {
          applied: true,
          result: {
            restoredItems: ['.bitmap file'],
            ...(input.checkoutError && { checkoutError: input.checkoutError }),
          },
        };
      });
    } catch (error) {
      if (propagate()) throw error;
      return undefined;
    }
  };
  const options = { operation: 'laneAbort', silent: true, skipDependencyInstallation: true };
  for (failCache of [false, true]) {
    events.length = 0;
    const result = await driver.readRustWorkspaceRecovery(root, path.resolve('recovery-driver-home'), options);
    assert.notEqual(result, undefined);
    assert.deepEqual(events, [
      'commandRecoveryPrepare',
      'commandRecoveryPlan',
      'commandRecoveryRestore',
      'cache',
      'dependencyFreshValidate',
      'commandRecoveryApply',
    ]);
    if (failCache) assert.match(JSON.stringify(result), /cache commit failed/);
  }
});
