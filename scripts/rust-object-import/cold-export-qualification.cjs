// Public export qualification against real disposable file scopes and HTTP routes.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const { sourceIdentity } = require('./artifacts/contract.cjs');
const { createTransferRemotes, writeTransferComponents, snapshotScope } = require('./transfer-fixture.cjs');
const { spawn, comparable, captureStorage } = require('./cold-inbound-qualification.cjs');

const sha = (value) => createHash('sha256').update(value).digest('hex');
const scenarios = [
  { name: 'staged-default', args: ['export'], native: true },
  { name: 'selected-id', args: ['export', 'qualification.alpha/alpha'], native: true },
  { name: 'short-id', args: ['export', 'alpha'], native: true },
  { name: 'origin-directly', args: ['export', '--origin-directly'], native: true },
  { name: 'json-fallback', args: ['export', '--origin-directly', '--json'], native: false },
  { name: 'missing-id', args: ['export', 'qualification.alpha/missing'], native: false, fails: true },
  { name: 'persist-failure', args: ['export', '--origin-directly'], native: true, fails: true, httpOnly: true },
  { name: 'two-staged-components', args: ['export'], native: true, setup: 'two-components' },
  { name: 'two-staged-scopes', args: ['export', '--origin-directly'], native: true, setup: 'two-scopes', multiScope: true },
  { name: 'validate-failure', args: ['export', '--origin-directly'], native: true, fails: true, httpOnly: true },
  { name: 'validate-failure-two-scopes', args: ['export', '--origin-directly'], native: true, fails: true, httpOnly: true, setup: 'two-scopes', multiScope: true },
  { name: 'persist-failure-second', args: ['export', '--origin-directly'], native: true, fails: true, httpOnly: true, setup: 'two-scopes', multiScope: true },
  { name: 'resume-after-persist-failure', args: ['export', '--origin-directly', '--resume'], native: false, httpOnly: true, setup: 'resumable' },
  { name: 'lane-export-fallback', args: ['export', '--origin-directly', '--json'], native: false, setup: 'lane' },
  ...(typeof process.getgid === 'function'
    ? [{ name: 'file-group-fallback', args: ['export', '--origin-directly'], native: false, fileOnly: true, setup: 'group' }]
    : []),
  { name: 'parented-followup', args: ['export'], native: true, setup: 'followup' },
];

const fingerprint = async (file) => ({ file, sha256: sha(await fs.readFile(file)) });
async function verifyPrivateMarker(cli, repository) {
  const marker = JSON.parse(await fs.readFile(path.join(cli, '.bit-object-import-build.json'), 'utf8'));
  assert.ok(Object.keys(marker.sourceSha256 || {}).length > 0, 'private CLI must bind source files');
  assert.ok((marker.compiledModules || []).length > 0, 'private CLI must bind compiled modules');
  for (const [name, digest] of Object.entries(marker.sourceSha256))
    assert.equal(sha(await fs.readFile(path.join(repository, name))), digest, `private CLI source ${name}`);
  for (const module of marker.compiledModules)
    assert.equal(
      sha(await fs.readFile(path.join(cli, 'node_modules/@teambit', module.path))),
      module.sha256,
      `private CLI compiled ${module.path}`
    );
  return {
    installedRevision: marker.installedRevision,
    integrationRevision: marker.integrationRevision,
    sourceCount: Object.keys(marker.sourceSha256).length,
    compiledCount: marker.compiledModules.length,
  };
}
async function fingerprintInputs(cli, helper, addon) {
  const repository = path.resolve(__dirname, '../..');
  const files = [
    path.join(cli, 'bin/bit.js'),
    path.join(cli, 'package.json'),
    helper,
    addon,
    path.join(cli, '.bit-object-import-build.json'),
    ...['run-bit', 'rust-workspace-outbound', 'rust-workspace-outbound-options', 'rust-workspace-outbound-report'].map(
      (name) => path.join(cli, 'node_modules/@teambit/bit/dist', `${name}.js`)
    ),
    path.join(cli, 'node_modules/@teambit/export/dist/export-cmd.js'),
    path.join(cli, 'node_modules/@teambit/export/dist/export.main.runtime.js'),
    path.join(cli, 'node_modules/@teambit/scope/dist/routes/put.route.js'),
    path.join(cli, 'node_modules/@teambit/scope/dist/routes/action.route.js'),
    ...[
      'run-bit.ts',
      'rust-workspace-outbound.ts',
      'rust-workspace-outbound-options.ts',
      'rust-workspace-outbound-report.ts',
    ].map((name) => path.join(repository, 'scopes/harmony/bit', name)),
    __filename,
    require.resolve('./cold-export-runtime.test.cjs'),
    require.resolve('./workspace-outbound-driver.test.cjs'),
    require.resolve('./transfer-fixture.cjs'),
    require.resolve('./transfer-http-fixture.cjs'),
    require.resolve('./transfer-determinism.cjs'),
    require.resolve('./checkout-transition-determinism.cjs'),
    require.resolve('./import-trace.cjs'),
    require.resolve('./artifacts/contract.cjs'),
  ];
  async function rustFiles(directory) {
    if (
      !(await fs.access(directory).then(
        () => true,
        () => false
      ))
    )
      return;
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await rustFiles(file);
      else if (entry.isFile() && entry.name.endsWith('.rs')) files.push(file);
    }
  }
  files.push(path.join(repository, 'native/client-transfer/Cargo.toml'));
  await rustFiles(path.join(repository, 'native/client-transfer/src'));
  const existing = [];
  for (const file of files)
    if (
      await fs.access(file).then(
        () => true,
        () => false
      )
    )
      existing.push(file);
  return Promise.all(existing.map(fingerprint));
}

