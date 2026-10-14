// Real public fetch/import commands against disposable file and HTTP scopes.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const { createTransferRemotes, writeTransferComponents, snapshotScope } = require('./transfer-fixture.cjs');

const sha = (value) => createHash('sha256').update(value).digest('hex');
const fingerprint = async (file) => ({ file, sha256: sha(await fs.readFile(file)) });
const scenarios = [
  { name: 'fetch-selected', args: ['fetch', 'qualification.alpha/alpha@1.0.0', '--components'], fresh: true },
  {
    name: 'fetch-reversed-scopes',
    args: ['fetch', 'qualification.beta/beta@1.0.0', 'qualification.alpha/alpha@1.0.0', '--components'],
    fresh: true,
  },
  {
    name: 'fetch-all-history',
    args: ['fetch', 'qualification.alpha/alpha@1.0.0', '--components', '--all-history'],
    fresh: true,
  },
  { name: 'fetch-default', args: ['fetch', '--components'], fresh: false },
  { name: 'import-objects-selected', args: ['import', 'qualification.alpha/alpha@1.0.0', '--objects'], fresh: true },
  {
    name: 'import-objects-all-history',
    args: ['import', 'qualification.alpha/alpha@1.0.0', '--objects', '--all-history'],
    fresh: true,
  },
  { name: 'import-default', args: ['import'], fresh: false },
  {
    name: 'import-workspace',
    args: ['import', 'qualification.alpha/alpha@1.0.0', '--skip-dependency-installation'],
    fresh: true,
    writesFiles: true,
  },
];

function comparable(value, key) {
  // Canonical Node recompresses some imported objects while Rust retains the
  // verified remote stream. The object hash and inflated body prove equality;
  // keep compressed SHA-256 values in raw artifacts for inspection.
  if (key === 'compressedObjects') return Object.keys(value).sort();
  if (key === 'index' && typeof value === 'string') {
    const index = JSON.parse(value);
    for (const field of ['components', 'lanes'])
      if (Array.isArray(index[field])) index[field].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return index;
  }
  if (Array.isArray(value)) return value.map((row) => comparable(row));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([name, row]) => [name, comparable(row, name)]));
  return value;
}

/** Retain compressed storage and permission bits beside decoded object/file bodies. */
async function captureStorage(cli, directory, state) {
  const compressedObjects = {};
  const bitPaths = [];
  const bitContents = {};
  async function inventory(current, relative = '') {
    for (const entry of (await fs.readdir(current, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const name = path.posix.join(relative, entry.name);
      bitPaths.push(`${entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other'}:${name}`);
      if (entry.isDirectory()) await inventory(path.join(current, entry.name), name);
      else if (entry.isFile() && !name.startsWith('objects/') && !['command-history', 'index.json'].includes(name))
        bitContents[name] = sha(await fs.readFile(path.join(current, entry.name)));
    }
  }
  await inventory(path.join(directory, '.bit'));
  const objects = path.join(directory, '.bit/objects');
  for (const shard of (await fs.readdir(objects)).sort()) {
    if (!/^[a-f\d]{2}$/.test(shard)) continue;
    for (const suffix of (await fs.readdir(path.join(objects, shard))).sort()) {
      if (!/^[a-f\d]{38}$/.test(suffix)) continue;
      compressedObjects[shard + suffix] = sha(await fs.readFile(path.join(objects, shard, suffix)));
    }
  }
  const fileModes = {};
  if (state.bitmap) {
    const parse = createRequire(path.join(cli, 'package.json'))('comment-json').parse;
    const bitmap = parse(state.bitmap);
    for (const [id, row] of Object.entries(bitmap)) {
      if (!row?.rootDir) continue;
      const root = path.resolve(directory, row.rootDir);
      assert.ok(root.startsWith(directory + path.sep), 'component files must stay in workspace');
      const modes = {};
      async function walk(current, relative = '') {
        for (const entry of (await fs.readdir(current, { withFileTypes: true })).sort((a, b) =>
          a.name.localeCompare(b.name)
        )) {
          const name = path.join(relative, entry.name);
          const filename = path.join(current, entry.name);
          if (entry.isDirectory()) await walk(filename, name);
          else modes[name] = (await fs.stat(filename)).mode & 0o777;
        }
      }
      await walk(root);
      fileModes[id] = modes;
    }
  }
  return { compressedObjects, fileModes, bitPaths, bitContents };
}

function spawn(cli, directory, args, env, trace) {
  return new Promise((resolve, reject) => {
    const started = process.hrtime.bigint();
    const argv = [
      '--require',
      path.join(__dirname, 'checkout-transition-determinism.cjs'),
      '--require',
      path.join(__dirname, 'transfer-determinism.cjs'),
      ...(trace ? ['--require', path.join(__dirname, 'import-trace.cjs')] : []),
      path.join(cli, 'bin/bit.js'),
      ...args,
    ];
    const child = cp.spawn(process.execPath, argv, { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '',
      stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
    child.stdout.on('data', (bytes) => {
      stdout += bytes;
    });
    child.stderr.on('data', (bytes) => {
      stderr += bytes;
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, wallMs: Number(process.hrtime.bigint() - started) / 1e6 });
    });
  });
}

async function scopeRemotes(directory, remotes) {
  const file = path.join(directory, '.bit/scope.json');
  const scope = JSON.parse(await fs.readFile(file, 'utf8'));
  scope.name = 'qualification.workspace';
  scope.remotes = remotes;
  await fs.writeFile(file, JSON.stringify(scope));
  const workspace = path.join(directory, 'workspace.jsonc');
  await fs.writeFile(
    workspace,
    (await fs.readFile(workspace, 'utf8')).replace(/"name": "[^"]*"/, '"name": "inbound-qualification"')
  );
  await fs.writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: 'inbound-qualification', private: true })
  );
}

