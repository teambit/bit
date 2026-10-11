const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { source, installed } = require('./load-source.cjs');
const helper =
  process.env.BIT_TEST_OBJECT_IMPORT ||
  path.resolve(__dirname, '../../native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));
const compiled = process.env.BIT_TEST_CONFIG_MERGE_COMPILED === '1';
const base = path.dirname(installed.resolve('@teambit/config-merger'));
const at = (name) =>
  compiled ? require(path.join(base, name + '.js')) : source('scopes/workspace/config-merger/' + name + '.ts');
const { ComponentConfigMerger } = at('component-config-merger');
const { tryRustComponentConfigMerge } = at('rust-component-config-merge');
const { normalizeSemverInputs } = at('rust-config-operation');
const { ExtensionDataList, ExtensionDataEntry } = installed('@teambit/legacy.extension-data');
const { Logger } = installed('@teambit/logger');
const { withRustSnapshotOperation } = installed('@teambit/objects');
ExtensionDataList.coreExtensionsNames.set('teambit.envs/envs', '');
ExtensionDataList.coreExtensionsNames.set('qualification/aspect', '');
function list(config, data = {}) {
  return new ExtensionDataList(
    new ExtensionDataEntry(undefined, undefined, 'teambit.envs/envs', { env: 'teambit.harmony/node' }, {}),
    new ExtensionDataEntry(undefined, undefined, 'qualification/aspect', config, data)
  );
}
function merger(current, base, other, strategy = 'manual', logger = new Logger('qualification-config')) {
  return new ComponentConfigMerger(
    'qualification/component',
    [],
    undefined,
    current,
    base,
    other,
    'lane',
    'main',
    logger,
    strategy
  );
}
test('canonical adoption retains incoming config identity and exposes removal conflict', () => {
  const incoming = { nested: { enabled: true } },
    value = merger(list({ enabled: false }), list({ enabled: false }), list(incoming));
  const result = value.merge();
  assert.equal(result.getSuccessfullyMergedConfig()['qualification/aspect'].nested, incoming.nested);
  const removed = merger(
    list({ enabled: true }),
    list({ enabled: true }),
    new ExtensionDataList(
      new ExtensionDataEntry(undefined, undefined, 'teambit.envs/envs', { env: 'teambit.harmony/node' }, {})
    )
  ).merge();
  assert.deepEqual(removed.results.find((row) => row.id === 'qualification/aspect').conflict, {
    currentConfig: { enabled: true },
    otherConfig: '-',
  });
});
test('custom logger declines before invoking logger hooks or native request', async () => {
  const prior = process.env.BIT_RUST_CLIENT_VCS;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  let calls = 0;
  const value = merger(list({ a: 1 }), list({ a: 1 }), list({ a: 2 }), 'manual', {
    debug() {
      calls++;
    },
    trace() {
      calls++;
    },
  });
  try {
    assert.equal(await withRustSnapshotOperation(() => tryRustComponentConfigMerge(value, true)), undefined);
    assert.equal(calls, 0);
  } finally {
    if (prior === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = prior;
  }
});
test('npm semver normalized facts preserve prerelease, OR ranges and original minimum syntax', () => {
  const corpus = [
    '1.2.3',
    'v1.2.3',
    '=1.2.3',
    '^1.2.3',
    '~0.0.1',
    '>=1.2.3 <2.0.0',
    '1.2 - 1.4',
    '*',
    '',
    '>=1 || <0.5',
    '1.2.x',
    '1.2.3-beta.0+build',
    'workspace:*',
    'deadbeef',
  ];
  const facts = normalizeSemverInputs(corpus);
  assert.ok(facts);
  assert.deepEqual(facts['1.2.3-beta.0+build'].version.prerelease, ['beta', 0]);
  assert.equal(facts['>=1 || <0.5'].range.length, 2);
  assert.equal(facts['1.2 - 1.4'].minimumText, '1.2.0');
  assert.deepEqual(facts['workspace:*'], {});
  assert.deepEqual(facts.deadbeef, {});
});

test('actual native config and aspect-data matrix preserves canonical result ordering and incoming aliases', async () => {
  const providerBase = path.dirname(installed.resolve('@teambit/merging'));
  const { MergeStatusProvider } = compiled
    ? require(path.join(providerBase, 'merge-status-provider.js'))
    : source('scopes/component/merging/merge-status-provider.ts');
  const priorFlag = process.env.BIT_RUST_CLIENT_VCS,
    priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  let completed = 0;
  try {
    for (const strategy of ['manual', 'ours', 'theirs'])
      for (const mode of ['same', 'other', 'current', 'both', 'no-base', 'removed']) {
        function inputs() {
          const base = list({ value: 0 }, { value: 0 });
          const current = list(
            { value: mode === 'current' || mode === 'both' ? 1 : 0 },
            { value: mode === 'current' || mode === 'both' ? 1 : 0 }
          );
          const other = list(
            { value: mode === 'same' || mode === 'current' ? 0 : 2 },
            { value: mode === 'same' || mode === 'current' ? 0 : 2 }
          );
          if (mode === 'no-base') base.splice(1, 1);
          if (mode === 'removed') other.splice(1, 1);
          return { base, current, other };
        }
        const canonical = inputs(),
          native = inputs();
        const expectedMerger = merger(canonical.current, canonical.base, canonical.other, strategy);
        const expected = expectedMerger.merge();
        const expectedData = MergeStatusProvider.prototype.mergeExtensionsData.call(
          { options: { shouldMergeAspectsData: true } },
          canonical.current,
          canonical.base,
          canonical.other
        );
        const nativeMerger = merger(native.current, native.base, native.other, strategy);
        const originalHandled = nativeMerger.handledExtIds;
        const value = await withRustSnapshotOperation(() => tryRustComponentConfigMerge(nativeMerger, true));
        assert.ok(value, `${strategy}/${mode} must acknowledge a genuine native operation`);
        completed++;
        assert.deepEqual(value.configMergeResult, expected, `${strategy}/${mode} config parity`);
        assert.equal(nativeMerger.handledExtIds, originalHandled, 'merger retains original handled array alias');
        assert.deepEqual(value.dataMergeResult, expectedData, `${strategy}/${mode} data conflicts`);
        for (const field of ['handledExtIds', 'currentEnv', 'baseEnv', 'otherEnv'])
          assert.deepEqual(nativeMerger[field], expectedMerger[field], `${strategy}/${mode} reusable merger ${field}`);
        assert.deepEqual(nativeMerger.merge(), expectedMerger.merge(), `${strategy}/${mode} repeated public merge`);
        assert.deepEqual(
          native.current.map((e) => e.data),
          canonical.current.map((e) => e.data)
        );
        if (mode === 'other' || (mode === 'both' && strategy === 'theirs')) {
          if (mode === 'other')
            assert.equal(native.current[1].data, native.other[1].data, 'data adoption retains exact incoming alias');
        }
      }
    assert.equal(completed, 18);
  } finally {
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
    if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
  }
});

test('native JSONC conflict commit preserves exact bytes and installs post-backup writer hooks', async () => {
  const fs = require('node:fs/promises'),
    os = require('node:os');
  const { ConfigMergerMain } = at('config-merger.main.runtime');
  const { WorkspaceConfig } = installed('@teambit/config');
  const owner = Object.create(ConfigMergerMain.prototype);
  owner.logger = new Logger('qualification-config');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-config-conflicts-test-'));
  const filename = path.join(directory, 'workspace.jsonc');
  const input =
    '// keep comment\n{\n  "teambit.dependencies/dependency-resolver": {\n    "policy": { "dependencies": { "package-a": "^1.0.0" } }\n  }\n}\n';
  const conflicts = { dependencies: [{ name: 'package-a', version: 'CONFLICT::^1.0.0::2.0.0::' }] };
  const priorFlag = process.env.BIT_RUST_CLIENT_VCS,
    priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  const fse = installed('fs-extra'),
    originalWrite = fse.writeFile;
  try {
    for (const postBackupHook of [false, true]) {
      await fs.writeFile(filename, input);
      const config = new WorkspaceConfig({}, filename);
      let backups = 0,
        writes = 0;
      config.backupConfigFile = async (reason) => {
        assert.equal(reason, 'before writing conflicts');
        backups++;
        assert.equal(await fs.readFile(filename, 'utf8'), input, 'backup precedes overwrite');
        if (postBackupHook)
          fse.writeFile = async (...args) => {
            writes++;
            return originalWrite(...args);
          };
      };
      owner.config = { workspaceConfig: config };
      await withRustSnapshotOperation(() => owner.writeWorkspaceJsoncWithConflicts(conflicts));
      const output = await fs.readFile(filename, 'utf8');
      assert.ok(output.includes('// keep comment'));
      assert.ok(output.includes('<<<<<<<') && output.includes('>>>>>>>'));
      assert.equal(backups, 1, 'prepared candidate replay never duplicates backup');
      if (postBackupHook || process.platform !== 'win32')
        assert.equal(
          writes,
          postBackupHook ? 1 : 0,
          'native success bypasses Node body write; newly installed write hook runs canonically'
        );
      fse.writeFile = originalWrite;
    }
  } finally {
    fse.writeFile = originalWrite;
    await fs.rm(directory, { recursive: true, force: true });
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
    if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
  }
});

test('crashed helper is reaped before canonical replay and retains incoming nested aliases', async () => {
  const cp = require('node:child_process');
  const originalSpawn = cp.spawn,
    priorFlag = process.env.BIT_RUST_CLIENT_VCS,
    priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  const children = [];
  cp.spawn = function (...args) {
    const child = originalSpawn.apply(this, args);
    const state = { closed: false };
    children.push(state);
    child.once('close', () => (state.closed = true));
    return child;
  };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = process.execPath;
  const incoming = { nested: { value: 2 } },
    value = merger(list({ value: 0 }), list({ value: 0 }), list(incoming));
  try {
    await withRustSnapshotOperation(async () => {
      assert.equal(await tryRustComponentConfigMerge(value, true), undefined);
      assert.equal(children.length, 1, 'operation attempted actual helper');
      assert.ok(
        children.every((child) => child.closed),
        'helper reaped before canonical replay'
      );
      const result = value.merge();
      assert.equal(result.getSuccessfullyMergedConfig()['qualification/aspect'].nested, incoming.nested);
    });
  } finally {
    cp.spawn = originalSpawn;
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
    if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
  }
});

test('workspace plan preserves policy mutation and component conflict cleanup before failing writer', async () => {
  const { ConfigMergerMain } = at('config-merger.main.runtime');
  const { ConfigMergeResult } = at('config-merge-result');
  const { WorkspaceConfig } = installed('@teambit/config');
  const resolver = 'teambit.dependencies/dependency-resolver';
  ExtensionDataList.coreExtensionsNames.set(resolver, '');
  const priorFlag = process.env.BIT_RUST_CLIENT_VCS,
    priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  const states = [];
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  try {
    for (const mode of ['off', 'on']) {
      process.env.BIT_RUST_CLIENT_VCS = mode;
      const policy = { dependencies: { 'updated-package': '1.0.0', 'conflicting-package': '^1.0.0' } };
      const config = new WorkspaceConfig({ [resolver]: { policy } }, '/tmp/qualification-config-workspace.jsonc');
      const survivor = { name: 'survivor', version: 'CONFLICT::1.0.0::2.0.0::', force: true };
      const row = {
        id: resolver,
        mergedConfig: { policy: { dependencies: [{ name: 'updated-package', version: '1.1.0', force: false }] } },
        conflict: {
          dependencies: [{ name: 'conflicting-package', version: 'CONFLICT::1.0.0::1.2.0::', force: false }, survivor],
        },
      };
      const result = new ConfigMergeResult('qualification/component', 'current', 'other', [row]);
      const owner = Object.create(ConfigMergerMain.prototype);
      owner.logger = new Logger('qualification-config');
      owner.config = { workspaceConfig: config };
      let writes = 0;
      const failure = new Error('qualification writer failure');
      config.write = async (options) => {
        writes++;
        assert.equal(options.reasonForChange, 'merge (update dependencies)');
        assert.equal(
          config.extensions.findCoreExtension(resolver).config.policy.dependencies['updated-package'],
          '1.1.0'
        );
        assert.equal(row.conflict.dependencies.length, 1);
        assert.equal(row.conflict.dependencies[0], survivor);
        throw failure;
      };
      await assert.rejects(owner.updateWorkspaceJsoncWithDepsIfNeeded([result]), (error) => error === failure);
      assert.equal(writes, 1);
      states.push({ policy: config.extensions.findCoreExtension(resolver).config.policy, rows: result.results });
    }
    assert.deepEqual(states[1], states[0]);
  } finally {
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
    if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
  }
});

test('ignored builder metadata with non-JSON artifact instances stays untouched by native projection', async () => {
  const builder = 'teambit.pipelines/builder';
  ExtensionDataList.coreExtensionsNames.set(builder, '');
  const current = list({ value: 0 }, { value: 0 }),
    base = list({ value: 0 }, { value: 0 }),
    other = list({ value: 2 }, { value: 2 });
  const ignored = new ExtensionDataEntry(undefined, undefined, builder, {}, {});
  let reads = 0;
  Object.defineProperty(ignored, 'rawConfig', {
    configurable: true,
    get() {
      reads++;
      throw new Error('ignored builder config read');
    },
  });
  Object.defineProperty(ignored, 'data', {
    configurable: true,
    get() {
      reads++;
      throw new Error('ignored builder artifacts read');
    },
  });
  current.push(ignored);
  base.push(ignored);
  other.push(ignored);
  const priorFlag = process.env.BIT_RUST_CLIENT_VCS,
    priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  try {
    const result = await withRustSnapshotOperation(() =>
      tryRustComponentConfigMerge(merger(current, base, other), true)
    );
    assert.ok(result, 'ignored artifact getters must not disable native ordinary aspect merge');
    assert.equal(reads, 0);
    assert.deepEqual(result.configMergeResult.getSuccessfullyMergedConfig()['qualification/aspect'], { value: 2 });
    assert.equal(current[1].data, other[1].data);
  } finally {
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
    if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
  }
});

test('preinstalled static species and Logger metadata getters decline without speculative callbacks', async () => {
  const prior = process.env.BIT_RUST_CLIENT_VCS;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  try {
    const value = merger(list({ a: 0 }), list({ a: 0 }), list({ a: 1 }));
    let speciesCalls = 0;
    const original = Object.getOwnPropertyDescriptor(ExtensionDataList, Symbol.species);
    Object.defineProperty(ExtensionDataList, Symbol.species, {
      configurable: true,
      get() {
        speciesCalls++;
        throw new Error('species hook');
      },
    });
    try {
      assert.equal(await withRustSnapshotOperation(() => tryRustComponentConfigMerge(value, true)), undefined);
      assert.equal(speciesCalls, 0);
    } finally {
      if (original) Object.defineProperty(ExtensionDataList, Symbol.species, original);
      else delete ExtensionDataList[Symbol.species];
    }
    let loggerCalls = 0;
    const logger = new Logger('qualification-config');
    Object.defineProperty(logger, 'extensionName', {
      configurable: true,
      get() {
        loggerCalls++;
        throw new Error('metadata hook');
      },
    });
    assert.equal(
      await withRustSnapshotOperation(() =>
        tryRustComponentConfigMerge(merger(list({ a: 0 }), list({ a: 0 }), list({ a: 1 }), 'manual', logger), true)
      ),
      undefined
    );
    assert.equal(loggerCalls, 0);
  } finally {
    if (prior === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = prior;
  }
});

test('standalone compiled workspace runtime initializes native guards before component merger is used', () => {
  const cp = require('node:child_process');
  const script = `
    const assert=require('node:assert/strict');
    const {createRequire}=require('node:module');
    const path=require('node:path');
    const load=createRequire(${JSON.stringify(path.join(process.env.BIT_LEGACY_ROOT || process.cwd(), 'package.json'))});
    const base=path.dirname(load.resolve('@teambit/config-merger'));
    const {ConfigMergerMain}=require(path.join(base,'config-merger.main.runtime.js'));
    const {canPlanWorkspaceConfig}=require(path.join(base,'rust-workspace-config.js'));
    const {Logger}=load('@teambit/logger');
    const owner=Object.create(ConfigMergerMain.prototype);owner.logger=new Logger('standalone-config');
    load('@teambit/objects').withRustSnapshotOperation(()=>assert.equal(canPlanWorkspaceConfig(owner),true)).catch(error=>{console.error(error);process.exitCode=1;});
  `;
  const result = cp.spawnSync(process.execPath, ['-e', script], {
    env: { ...process.env, BIT_RUST_CLIENT_VCS: 'on' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
});

test('public workspace dependency reconciliation matches npm range decisions, logs and callback order', async () => {
  const { ConfigMergerMain } = at('config-merger.main.runtime');
  const { WorkspacePolicy } = installed('@teambit/dependency-resolver');
  const operation = at('rust-config-operation'),
    originalRequest = operation.requestRustConfig;
  const priorFlag = process.env.BIT_RUST_CLIENT_VCS,
    priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  const pairs = [
    ['1.0.0', '1.1.0'],
    ['1.2.0', '1.1.0'],
    ['^1.0.0', '1.1.0'],
    ['~1.0.0', '1.1.0'],
    ['>=1.0.0', '1.1.0'],
    ['1.x', '1.2.0'],
    ['1.0 - 1.4', '1.2.0'],
    ['^1.0.0', '2.0.0'],
    ['1.0.0', '^1.2.0'],
    ['2.0.0', '^1.2.0'],
    ['^1.0.0', '~1.2.0'],
    ['>=1 || <0.5', '1.2.0'],
    ['1.2.0-beta.0', '1.2.0-beta.1'],
    ['1.2.0+build.1', '1.2.0+build.2'],
    ['^1.2.0-beta.0', '1.2.0-beta.1'],
    ['', '1.1.0'],
    ['deadbeef', '1.1.0'],
    ['*', '1.1.0'],
  ];
  let acknowledgments = 0;
  operation.requestRustConfig = async function (input, ...args) {
    const result = await originalRequest.call(this, input, ...args);
    if (input.kind === 'configWorkspaceUpdates' && result !== undefined) acknowledgments++;
    return result;
  };
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  try {
    for (const strategy of ['manual', 'theirs'])
      for (const [workspaceVersion, componentVersion] of pairs) {
        const results = [];
        for (const mode of ['off', 'on']) {
          process.env.BIT_RUST_CLIENT_VCS = mode;
          const callbacks = [],
            policy = new WorkspacePolicy([
              { dependencyId: 'package-a', lifecycleType: 'runtime', value: { version: workspaceVersion } },
            ]);
          const owner = Object.create(ConfigMergerMain.prototype);
          owner.logger = new Logger('qualification-config');
          owner.config = {};
          owner.depsResolver = {
            getWorkspacePolicyFromConfig() {
              callbacks.push('policy');
              return policy;
            },
            getDependenciesFromLegacyComponent() {
              callbacks.push('collect');
              return [
                {
                  source: 'auto',
                  version: componentVersion,
                  getPackageName() {
                    callbacks.push('package');
                    return 'package-a';
                  },
                },
              ];
            },
            addToRootPolicy(entries, options) {
              callbacks.push({ add: entries, options });
            },
            async persistConfig(reason) {
              callbacks.push({ persist: reason });
            },
          };
          const result = await owner.updateDepsInWorkspaceConfig([{}], strategy);
          results.push({ result, callbacks });
        }
        assert.deepEqual(results[1], results[0], `${strategy}: ${workspaceVersion} <- ${componentVersion}`);
      }
    assert.ok(acknowledgments >= 30, 'real Rust policy decisions must cover the npm grammar corpus');
  } finally {
    operation.requestRustConfig = originalRequest;
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
    if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
  }
});

test('JSONC backup path mutation retains the originally requested write target', async () => {
  const fs = require('node:fs/promises'),
    os = require('node:os');
  const { ConfigMergerMain } = at('config-merger.main.runtime');
  const { WorkspaceConfig } = installed('@teambit/config');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-config-path-test-')),
    filename = path.join(directory, 'workspace.jsonc'),
    later = path.join(directory, 'later.jsonc');
  const original = '{ "package-a": "1.0.0" }\n';
  await fs.writeFile(filename, original);
  const config = new WorkspaceConfig({}, filename),
    owner = Object.create(ConfigMergerMain.prototype);
  owner.logger = new Logger('qualification-config');
  owner.config = { workspaceConfig: config };
  let backups = 0;
  config.backupConfigFile = async () => {
    backups++;
    config._path = later;
  };
  const priorFlag = process.env.BIT_RUST_CLIENT_VCS,
    priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  try {
    await withRustSnapshotOperation(() =>
      owner.writeWorkspaceJsoncWithConflicts({
        dependencies: [{ name: 'package-a', version: 'CONFLICT::1.0.0::2.0.0::' }],
      })
    );
    assert.equal(backups, 1);
    assert.ok((await fs.readFile(filename, 'utf8')).includes('<<<<<<<'));
    await assert.rejects(fs.stat(later), { code: 'ENOENT' });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
    if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
  }
});

test('helper crash after JSONC plan recovers the private candidate with exactly one backup', async () => {
  const fs = require('node:fs/promises'),
    os = require('node:os'),
    cp = require('node:child_process');
  const { ConfigMergerMain } = at('config-merger.main.runtime');
  const { WorkspaceConfig } = installed('@teambit/config');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-config-crash-test-')),
    filename = path.join(directory, 'workspace.jsonc');
  await fs.writeFile(filename, '// backup body\n{ "package-a": "1.0.0" }\n');
  const owner = Object.create(ConfigMergerMain.prototype);
  owner.logger = new Logger('qualification-config');
  const config = new WorkspaceConfig({}, filename);
  owner.config = { workspaceConfig: config };
  const originalSpawn = cp.spawn,
    children = [];
  cp.spawn = function (...args) {
    const child = originalSpawn.apply(this, args);
    children.push(child);
    return child;
  };
  let backups = 0;
  config.backupConfigFile = async () => {
    backups++;
    assert.equal(children.length, 1, 'actual native plan prepared before backup');
    await new Promise((resolve) => {
      children[0].once('close', resolve);
      children[0].kill('SIGKILL');
    });
  };
  const priorFlag = process.env.BIT_RUST_CLIENT_VCS,
    priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  try {
    await withRustSnapshotOperation(() =>
      owner.writeWorkspaceJsoncWithConflicts({
        dependencies: [{ name: 'package-a', version: 'CONFLICT::1.0.0::2.0.0::' }],
      })
    );
    assert.equal(backups, 1);
    const output = await fs.readFile(filename, 'utf8');
    assert.ok(output.includes('// backup body') && output.includes('<<<<<<<') && output.includes('>>>>>>>'));
    assert.ok(
      children.every((child) => child.exitCode !== null || child.signalCode !== null),
      'all attempted helper sessions terminated'
    );
  } finally {
    cp.spawn = originalSpawn;
    await fs.rm(directory, { recursive: true, force: true });
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
    if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
  }
});

test('ordinary Harmony validation callback registration does not disable pure config planning', async () => {
  const original = Object.getOwnPropertyDescriptor(ExtensionDataList, 'validateBeforePersistHook');
  let callbacks = 0;
  Object.defineProperty(ExtensionDataList, 'validateBeforePersistHook', {
    configurable: true,
    writable: true,
    value: () => {
      callbacks++;
      throw new Error('persistence hook must not run during config comparison');
    },
  });
  const priorFlag = process.env.BIT_RUST_CLIENT_VCS,
    priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  try {
    const result = await withRustSnapshotOperation(() =>
      tryRustComponentConfigMerge(merger(list({ value: 0 }), list({ value: 0 }), list({ value: 1 })), true)
    );
    assert.ok(result, 'normal Harmony DATA callback registration must retain native eligibility');
    assert.equal(callbacks, 0);
    Object.defineProperty(ExtensionDataList, 'validateBeforePersistHook', {
      configurable: true,
      get() {
        callbacks++;
        throw new Error('provider getter');
      },
    });
    assert.equal(
      await withRustSnapshotOperation(() =>
        tryRustComponentConfigMerge(merger(list({ value: 0 }), list({ value: 0 }), list({ value: 1 })), true)
      ),
      undefined
    );
    assert.equal(callbacks, 0, 'accessor callback rejected without invoking getter');
  } finally {
    if (original) Object.defineProperty(ExtensionDataList, 'validateBeforePersistHook', original);
    else delete ExtensionDataList.validateBeforePersistHook;
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
    if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
  }
});

test('JSONC peer-only and empty lifecycle arrays retain canonical backup and error phases', async () => {
  const fs = require('node:fs/promises'),
    os = require('node:os');
  const { ConfigMergerMain } = at('config-merger.main.runtime');
  const { WorkspaceConfig } = installed('@teambit/config');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-config-empty-test-')),
    filename = path.join(directory, 'workspace.jsonc'),
    body = '{ "peer-a": "1.0.0" }\n';
  const owner = Object.create(ConfigMergerMain.prototype);
  owner.logger = new Logger('qualification-config');
  const config = new WorkspaceConfig({}, filename);
  owner.config = { workspaceConfig: config };
  let backups = 0;
  config.backupConfigFile = async () => {
    backups++;
  };
  const priorFlag = process.env.BIT_RUST_CLIENT_VCS,
    priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  try {
    await fs.writeFile(filename, body);
    await withRustSnapshotOperation(() =>
      owner.writeWorkspaceJsoncWithConflicts({
        dependencies: [],
        peerDependencies: [{ name: 'peer-a', version: 'CONFLICT::1.0.0::2.0.0::' }],
      })
    );
    assert.equal(backups, 1);
    assert.ok((await fs.readFile(filename, 'utf8')).includes('<<<<<<<'));
    await fs.writeFile(filename, body);
    backups = 0;
    await assert.rejects(
      withRustSnapshotOperation(() =>
        owner.writeWorkspaceJsoncWithConflicts({ dependencies: [], peerDependencies: [] })
      ),
      /unable to generate conflict/
    );
    assert.equal(backups, 0, 'empty change fails before backup');
    assert.equal(await fs.readFile(filename, 'utf8'), body);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
    if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
  }
});

test('actual lane identity list retains native component config eligibility', async () => {
  const { Lane, Ref } = installed('@teambit/objects');
  const { ComponentID, ComponentIdList } = installed('@teambit/component-id');
  const lane = new Lane({
    name: 'incoming',
    scope: 'qualification',
    hash: '1'.repeat(40),
    components: [{ id: ComponentID.fromString('qualification/sibling'), head: new Ref('2'.repeat(40)) }],
    log: { date: '1700000000000' },
  });
  const current = list({ value: 0 }),
    base = list({ value: 0 }),
    other = list({ value: 1 });
  const value = new ComponentConfigMerger(
    'qualification/component',
    [],
    lane,
    current,
    base,
    other,
    'lane',
    'main',
    new Logger('qualification-config'),
    'manual'
  );
  assert.equal(
    Object.getPrototypeOf(value.otherLaneIdsStr),
    ComponentIdList.prototype,
    'real constructor carries list subclass into snapshot'
  );
  const priorFlag = process.env.BIT_RUST_CLIENT_VCS,
    priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  try {
    const result = await withRustSnapshotOperation(() => tryRustComponentConfigMerge(value, true));
    assert.ok(result, 'real lane list should send/accept Native config plan');
    assert.deepEqual(result.configMergeResult.getSuccessfullyMergedConfig()['qualification/aspect'], { value: 1 });
  } finally {
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
    if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
  }
});

test('native scope policy rescue preserves entry aliases, stale array appends, deletion and field order', async () => {
  const scopeAdapter = at('rust-scope-policy');
  const { MergingMain } = require(
    path.join(path.dirname(installed.resolve('@teambit/merging')), 'merging.main.runtime.js')
  );
  scopeAdapter.registerRustScopePolicy(MergingMain);
  const owner = Object.create(MergingMain.prototype),
    resolver = 'teambit.dependencies/dependency-resolver';
  ExtensionDataList.coreExtensionsNames.set(resolver, '');
  function fixture() {
    const kept = { name: 'kept', version: '2.0.0', force: false },
      deleted = { name: 'deleted', version: '-' },
      duplicate = { name: 'kept', version: '3.0.0' };
    const dependencies = [kept, deleted, duplicate],
      peerDependencies = [{ name: 'deleted-peer', version: '-' }],
      devDependencies = [];
    const policy = { dependencies, devDependencies, peerDependencies },
      config = { [resolver]: { policy } };
    const extension = new ExtensionDataEntry(
      undefined,
      undefined,
      resolver,
      {
        policy: {
          peerDependencies: { 'deleted-peer': '9.0.0', 'rescued-peer': '5.0.0' },
          dependencies: { deleted: '9.0.0', rescued: '4.0.0', kept: '9.0.0' },
          devDependencies: {},
          optionalDependencies: { optional: '8.0.0' },
        },
      },
      {}
    );
    return {
      extensions: new ExtensionDataList(extension),
      config,
      policy,
      dependencies,
      peerDependencies,
      kept,
      duplicate,
    };
  }
  const canonical = fixture(),
    native = fixture();
  owner.mergeScopeSpecificDepsPolicy(canonical.extensions, canonical.config);
  owner.filterDeletedDependenciesFromConfig(canonical.config);
  const priorFlag = process.env.BIT_RUST_CLIENT_VCS,
    priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  try {
    assert.equal(
      await withRustSnapshotOperation(() => scopeAdapter.tryRustScopePolicy(owner, native.extensions, native.config)),
      true
    );
    assert.deepEqual(native.config, canonical.config);
    assert.deepEqual(Object.keys(native.policy), Object.keys(canonical.policy));
    assert.notEqual(native.policy.dependencies, native.dependencies, 'filtered array replaces original');
    assert.equal(native.dependencies.length, 4, 'original alias sees rescued append before filtering');
    assert.equal(native.policy.dependencies[0], native.kept);
    assert.equal(native.policy.dependencies[1], native.duplicate);
    assert.equal(native.policy.dependencies[2], native.dependencies[3], 'rescued object shared with original array');
    assert.equal(native.policy.peerDependencies[0], native.peerDependencies[1]);
    assert.ok(!Object.hasOwn(native.policy, 'devDependencies'));
    let reads = 0;
    Object.defineProperty(owner, 'addScopePolicyToMergedArray', {
      configurable: true,
      get() {
        reads++;
        throw new Error('custom method getter');
      },
    });
    assert.equal(
      await withRustSnapshotOperation(() =>
        scopeAdapter.tryRustScopePolicy(owner, fixture().extensions, fixture().config)
      ),
      false
    );
    assert.equal(reads, 0);
  } finally {
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
    if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
  }
});

test('mutated initial handled-aspect list declines before helper work', async () => {
  const operation = at('rust-config-operation'),
    original = operation.requestRustConfig;
  let requests = 0;
  operation.requestRustConfig = async () => {
    requests++;
    throw new Error('unexpected request');
  };
  const value = merger(list({ a: 0 }), list({ a: 0 }), list({ a: 1 }));
  value.handledExtIds[0] = 'custom/skipped';
  const prior = process.env.BIT_RUST_CLIENT_VCS;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  try {
    assert.equal(await withRustSnapshotOperation(() => tryRustComponentConfigMerge(value, true)), undefined);
    assert.equal(requests, 0);
  } finally {
    operation.requestRustConfig = original;
    if (prior === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = prior;
  }
});

test('inherited scope policy array is left to canonical mutation without native requests', async () => {
  const scopeAdapter = at('rust-scope-policy'),
    operation = at('rust-config-operation');
  const { MergingMain } = require(
    path.join(path.dirname(installed.resolve('@teambit/merging')), 'merging.main.runtime.js')
  );
  scopeAdapter.registerRustScopePolicy(MergingMain);
  const owner = Object.create(MergingMain.prototype),
    resolver = 'teambit.dependencies/dependency-resolver',
    array = [];
  const prior = Object.getOwnPropertyDescriptor(Object.prototype, 'optionalDependencies'),
    request = operation.requestRustConfig,
    priorFlag = process.env.BIT_RUST_CLIENT_VCS;
  let requests = 0;
  Object.defineProperty(Object.prototype, 'optionalDependencies', { configurable: true, writable: true, value: array });
  operation.requestRustConfig = async () => {
    requests++;
    throw new Error('unexpected native request');
  };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  try {
    const extensions = new ExtensionDataList(
      new ExtensionDataEntry(
        undefined,
        undefined,
        resolver,
        { policy: { optionalDependencies: { rescued: '1.0.0' } } },
        {}
      )
    );
    const config = { [resolver]: { policy: {} } };
    assert.equal(
      await withRustSnapshotOperation(() => scopeAdapter.tryRustScopePolicy(owner, extensions, config)),
      false
    );
    assert.equal(requests, 0);
    owner.mergeScopeSpecificDepsPolicy(extensions, config);
    assert.equal(array.length, 1);
    assert.equal(Object.hasOwn(config[resolver].policy, 'optionalDependencies'), false);
  } finally {
    if (prior) Object.defineProperty(Object.prototype, 'optionalDependencies', prior);
    else delete Object.prototype.optionalDependencies;
    operation.requestRustConfig = request;
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
  }
});

test('nonwritable merger scratch declines before native work and retains canonical diagnostic phase', async () => {
  const operation = at('rust-config-operation'),
    request = operation.requestRustConfig;
  const priorFlag = process.env.BIT_RUST_CLIENT_VCS;
  let requests = 0;
  operation.requestRustConfig = async () => {
    requests++;
    throw new Error('unexpected native request');
  };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  try {
    for (const field of ['currentEnv', 'otherEnv', 'baseEnv']) {
      const value = merger(list({ a: 0 }), list({ a: 0 }), list({ a: 1 }));
      Object.defineProperty(value, field, { configurable: true, writable: false, value: undefined });
      assert.equal(await withRustSnapshotOperation(() => tryRustComponentConfigMerge(value, true)), undefined);
      assert.equal(requests, 0);
      const logs = [];
      value.logger = {
        debug(message) {
          logs.push(message);
        },
        trace() {},
      };
      assert.throws(() => value.merge(), TypeError);
      assert.equal(logs.length, 3);
      assert.match(logs[0], /merge/);
    }
  } finally {
    operation.requestRustConfig = request;
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
  }
});

test('conflict mutation at temporary-file await falls back before backup using the latest version', async () => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const { ConfigMergerMain } = at('config-merger.main.runtime');
  const operation = at('rust-config-operation');
  const { WorkspaceConfig } = installed('@teambit/config');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-config-conflict-mutation-'));
  const filename = path.join(directory, 'workspace.jsonc');
  const body = '{ "package-a": "1.0.0" }\n';
  const owner = Object.create(ConfigMergerMain.prototype);
  owner.logger = new Logger('qualification-config');
  const config = new WorkspaceConfig({}, filename);
  owner.config = { workspaceConfig: config };
  let backups = 0;
  config.backupConfigFile = async () => {
    backups++;
  };
  const originalRequest = operation.requestRustConfig;
  let plans = 0;
  operation.requestRustConfig = async (kind, ...args) => {
    if (kind === 'configWorkspaceConflictPlan') plans++;
    return originalRequest(kind, ...args);
  };
  const priorFlag = process.env.BIT_RUST_CLIENT_VCS;
  const priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  try {
    await fs.writeFile(filename, body);
    const conflicts = { dependencies: [{ name: 'package-a', version: 'CONFLICT::1.0.0::2.0.0::' }] };
    const pending = withRustSnapshotOperation(() => owner.writeWorkspaceJsoncWithConflicts(conflicts));
    conflicts.dependencies[0].version = 'CONFLICT::1.0.0::3.0.0::';
    await pending;
    const output = await fs.readFile(filename, 'utf8');
    assert.ok(output.includes('3.0.0'));
    assert.ok(!output.includes('2.0.0'));
    assert.equal(backups, 1);
    assert.equal(plans, 0, 'stale metadata declines before requesting a native plan');
  } finally {
    operation.requestRustConfig = originalRequest;
    await fs.rm(directory, { recursive: true, force: true });
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
    if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
  }
});

test('native aspect data preserves own undefined keys, equality and incoming aliases', async () => {
  const providerBase = path.dirname(installed.resolve('@teambit/merging'));
  const { MergeStatusProvider } = compiled
    ? require(path.join(providerBase, 'merge-status-provider.js'))
    : source('scopes/component/merging/merge-status-provider.ts');
  const priorFlag = process.env.BIT_RUST_CLIENT_VCS;
  const priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  const cases = [
    [{}, {}, { name: undefined }],
    [{ name: undefined }, {}, {}],
    [{ name: undefined }, { name: undefined }, { description: undefined }],
    [
      { name: undefined, description: undefined },
      { description: undefined, name: undefined },
      { name: undefined, description: undefined },
    ],
  ];
  try {
    for (const [currentData, baseData, otherData] of cases) {
      function inputs() {
        const current = list({}, { ...currentData });
        const base = list({}, { ...baseData });
        const other = list({}, { ...otherData });
        current[0].data = { id: 'teambit.harmony/node', name: undefined, description: undefined };
        base[0].data = { id: 'teambit.harmony/node' };
        other[0].data = { id: 'teambit.harmony/node' };
        return { current, base, other };
      }
      const canonical = inputs();
      const native = inputs();
      const expected = merger(canonical.current, canonical.base, canonical.other).merge();
      const expectedData = MergeStatusProvider.prototype.mergeExtensionsData.call(
        { options: { shouldMergeAspectsData: true } },
        canonical.current,
        canonical.base,
        canonical.other
      );
      const value = await withRustSnapshotOperation(() =>
        tryRustComponentConfigMerge(merger(native.current, native.base, native.other), true)
      );
      assert.ok(value, 'provider optional undefined metadata must remain native eligible');
      assert.deepEqual(value.configMergeResult, expected);
      assert.deepEqual(value.dataMergeResult, expectedData);
      assert.deepEqual(
        native.current.map((entry) => entry.data),
        canonical.current.map((entry) => entry.data)
      );
      if (canonical.current[1].data === canonical.other[1].data)
        assert.equal(native.current[1].data, native.other[1].data, 'incoming data alias survives projection');
    }
    assert.equal(
      await withRustSnapshotOperation(() =>
        tryRustComponentConfigMerge(merger(list({}, { nested: { name: undefined } }), list({}), list({})), true)
      ),
      undefined,
      'nested unsupported undefined metadata falls back'
    );
  } finally {
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
    if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
  }
});

test('resolver optional nested undefined metadata remains native without mutating original data', async () => {
  const resolverId = 'teambit.dependencies/dependency-resolver';
  const priorCore = ExtensionDataList.coreExtensionsNames.get(resolverId);
  ExtensionDataList.coreExtensionsNames.set(resolverId, '');
  const data = {
    dependencies: [{ id: 'package-a', version: '1.0.0', __type: 'package', lifecycle: 'runtime', optional: undefined }],
    policy: [
      { dependencyId: 'package-a', value: { version: '1.0.0', resolveFromEnv: undefined }, lifecycleType: 'runtime' },
    ],
    componentRangePrefix: undefined,
  };
  const current = list({});
  const base = list({});
  const other = list({});
  for (const entries of [current, base, other])
    entries.push(
      new ExtensionDataEntry(
        undefined,
        undefined,
        resolverId,
        { policy: { dependencies: { 'package-a': '^1.0.0' } } },
        data
      )
    );
  const expected = merger(current, base, other).merge();
  const priorFlag = process.env.BIT_RUST_CLIENT_VCS;
  const priorHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  try {
    const value = await withRustSnapshotOperation(() =>
      tryRustComponentConfigMerge(merger(current, base, other), true)
    );
    assert.ok(value, 'ordinary resolver nested optional metadata acknowledges native config');
    assert.deepEqual(value.configMergeResult, expected);
    assert.equal(current[2].data, data);
    assert.ok(Object.hasOwn(data.dependencies[0], 'optional'));
    assert.ok(Object.hasOwn(data.policy[0].value, 'resolveFromEnv'));
    let reads = 0;
    Object.defineProperty(data.dependencies[0], 'custom', {
      enumerable: true,
      get() {
        reads++;
        throw new Error('metadata hook');
      },
    });
    assert.equal(
      await withRustSnapshotOperation(() => tryRustComponentConfigMerge(merger(current, base, other), true)),
      undefined
    );
    assert.equal(reads, 0, 'nested accessor declines before invoking metadata hook');
  } finally {
    if (priorCore === undefined) ExtensionDataList.coreExtensionsNames.delete(resolverId);
    else ExtensionDataList.coreExtensionsNames.set(resolverId, priorCore);
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
    if (priorHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = priorHelper;
  }
});

test('sparse aspect array with a compensating own key falls back without confusing holes and null', async () => {
  const sparse = new Array(1);
  sparse.extra = 'metadata';
  const current = list({}, { values: sparse }),
    base = list({}, { values: [undefined] });
  const incoming = { values: [null] },
    other = list({}, incoming);
  const guards = at('rust-config-guards'),
    operation = at('rust-config-operation');
  assert.equal(guards.isRustConfigJson(sparse), false);
  assert.equal(guards.isRustConfigJson([null]), true);
  const original = operation.requestRustConfig,
    priorFlag = process.env.BIT_RUST_CLIENT_VCS;
  let requests = 0;
  operation.requestRustConfig = async () => {
    requests++;
    throw new Error('unexpected native request');
  };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  try {
    assert.equal(
      await withRustSnapshotOperation(() => tryRustComponentConfigMerge(merger(current, base, other), true)),
      undefined
    );
    assert.equal(requests, 0);
    const providerBase = path.dirname(installed.resolve('@teambit/merging'));
    const { MergeStatusProvider } = compiled
      ? require(path.join(providerBase, 'merge-status-provider.js'))
      : source('scopes/component/merging/merge-status-provider.ts');
    const result = MergeStatusProvider.prototype.mergeExtensionsData.call(
      { options: { shouldMergeAspectsData: true } },
      current,
      base,
      other
    );
    assert.deepEqual(result, { conflictedAspects: {} });
    assert.equal(
      current[1].data,
      incoming,
      'canonical lodash distinguishes undefined holes from null and adopts incoming data'
    );
  } finally {
    operation.requestRustConfig = original;
    if (priorFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = priorFlag;
  }
});