function ipc(server, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.off('message', receive);
      reject(new Error('HTTP export fixture IPC timeout'));
    }, 15000);
    function receive(message) {
      if (!predicate(message)) return;
      clearTimeout(timer);
      server.off('message', receive);
      resolve(message);
    }
    server.on('message', receive);
  });
}

async function snapshot(cli, directory, workspace) {
  const state = await snapshotScope(directory, workspace);
  // The file inventory catches hidden temporary directories left by a failed
  // prepare, while decoded bodies prove object identity across compressors.
  if (!workspace) return state;
  const storage = await captureStorage(cli, directory, state);
  // Bit's package cache uses the cloned workspace's absolute path as a key.
  // Keep it in the raw artifact while comparing the tracked scope storage.
  storage.bitPaths = storage.bitPaths.filter((entry) => !/^(?:dir|file):cache(?:\/|$)/.test(entry));
  for (const name of Object.keys(storage.bitContents)) if (name.startsWith('cache/')) delete storage.bitContents[name];
  // Each paired file remote has a distinct disposable path. Preserve the
  // actual scope file in the raw artifact; compare its semantic host instead.
  delete storage.bitContents['scope.json'];
  const scopeConfig = JSON.parse(await fs.readFile(path.join(directory, '.bit/scope.json'), 'utf8'));
  scopeConfig.remotes = Object.fromEntries(
    Object.entries(scopeConfig.remotes || {}).map(([name, url]) => [
      name,
      url.startsWith('file://') ? 'file://<disposable-scope>' : url,
    ])
  );
  return { ...state, ...storage, scopeConfig };
}