/** Restore an identical cold inbound workspace for each paired command. */
async function cloneInboundScenario(producer, directory, scenario, remotes, command) {
  if (scenario.fresh) {
    await fs.mkdir(directory);
    const initResult = await command(directory, [
      'init',
      '--skip-interactive',
      '--default-scope',
      'qualification.alpha',
    ]);
    assert.equal(initResult.code, 0, initResult.stderr || initResult.stdout);
  } else {
    await fs.cp(producer, directory, { recursive: true, verbatimSymlinks: true });
    await fs.rm(path.join(directory, '.bit/objects'), { recursive: true, force: true });
    await fs.mkdir(path.join(directory, '.bit/objects'), { recursive: true });
    await fs.rm(path.join(directory, '.bit/index.json'), { force: true });
  }
  await scopeRemotes(directory, remotes);
  return snapshotScope(directory, true);
}

async function run(cli, helper, reportFile, options = {}) {
  cli = path.resolve(cli);
  helper = path.resolve(helper);
  assert.ok(
    Number.isSafeInteger(options.extraFiles ?? 0) && (options.extraFiles ?? 0) >= 0 && (options.extraFiles ?? 0) <= 2048
  );
  const selected = options.scenarios
    ? scenarios.filter((scenario) => options.scenarios.includes(scenario.name))
    : scenarios;
  assert.equal(selected.length, options.scenarios?.length || scenarios.length, 'unknown or duplicate inbound scenario');
  const temporary = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-cold-inbound-'));
  const globals = benchmarkGlobals(temporary);
  const paths = await createTransferRemotes(cli, path.join(temporary, 'remotes'));
  const fileRemotes = Object.fromEntries(Object.entries(paths).map(([name, target]) => [name, `file://${target}`]));
  const modes = options.modes || ['node', 'native', 'missing-helper', 'crashed-helper'];
  const transports = options.transports || ['file', 'http'];
  const addon = options.addon || path.join(path.dirname(helper), 'bit-workspace.node');
  const addonPresent = await fs.access(addon).then(
    () => true,
    () => false
  );
  if (modes.includes('native')) assert.ok(addonPresent, 'native addon required for ownership proof');
  const fingerprintFiles = [
    path.join(cli, 'bin/bit.js'),
    path.join(cli, 'package.json'),
    helper,
    ...(addonPresent ? [addon] : []),
    ...['run-bit', 'rust-workspace-inbound', 'rust-workspace-inbound-options', 'rust-workspace-inbound-report'].map(
      (name) => path.join(cli, 'node_modules/@teambit/bit/dist', `${name}.js`)
    ),
    ...['fetch-cmd', 'import.cmd'].map((name) => path.join(cli, 'node_modules/@teambit/importer/dist', `${name}.js`)),
    __filename,
    require.resolve('./transfer-fixture.cjs'),
    require.resolve('./transfer-http-fixture.cjs'),
    require.resolve('./import-trace.cjs'),
    require.resolve('./checkout-transition-determinism.cjs'),
    require.resolve('./transfer-determinism.cjs'),
  ];
  const fingerprints = await Promise.all(fingerprintFiles.map(fingerprint));
  const runCommand = async (directory, args, mode = 'node', trace) => {
    const env = {
      ...process.env,
      BIT_GLOBALS_DIR: globals,
      CI: '1',
      BIT_RUST_CLIENT_VCS: mode === 'node' ? 'off' : 'on',
      BIT_RUST_OBJECT_IMPORT:
        mode === 'missing-helper'
          ? path.join(temporary, 'missing-helper')
          : mode === 'crashed-helper'
            ? process.execPath
            : helper,
      BIT_TEST_WORKSPACE_ADDON: addonPresent ? addon : undefined,
      BIT_SNAPSHOT_QUALIFICATION_SEED: sha(args.join('\0')),
      BIT_SNAPSHOT_QUALIFICATION_CLOCK: '1800000000000',
      BIT_CHECKOUT_TRANSITION_QUALIFICATION_SEED: sha(args.join('\0')),
      BIT_CHECKOUT_TRANSITION_QUALIFICATION_CLOCK: '1800000000000',
      BIT_CHECKOUT_TRANSITION_DISPLAY_DURATION: 'deterministic',
    };
    delete env.BIT_IMPORT_TRACE;
    delete env.NODE_OPTIONS;
    if (trace) env.BIT_IMPORT_TRACE = trace;
    return spawn(cli, directory, args, env, trace);
  };
  let server;
  try {
    const producer = path.join(temporary, 'producer');
    await fs.mkdir(producer);
    const init = await runCommand(producer, ['init', '--skip-interactive', '--default-scope', 'qualification.alpha']);
    assert.equal(init.code, 0, init.stderr || init.stdout);
    await scopeRemotes(producer, fileRemotes);
    await writeTransferComponents(producer, options.extraFiles ?? 0);
    await fs.writeFile(path.join(producer, 'alpha/run.sh'), '#!/bin/sh\nprintf "inbound fixture\\n"\n');
    await fs.chmod(path.join(producer, 'alpha/run.sh'), 0o755);
    for (const name of ['alpha', 'beta']) {
      const result = await runCommand(producer, ['add', name, '--id', name, '--main', 'index.js']);
      assert.equal(result.code, 0, result.stderr || result.stdout);
    }
    const scopeSet = await runCommand(producer, ['scope', 'set', 'qualification.beta', 'beta']);
    assert.equal(scopeSet.code, 0, scopeSet.stderr || scopeSet.stdout);
    for (const args of [
      ['tag', '--ver', '1.0.0', '--soft', '--message', 'initial', '--skip-auto-tag', '--ignore-issues', '*'],
      ['tag', '--persist=skip-build', '--disable-tag-pipeline', '--ignore-issues', '*'],
      ['export', '--origin-directly', '--json'],
    ]) {
      const result = await runCommand(producer, args);
      assert.equal(result.code, 0, `${args.join(' ')}: ${result.stderr || result.stdout}`);
    }
    const remoteBefore = Object.fromEntries(
      await Promise.all(Object.entries(paths).map(async ([name, target]) => [name, await snapshotScope(target)]))
    );
    const report = {
      qualified: false,
      cli,
      helper,
      temporary,
      extraFiles: options.extraFiles ?? 0,
      scenarios: selected.map((row) => row.name),
      fingerprints,
      runs: [],
    };
    const expected = new Map();
    let httpRemotes;
    if (transports.includes('http')) {
      server = cp.fork(path.join(__dirname, 'transfer-http-fixture.cjs'), [cli, JSON.stringify(Object.keys(paths))], {
        env: { ...process.env, BIT_GLOBALS_DIR: globals },
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      });
      const message = (predicate) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            server.off('message', receive);
            reject(new Error('HTTP fixture timeout'));
          }, 15000);
          function receive(value) {
            if (predicate(value)) {
              clearTimeout(timer);
              server.off('message', receive);
              resolve(value);
            }
          }
          server.on('message', receive);
        });
      httpRemotes = (await message((value) => value.remotes)).remotes;
      const ready = message((value) => value.configured);
      server.send({
        configure: Object.fromEntries(Object.entries(paths).map(([name, target]) => [name, { path: target }])),
      });
      await ready;
    }
    for (const transport of transports) {
      const remotes = transport === 'http' ? httpRemotes : fileRemotes;
      for (const mode of modes) {
        for (const scenario of selected) {
          const directory = path.join(temporary, `${transport}-${mode}-${scenario.name}`);
          const beforeBase = await cloneInboundScenario(producer, directory, scenario, remotes, runCommand);
          const before = { ...beforeBase, ...(await captureStorage(cli, directory, beforeBase)) };
          const trace = mode === 'native' ? path.join(directory, 'inbound-trace.json') : undefined;
          const result = await runCommand(directory, scenario.args, mode, trace);
          assert.equal(result.signal, null, `${transport}/${mode}/${scenario.name}: signal`);
          assert.equal(result.code, 0, `${transport}/${mode}/${scenario.name}: ${result.stderr || result.stdout}`);
          const afterBase = await snapshotScope(directory, true);
          const after = { ...afterBase, ...(await captureStorage(cli, directory, afterBase)) };
          if (transport === 'http' && mode === 'native') {
            const virtual = path.join(directory, '.bit/.rust-inbound-virtual');
            assert.equal(
              await fs.access(virtual).then(
                () => true,
                () => false
              ),
              false,
              `${scenario.name}: HTTP transport must not publish a synthetic remote inside .bit`
            );
          }
          assert.ok(
            Object.keys(after.objects).length > Object.keys(before.objects).length,
            `${scenario.name}: object bytes must persist`
          );
          if (scenario.writesFiles)
            assert.ok(
              Object.keys(after.files).length > Object.keys(before.files).length,
              'workspace import must write files'
            );
          else assert.deepEqual(after.files, before.files, 'object-only mode must leave workspace files alone');
          if (!scenario.writesFiles)
            assert.equal(after.bitmap, before.bitmap, 'object-only mode must not change bitmap');
          let diagnostics;
          if (trace) {
            diagnostics = JSON.parse(await fs.readFile(trace, 'utf8'));
            assert.ok(
              diagnostics.workspace.commandInboundPrepare.completed > 0,
              `native prepare must own transfer: ${result.stderr}`
            );
            assert.equal(diagnostics.workspace.commandInboundApply.applied, 1, 'native apply must own publication');
            assert.equal(
              diagnostics.workspace.commandInboundPrepare.sourceBodyBytes,
              0,
              'Node must receive no object bodies'
            );
          }
          const rawState = { before, after, stdout: result.stdout, code: result.code };
          const state = comparable(rawState);
          const key = `${transport}/${scenario.name}`;
          if (mode === 'node') expected.set(key, state);
          else
            assert.deepEqual(
              state,
              expected.get(key),
              `${transport}/${mode}/${scenario.name}: exact canonical result/state`
            );
          const artifact = path.join(directory, 'qualification-state.json');
          await fs.writeFile(artifact, JSON.stringify({ state, rawState, diagnostics }, null, 2));
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
    for (const [name, target] of Object.entries(paths))
      assert.deepEqual(
        await snapshotScope(target),
        remoteBefore[name],
        `${name}: inbound must not mutate source scope`
      );
    assert.deepEqual(await Promise.all(fingerprintFiles.map(fingerprint)), fingerprints, 'qualified files changed');
    report.qualified = true;
    await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
    return report;
  } finally {
    server?.disconnect();
  }
}

if (require.main === module) {
  const [cli, helper, report] = process.argv.slice(2);
  run(cli, helper, report)
    .then((value) => console.log(JSON.stringify({ qualified: value.qualified, runs: value.runs.length, report })))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { run, scenarios, cloneInboundScenario, scopeRemotes, spawn, comparable, captureStorage };