async function snapshotRemote(directory) {
  const state = await snapshotScope(directory);
  const paths = [];
  const contents = {};
  const compressedObjects = {};
  const pendingHashes = {};
  const fileMetadata = {};
  async function walk(current, relative = '') {
    for (const entry of (await fs.readdir(current, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const name = path.posix.join(relative, entry.name);
      paths.push(`${entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other'}:${name}`);
      if (entry.isDirectory()) await walk(path.join(current, entry.name), name);
      else if (entry.isFile()) {
        const file = path.join(current, entry.name);
        const digest = sha(await fs.readFile(file));
        const stat = await fs.stat(file);
        fileMetadata[name] = {
          mode: stat.mode & 0o7777,
          ...(Number.isSafeInteger(stat.uid) ? { uid: stat.uid } : {}),
          ...(Number.isSafeInteger(stat.gid) ? { gid: stat.gid } : {}),
        };
        if (/^objects\/[a-f0-9]{2}\/[a-f0-9]{38}$/.test(name))
          compressedObjects[name.slice(8).replace('/', '')] = digest;
        else if (name.startsWith('pending-objects/')) pendingHashes[name] = digest;
        else if (name !== 'index.json') contents[name] = digest;
      }
    }
  }
  await walk(directory);
  return { ...state, storagePaths: paths, storageContents: contents, compressedObjects, pendingHashes, fileMetadata };
}

async function snapshotRemotes(remotes) {
  return Object.fromEntries(
    await Promise.all(Object.entries(remotes).map(async ([name, directory]) => [name, await snapshotRemote(directory)]))
  );
}

function remoteEventsByScope(events) {
  const byScope = {};
  for (const event of events) (byScope[event.scope] ||= []).push(event);
  return byScope;
}

function remoteActions(events) {
  return Object.fromEntries(
    Object.entries(remoteEventsByScope(events)).map(([scope, rows]) => [
      scope,
      rows.map((event) => (event.operation === 'action' ? event.name : event.operation)),
    ])
  );
}

async function stageExportProducer(cli, directory, remotes, command, extraFiles = 0) {
  const run = async (args) => {
    const result = await command(directory, args);
    assert.equal(result.code, 0, `${args.join(' ')}: ${result.stderr || result.stdout}`);
  };
  await fs.mkdir(directory);
  await run(['init', '--skip-interactive', '--default-scope', 'qualification.alpha']);
  const scopeFile = path.join(directory, '.bit/scope.json');
  const scope = JSON.parse(await fs.readFile(scopeFile, 'utf8'));
  scope.name = 'qualification.workspace';
  scope.remotes = remotes;
  await fs.writeFile(scopeFile, JSON.stringify(scope));
  await writeTransferComponents(directory, extraFiles);
  await fs.rm(path.join(directory, 'beta'), { recursive: true });
  await run(['add', 'alpha', '--id', 'alpha', '--main', 'index.js']);
  await run(['tag', '--ver', '1.0.0', '--soft', '--message', 'initial', '--skip-auto-tag', '--ignore-issues', '*']);
  await run(['tag', '--persist=skip-build', '--disable-tag-pipeline', '--ignore-issues', '*']);
}

async function cloneExportScenario(producer, directory, scenario, remotes, command) {
  await fs.cp(producer, directory, { recursive: true, verbatimSymlinks: true });
  const scopeFile = path.join(directory, '.bit/scope.json');
  const scope = JSON.parse(await fs.readFile(scopeFile, 'utf8'));
  scope.remotes = remotes;
  await fs.writeFile(scopeFile, JSON.stringify(scope));
  const run = async (args) => {
    const result = await command(directory, args);
    assert.equal(result.code, 0, `${args.join(' ')}: ${result.stderr || result.stdout}`);
  };
  if (scenario.setup === 'two-components' || scenario.setup === 'two-scopes') {
    await fs.mkdir(path.join(directory, 'sibling'));
    await fs.writeFile(path.join(directory, 'sibling/index.js'), 'exports.sibling = true;\n');
    await run(['add', 'sibling', '--id', 'sibling', '--main', 'index.js']);
    if (scenario.setup === 'two-scopes') await run(['scope', 'set', 'qualification.beta', 'sibling']);
    await run([
      'tag',
      'sibling',
      '--ver',
      '1.0.0',
      '--soft',
      '--message',
      'sibling',
      '--skip-auto-tag',
      '--ignore-issues',
      '*',
    ]);
    await run(['tag', 'sibling', '--persist=skip-build', '--disable-tag-pipeline', '--ignore-issues', '*']);
  } else if (scenario.setup === 'followup') {
    await run(['export', '--origin-directly']);
    await fs.writeFile(path.join(directory, 'alpha/index.js'), '\ufeffexports.value = "alpha:followup";\r\n');
    await run([
      'tag',
      'alpha',
      '--ver',
      '1.1.0',
      '--soft',
      '--message',
      'followup',
      '--skip-auto-tag',
      '--ignore-issues',
      '*',
    ]);
    await run(['tag', 'alpha', '--persist=skip-build', '--disable-tag-pipeline', '--ignore-issues', '*']);
  } else if (scenario.setup === 'lane') {
    await run(['export', '--origin-directly']);
    await run(['lane', 'create', 'feature', '--scope', 'qualification.alpha']);
    await fs.writeFile(path.join(directory, 'alpha/index.js'), 'exports.value = "alpha:lane";\n');
    await run(['snap', '--message', 'lane', '--skip-auto-snap', '--disable-snap-pipeline', '--ignore-issues', '*']);
  }
}

async function run(cli, helper, reportFile, options = {}) {
  cli = path.resolve(cli);
  helper = path.resolve(helper);
  const addon = path.resolve(options.addon || path.join(path.dirname(helper), 'bit-workspace.node'));
  assert.ok(
    Number.isSafeInteger(options.extraFiles ?? 0) &&
      (options.extraFiles ?? 0) >= 0 &&
      (options.extraFiles ?? 0) <= 2048,
    'extraFiles must be 0..2048'
  );
  const selected = options.scenarios
    ? scenarios.filter((scenario) => options.scenarios.includes(scenario.name))
    : scenarios;
  assert.equal(selected.length, options.scenarios?.length || scenarios.length, 'unknown or repeated export scenario');
  const transports = options.transports || ['file', 'http'];
  const modes = options.modes || ['node', 'native', 'missing-helper', 'crashed-helper'];
  if (modes.includes('native')) {
    await fs.access(helper);
    await fs.access(addon);
  }
  const temporary = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-cold-export-'));
  const globals = benchmarkGlobals(temporary);
  const originalEnv = { ...process.env };
  const repository = path.resolve(__dirname, '../..');
  const marker = options.verifyMarker ? await verifyPrivateMarker(cli, repository) : undefined;
  const fingerprints = await fingerprintInputs(cli, helper, addon);
  const nativeSourceSha256 = sourceIdentity(repository);
  const command = (directory, args, mode = 'node', trace) => {
    const env = {
      ...originalEnv,
      CI: '1',
      BIT_GLOBALS_DIR: globals,
      BIT_RUST_CLIENT_VCS: mode === 'node' ? 'off' : 'on',
      BIT_RUST_OBJECT_IMPORT:
        mode === 'missing-helper'
          ? path.join(temporary, 'missing-helper')
          : mode === 'crashed-helper'
            ? process.execPath
            : helper,
      BIT_TEST_WORKSPACE_ADDON: addon,
      BIT_SNAPSHOT_QUALIFICATION_SEED: sha(args.join('\0')),
      BIT_SNAPSHOT_QUALIFICATION_CLOCK: '1800000000000',
      BIT_CHECKOUT_TRANSITION_QUALIFICATION_SEED: sha(args.join('\0')),
      BIT_CHECKOUT_TRANSITION_QUALIFICATION_CLOCK: '1800000000000',
      BIT_CHECKOUT_TRANSITION_DISPLAY_DURATION: 'deterministic',
    };
    delete env.NODE_OPTIONS;
    delete env.BIT_IMPORT_TRACE;
    if (trace) env.BIT_IMPORT_TRACE = trace;
    return spawn(cli, directory, args, env, trace);
  };
  let server;
  const report = {
    qualified: false,
    cli,
    helper,
    addon,
    temporary,
    extraFiles: options.extraFiles || 0,
    fingerprints,
    marker,
    nativeSourceSha256,
    scenarios: selected.map((s) => s.name),
    runs: [],
  };
  const expected = new Map();
  try {
    const producer = path.join(temporary, 'producer');
    const baseRemotes = await createTransferRemotes(cli, path.join(temporary, 'seed-remotes'));
    await stageExportProducer(
      cli,
      producer,
      Object.fromEntries(Object.entries(baseRemotes).map(([name, target]) => [name, `file://${target}`])),
      command,
      options.extraFiles || 0
    );
    const staged = await snapshot(cli, producer, true);
    assert.equal(Object.keys(staged.objects).length > 0, true, 'producer must contain staged objects');
    let httpRemotes;
    if (transports.includes('http')) {
      server = cp.fork(
        path.join(__dirname, 'transfer-http-fixture.cjs'),
        [cli, JSON.stringify(Object.keys(baseRemotes))],
        {
          env: { ...process.env, BIT_GLOBALS_DIR: globals },
          stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        }
      );
      httpRemotes = (await ipc(server, (value) => value.remotes)).remotes;
    }
    for (const transport of transports) {
      for (const mode of modes) {
        for (const scenario of selected) {
          if ((scenario.httpOnly && transport !== 'http') || (scenario.fileOnly && transport !== 'file')) continue;
          const directory = path.join(temporary, `${transport}-${mode}-${scenario.name}`);
          const activeRemotes = path.join(temporary, `${transport}-active-remotes`);
          await fs.rm(activeRemotes, { recursive: true, force: true });
          const remotes = await createTransferRemotes(cli, activeRemotes);
          if (scenario.setup === 'group') {
            const groupName = cp.execFileSync('id', ['-gn'], { encoding: 'utf8' }).trim();
            assert.ok(groupName, 'file group fixture requires the current group name');
            const scopeFile = path.join(remotes['qualification.alpha'], 'scope.json');
            const scopeConfig = JSON.parse(await fs.readFile(scopeFile, 'utf8'));
            scopeConfig.groupName = groupName;
            await fs.writeFile(scopeFile, JSON.stringify(scopeConfig));
          }
          const urls =
            transport === 'http'
              ? httpRemotes
              : Object.fromEntries(Object.entries(remotes).map(([name, target]) => [name, `file://${target}`]));
          if (server && transport === 'http') {
            const ready = ipc(server, (value) => value.configured);
            server.send({
              configure: Object.fromEntries(
                Object.entries(remotes).map(([name, target]) => [
                  name,
                  {
                    path: target,
                    failPersist:
                      (scenario.name === 'persist-failure' && name === 'qualification.alpha') ||
                      (scenario.name === 'resume-after-persist-failure' && name === 'qualification.alpha') ||
                      (scenario.name === 'persist-failure-second' && name === 'qualification.beta'),
                    failValidate:
                      ['validate-failure', 'validate-failure-two-scopes'].includes(scenario.name) &&
                      name === 'qualification.alpha',
                  },
                ])
              ),
            });
            await ready;
          }
          await cloneExportScenario(producer, directory, scenario, urls, command);
          let args = scenario.args;
          let setupResult;
          if (scenario.setup === 'resumable') {
            setupResult = await command(directory, ['export', '--origin-directly'], 'node');
            assert.notEqual(setupResult.code, 0, 'resumable fixture must fail its first persist');
            const pending = await snapshotRemote(remotes['qualification.alpha']);
            const exportIds = new Set(Object.keys(pending.pending).map((name) => name.split('/')[0]));
            assert.equal(exportIds.size, 1, 'resumable fixture must retain one export ID');
            args = [...scenario.args, ...exportIds];
            const ready = ipc(server, (value) => value.configured);
            server.send({
              configure: Object.fromEntries(Object.entries(remotes).map(([name, target]) => [name, { path: target }])),
            });
            await ready;
          }
          const before = {
            local: await snapshot(cli, directory, true),
            remotes: await snapshotRemotes(remotes),
          };
          const trace = mode === 'native' ? path.join(directory, 'export-trace.json') : undefined;
          const result = await command(directory, args, mode, trace);
          assert.equal(result.signal, null, `${transport}/${mode}/${scenario.name}: signal`);
          assert.equal(
            result.code === 0,
            !scenario.fails,
            `${transport}/${mode}/${scenario.name}: ${result.stderr || result.stdout}`
          );
          let diagnostics;
          if (trace) {
            diagnostics = JSON.parse(await fs.readFile(trace, 'utf8'));
            if (scenario.native) {
              for (const kind of ['commandOutboundPrepare', 'commandOutboundApply']) {
                assert.equal(diagnostics.workspace[kind].frames, 1, `${scenario.name}: ${kind} must be Rust-owned`);
                if (kind === 'commandOutboundPrepare' || !scenario.fails)
                  assert.ok(diagnostics.workspace[kind].completed > 0, `${scenario.name}: ${kind} must complete`);
                assert.equal(
                  diagnostics.workspace[kind].sourceBodyBytes,
                  0,
                  `${scenario.name}: no object bodies in Node`
                );
              }
              assert.equal(
                diagnostics.workspace.commandOutboundFinalize.frames,
                scenario.fails ? 0 : 1,
                `${scenario.name}: finalize only after remote persistence`
              );
              const outboundFrames = diagnostics.workspaceFrames.filter((frame) =>
                /^commandOutbound/.test(frame.kind || '')
              );
              assert.equal(
                new Set(outboundFrames.map((frame) => frame.helperId)).size,
                1,
                'single retained Rust helper'
              );
            } else if (['json-fallback', 'lane-export-fallback'].includes(scenario.name)) {
              assert.equal(
                diagnostics.workspace.commandOutboundPrepare.frames,
                0,
                'unsupported option must use canonical export'
              );
            } else if (scenario.name === 'file-group-fallback') {
              assert.equal(diagnostics.workspace.commandOutboundPrepare.frames, 1, 'group scope must reach native preflight');
              assert.equal(diagnostics.workspace.commandOutboundApply.frames, 0, 'group scope must decline before transfer');
            }
          }
          const after = {
            local: await snapshot(cli, directory, true),
            remotes: await snapshotRemotes(remotes),
          };
          const alpha = after.remotes['qualification.alpha'];
          const beta = after.remotes['qualification.beta'];
          if (!scenario.multiScope) {
            assert.equal(beta.index, null, 'unselected remote must remain empty');
            assert.deepEqual(beta.objects, {}, 'unselected remote must receive no objects');
          }
          if (!scenario.fails) {
            assert.ok(Object.keys(alpha.objects).length > 0, 'selected remote must receive object closure');
            assert.ok(alpha.index, 'selected remote must persist index');
            if (scenario.multiScope) {
              assert.ok(Object.keys(beta.objects).length > 0, 'second remote must receive object closure');
              assert.ok(beta.index, 'second remote must persist index');
            }
          }
          if (scenario.name === 'missing-id') {
            assert.deepEqual(after.local, before.local, 'failed prepare must preserve source workspace');
            assert.deepEqual(after.remotes, before.remotes, 'failed prepare must preserve remotes');
          }
          if (scenario.name === 'persist-failure') {
            assert.equal(after.local.bitmap, before.local.bitmap, 'failed persist must not publish bitmap');
            assert.equal(after.local.index, before.local.index, 'failed persist must not advance local index');
            assert.equal(alpha.index, before.remotes['qualification.alpha'].index, 'failed persist must not publish remote index');
            assert.ok(
              Object.keys(alpha.pending).length > 0,
              'failed persist must retain canonical pending objects'
            );
          }
          if (['validate-failure', 'validate-failure-two-scopes'].includes(scenario.name)) {
            assert.equal(after.local.bitmap, before.local.bitmap, 'failed validation must not publish bitmap');
            assert.equal(alpha.index, before.remotes['qualification.alpha'].index, 'failed validation must not publish index');
            assert.deepEqual(alpha.pending, {}, 'validation cleanup must remove pending objects');
            if (scenario.multiScope) {
              assert.equal(beta.index, before.remotes['qualification.beta'].index, 'failed validation must not publish second index');
              assert.deepEqual(beta.pending, {}, 'validation cleanup must remove second pending objects');
            }
          }
          if (scenario.name === 'persist-failure-second') {
            assert.equal(after.local.bitmap, before.local.bitmap, 'partial persist must not publish bitmap');
            assert.ok(alpha.index, 'first remote must be committed before partial failure');
            assert.deepEqual(alpha.pending, {}, 'committed remote must have no pending objects');
            assert.equal(beta.index, before.remotes['qualification.beta'].index, 'failing remote must not publish index');
            assert.ok(Object.keys(beta.pending).length > 0, 'failing remote must retain resumable objects');
          }
          if (scenario.name === 'resume-after-persist-failure') {
            assert.ok(Object.keys(before.remotes['qualification.alpha'].pending).length > 0, 'resume must start with pending objects');
            assert.deepEqual(alpha.pending, {}, 'resume must clear pending objects after persistence');
          }
          let events;
          if (server && transport === 'http') {
            const received = ipc(server, (value) => value.events);
            server.send({ events: true });
            events = (await received).events;
            if (!scenario.fails) {
              const cycle = scenario.setup === 'resumable' ? ['ExportValidate', 'ExportPersist'] : ['put', 'ExportValidate', 'ExportPersist'];
              const expectedCycle =
                scenario.setup === 'lane'
                  ? [...cycle, 'fetch', ...cycle]
                  : scenario.setup === 'followup'
                    ? [...cycle, ...cycle]
                    : cycle;
              const actions = remoteActions(events);
              assert.deepEqual(actions['qualification.alpha'], expectedCycle);
              if (scenario.multiScope) assert.deepEqual(actions['qualification.beta'], cycle);
              else assert.equal(actions['qualification.beta'], undefined, 'unselected scope receives no request');
            }
            if (scenario.name === 'persist-failure') {
              const operations = remoteActions(events)['qualification.alpha'];
              assert.deepEqual(operations.slice(0, 3), ['put', 'ExportValidate', 'ExportPersist']);
              assert.ok(
                operations.slice(3).every((operation) => operation === 'ExportPersist'),
                'only persist may retry'
              );
            }
            if (['validate-failure', 'validate-failure-two-scopes'].includes(scenario.name)) {
              const actions = remoteActions(events);
              assert.deepEqual(actions['qualification.alpha'], ['put', 'ExportValidate', 'RemovePendingDir']);
              if (scenario.multiScope)
                assert.deepEqual(actions['qualification.beta'], ['put', 'ExportValidate', 'RemovePendingDir']);
            }
            if (scenario.name === 'persist-failure-second') {
              const actions = remoteActions(events);
              assert.deepEqual(actions['qualification.alpha'], ['put', 'ExportValidate', 'ExportPersist']);
              assert.deepEqual(actions['qualification.beta'].slice(0, 3), ['put', 'ExportValidate', 'ExportPersist']);
              assert.ok(actions['qualification.beta'].slice(3).every((action) => action === 'ExportPersist'));
            }
          }
          let recovery;
          if (scenario.name === 'persist-failure-second') {
            const exportIds = new Set(Object.keys(beta.pending).map((name) => name.split('/')[0]));
            assert.equal(exportIds.size, 1, 'partial failure must leave one resumable export ID');
            const ready = ipc(server, (value) => value.configured);
            server.send({
              configure: Object.fromEntries(Object.entries(remotes).map(([name, target]) => [name, { path: target }])),
            });
            await ready;
            const resume = await command(directory, ['export', '--origin-directly', '--resume', ...exportIds], 'node');
            assert.equal(resume.code, 0, `canonical resume after ${mode} partial failure: ${resume.stderr || resume.stdout}`);
            const resumed = {
              local: await snapshot(cli, directory, true),
              remotes: await snapshotRemotes(remotes),
            };
            assert.deepEqual(
              resumed.remotes['qualification.alpha'],
              alpha,
              'resume must retain already-persisted first remote'
            );
            assert.deepEqual(
              resumed.remotes['qualification.beta'].pending,
              {},
              'resume must clear second remote pending objects'
            );
            assert.ok(resumed.remotes['qualification.beta'].index, 'resume must persist second remote index');
            const received = ipc(server, (value) => value.events);
            server.send({ events: true });
            recovery = { after: resumed, result: resume, events: (await received).events };
          }
          // Failure stacks include implementation frames, while the first
          // diagnostic line and complete exit/state remain public behavior.
          const state = comparable({
            before,
            after,
            code: result.code,
            stdout: result.stdout,
            stderr: scenario.fails ? result.stderr.split('\n')[0] : result.stderr,
            events: events && (scenario.multiScope ? remoteEventsByScope(events) : events),
            recovery: recovery && {
              after: recovery.after,
              code: recovery.result.code,
              stdout: recovery.result.stdout,
              stderr: recovery.result.stderr,
              events: remoteEventsByScope(recovery.events),
            },
          });
          const key = `${transport}/${scenario.name}`;
          if (mode === 'node') expected.set(key, state);
          else
            assert.deepEqual(
              state,
              expected.get(key),
              `${transport}/${mode}/${scenario.name}: canonical export parity`
            );
          const artifact = path.join(directory, 'qualification-state.json');
          await fs.writeFile(
            artifact,
            JSON.stringify({ state, raw: { before, after, setupResult, result, events, recovery }, diagnostics }, null, 2)
          );
          report.runs.push({
            transport,
            mode,
            scenario: scenario.name,
            artifact,
            sha256: sha(await fs.readFile(artifact)),
          });
          await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
        }
      }
    }
    assert.deepEqual(await fingerprintInputs(cli, helper, addon), fingerprints, 'export qualification inputs changed');
    if (options.verifyMarker) assert.deepEqual(await verifyPrivateMarker(cli, repository), marker);
    assert.equal(sourceIdentity(repository), nativeSourceSha256, 'native sources changed');
    for (const row of report.runs)
      assert.equal(
        sha(await fs.readFile(row.artifact)),
        row.sha256,
        `${row.transport}/${row.mode}/${row.scenario} state changed`
      );
    report.qualified = selected.length === scenarios.length && modes.length === 4 && transports.length === 2;
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    return report;
  } finally {
    server?.disconnect();
  }
}

if (require.main === module) {
  const [cli, helper, report] = process.argv.slice(2);
  run(cli, helper, report, {
    addon: process.env.BIT_EXPORT_QUALIFICATION_ADDON,
    extraFiles: Number(process.env.BIT_EXPORT_QUALIFICATION_EXTRA_FILES || 0),
    verifyMarker: process.env.BIT_EXPORT_VERIFY_MARKER === '1',
  })
    .then((value) => console.log(JSON.stringify({ qualified: value.qualified, runs: value.runs.length, report })))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
module.exports = {
  run,
  scenarios,
  stageExportProducer,
  cloneExportScenario,
  snapshot,
  snapshotRemote,
  verifyPrivateMarker,
};
