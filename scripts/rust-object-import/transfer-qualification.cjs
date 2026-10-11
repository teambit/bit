// Public export/import operations against disposable bare scopes and real loopback routes.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { measuredCommand, pairedEntries } = require('./merge-history-measurement.cjs');
const { sourceIdentity } = require('./artifacts/contract.cjs');
const { createTransferRemotes, writeTransferComponents, snapshotScope } = require('./transfer-fixture.cjs');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Repository index insertion order follows concurrent persistence completion.
// Reports retain raw bytes; comparisons sort only index rows without dropping fields or duplicates.
function comparisonState(value, key) {
  if (key === 'index' && typeof value === 'string') {
    const parsed = JSON.parse(value);
    for (const field of ['components', 'lanes'])
      if (Array.isArray(parsed[field]))
        parsed[field] = parsed[field].slice().sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return parsed;
  }
  if (Array.isArray(value)) return value.map((item) => comparisonState(item));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([name, item]) => [name, comparisonState(item, name)]));
  return value;
}
async function runQualification(cli, helper, options = {}) {
  cli = path.resolve(cli);
  helper = path.resolve(helper);
  assert.ok(cli.startsWith(os.tmpdir() + path.sep), 'physically prepared private CLI required');
  const marker = JSON.parse(await fs.readFile(path.join(cli, '.bit-object-import-build.json'), 'utf8'));
  const repository = path.resolve(__dirname, '../..');
  const helperSha256 = digest(await fs.readFile(helper));
  const nativeSourceDigest = sourceIdentity(repository);
  const files = [
    'transfer-qualification.cjs',
    'transfer-fixture.cjs',
    'transfer-http-fixture.cjs',
    'transfer-determinism.cjs',
    'merge-state-determinism.cjs',
    'import-trace.cjs',
    'merge-history-measurement.cjs',
    'transfer-measure.cjs',
    '../rust-dependency-analysis/process-tree-memory.cjs',
    '../rust-dependency-analysis/process-tree-memory-control.cjs',
  ];
  const bindings = Object.fromEntries(
    await Promise.all(files.map(async (name) => [name, digest(await fs.readFile(path.join(__dirname, name)))]))
  );
  async function verify() {
    for (const [name, sha] of Object.entries(marker.sourceSha256))
      assert.equal(digest(await fs.readFile(path.join(repository, name))), sha, `source ${name}`);
    for (const row of marker.compiledModules)
      assert.equal(
        digest(await fs.readFile(path.join(cli, 'node_modules/@teambit', row.path))),
        row.sha256,
        `compiled ${row.path}`
      );
    for (const [name, sha] of Object.entries(bindings))
      assert.equal(digest(await fs.readFile(path.join(__dirname, name))), sha, `harness ${name}`);
    assert.equal(digest(await fs.readFile(helper)), helperSha256);
    assert.equal(sourceIdentity(repository), nativeSourceDigest, 'native sources changed');
  }
  await verify();
  const temporary = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-real-transfer-'));
  const globals = benchmarkGlobals(temporary);
  const remoteRoot = path.join(temporary, 'remotes');
  const modes = options.modes || ['node', 'native', 'missing-helper', 'crashed-helper'];
  const transports = options.transports || ['file', 'http'];
  const extraFiles = Number(options.extraFiles || 0);
  const runs = [],
    diagnostics = [];
  let server;
  let activeRun;
  const measurementDirectory = path.join(temporary, 'measurements');
  if (options.measure) await fs.mkdir(measurementDirectory);
  function message(predicate) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('HTTP fixture IPC timed out'));
      }, 15000);
      function receive(value) {
        if (predicate(value)) {
          cleanup();
          resolve(value);
        }
      }
      function cleanup() {
        clearTimeout(timer);
        server.off('message', receive);
      }
      server.on('message', receive);
    });
  }
  let httpRemotes;
  if (transports.includes('http')) {
    server = cp.fork(
      path.join(__dirname, 'transfer-http-fixture.cjs'),
      [cli, JSON.stringify(['qualification.alpha', 'qualification.beta'])],
      { env: { ...process.env, BIT_GLOBALS_DIR: globals }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'] }
    );
    httpRemotes = (await message((value) => value.remotes)).remotes;
  }
  async function configure(paths, failPersist = false) {
    const ready = message((value) => value.configured);
    server.send({
      configure: Object.fromEntries(
        Object.entries(paths).map(([name, target]) => [
          name,
          { path: target, failPersist: failPersist && name === 'qualification.beta' },
        ])
      ),
    });
    await ready;
  }
  async function command(directory, args, mode, step, allowFailure = false) {
    const env = {
      ...process.env,
      CI: '1',
      BIT_GLOBALS_DIR: globals,
      BIT_RUST_CLIENT_VCS: mode === 'node' ? 'off' : 'on',
      BIT_RUST_OBJECT_IMPORT:
        mode === 'missing-helper'
          ? path.join(temporary, 'missing-helper')
          : mode === 'crashed-helper'
            ? process.execPath
            : helper,
      BIT_SNAPSHOT_QUALIFICATION_SEED: `transfer:${step}`,
      BIT_SNAPSHOT_QUALIFICATION_CLOCK: String(1800000000000 + step * 1000),
      BIT_RUST_OBJECT_TAR: undefined,
      BIT_RUST_OBJECT_IMPORT_OPERATION: undefined,
    };
    delete env.BIT_IMPORT_TRACE;
    delete env.BIT_IMPORT_TRACE_OWNER;
    const argsNode = ['--require', path.join(__dirname, 'transfer-determinism.cjs')];
    const traced = mode === 'native' && options.diagnostics !== false && ['export', 'import'].includes(args[0]);
    const trace = path.join(directory, `transfer-trace-${step}.json`);
    if (traced) {
      env.BIT_IMPORT_TRACE = trace;
      argsNode.push('--require', path.join(__dirname, 'import-trace.cjs'));
    }
    argsNode.push(path.join(cli, 'bin/bit.js'), ...args);
    let result;
    if (options.measure && !traced && !allowFailure && [5, 6, 8, 9, 12, 13].includes(step)) {
      const measured = await measuredCommand(argsNode, {
        cwd: directory,
        env,
        step,
        operation: args.join(' '),
        cpuDirectory: measurementDirectory,
      });
      activeRun.measurements.push(measured.measurement);
      result = { code: 0, ...measured.result };
    } else
      result = await new Promise((resolve, reject) => {
        const child = cp.spawn(process.execPath, argsNode, { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '',
          stderr = '';
        const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
        child.stdout.on('data', (bytes) => (stdout += bytes));
        child.stderr.on('data', (bytes) => (stderr += bytes));
        child.on('error', reject);
        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({ code, stdout, stderr });
        });
      });
    if (allowFailure) assert.notEqual(result.code, 0, 'controlled export failure must occur');
    else assert.equal(result.code, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    if (traced)
      diagnostics.push({
        transport: path.basename(directory).startsWith('http-') ? 'http' : 'file',
        step,
        args,
        trace: JSON.parse(await fs.readFile(trace, 'utf8')),
      });
    return result;
  }
  async function init(directory, remotes) {
    await fs.mkdir(directory);
    await command(directory, ['init', '--skip-interactive', '--default-scope', 'qualification.alpha'], 'node', 0);
    const filename = path.join(directory, '.bit/scope.json');
    const scope = JSON.parse(await fs.readFile(filename, 'utf8'));
    scope.name = 'qualification.workspace';
    scope.remotes = remotes;
    await fs.writeFile(filename, JSON.stringify(scope));
    const workspace = path.join(directory, 'workspace.jsonc');
    await fs.writeFile(
      workspace,
      (await fs.readFile(workspace, 'utf8')).replace(/"name": "[^"]*"/, '"name": "transfer-qualification"')
    );
    await fs.writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: 'transfer-qualification', private: true })
    );
  }
  async function remoteStates(paths) {
    return Object.fromEntries(
      await Promise.all(Object.entries(paths).map(async ([name, target]) => [name, await snapshotScope(target)]))
    );
  }
  try {
    for (const transport of transports) {
      let baseline;
      const entries = options.measure
        ? pairedEntries(options.rounds || 3).filter((entry) => !entry.fallback)
        : modes.map((mode) => ({ mode }));
      for (const [runIndex, entry] of entries.entries()) {
        const { mode } = entry;
        activeRun = { transport, ...entry, measurements: [] };
        await fs.rm(remoteRoot, { recursive: true, force: true });
        const paths = await createTransferRemotes(cli, remoteRoot);
        const remotes =
          transport === 'http'
            ? httpRemotes
            : Object.fromEntries(Object.entries(paths).map(([name, target]) => [name, `file://${target}`]));
        for (const target of Object.values(paths)) {
          const scopeFile = path.join(target, 'scope.json');
          const scopeConfig = JSON.parse(await fs.readFile(scopeFile, 'utf8'));
          scopeConfig.remotes = remotes;
          await fs.writeFile(scopeFile, JSON.stringify(scopeConfig));
        }
        if (server) await configure(paths);
        const directory = path.join(temporary, `${transport}-${mode}-${runIndex}`);
        await init(directory, remotes);
        await writeTransferComponents(directory, extraFiles);
        for (const name of ['alpha', 'beta'])
          await command(directory, ['add', name, '--id', name, '--main', 'index.js'], 'node', 1);
        await command(directory, ['scope', 'set', 'qualification.beta', 'beta'], 'node', 2);
        await command(
          directory,
          ['tag', '--ver', '1.0.0', '--soft', '--message', 'initial', '--skip-auto-tag', '--ignore-issues', '*'],
          'node',
          3
        );
        await command(
          directory,
          ['tag', '--persist=skip-build', '--disable-tag-pipeline', '--ignore-issues', '*'],
          'node',
          4
        );
        const states = { beforeExport: await snapshotScope(directory, true) };
        await command(directory, ['export', '--origin-directly', '--json'], mode, 5);
        states.exported = await remoteStates(paths);
        states.localExported = await snapshotScope(directory, true);
        const destination = path.join(temporary, `${transport}-${mode}-${runIndex}-import`);
        await init(destination, remotes);
        await command(
          destination,
          [
            'import',
            'qualification.alpha/alpha@1.0.0',
            'qualification.beta/beta@1.0.0',
            '--all-history',
            '--skip-dependency-installation',
            '--override',
            '--safe-mode',
          ],
          mode,
          6
        );
        states.imported = await snapshotScope(destination, true);
        await writeTransferComponents(directory, extraFiles, 1);
        await command(
          directory,
          ['snap', '--message', 'local change', '--skip-auto-snap', '--disable-snap-pipeline', '--ignore-issues', '*'],
          'node',
          7
        );
        if (transport === 'http') {
          await configure(paths, true);
          const failure = await command(directory, ['export', '--origin-directly', '--json'], mode, 8, true);
          states.partial = await remoteStates(paths);
          assert.deepEqual(states.partial['qualification.alpha'].pending, {});
          const pending = Object.keys(states.partial['qualification.beta'].pending);
          assert.ok(pending.length, 'second remote retains resumable pending objects');
          const exportId = pending[0].split(path.sep)[0];
          assert.match(failure.stdout + failure.stderr, /persist|resume/i);
          await configure(paths, false);
          await command(directory, ['export', '--origin-directly', '--resume', exportId, '--json'], mode, 9);
          states.resumed = await remoteStates(paths);
          assert.deepEqual(
            states.resumed['qualification.alpha'],
            states.partial['qualification.alpha'],
            'resume retains already-persisted first remote exactly'
          );
          assert.deepEqual(states.resumed['qualification.beta'].pending, {});
        } else await command(directory, ['export', '--origin-directly', '--json'], mode, 8);
        states.final = await remoteStates(paths);
        await command(directory, ['lane', 'create', 'feature', '--scope', 'qualification.alpha'], 'node', 10);
        await writeTransferComponents(directory, extraFiles, 2);
        await command(
          directory,
          ['snap', '--message', 'lane change', '--skip-auto-snap', '--disable-snap-pipeline', '--ignore-issues', '*'],
          'node',
          11
        );
        await command(directory, ['export', '--origin-directly', '--json'], mode, 12);
        states.laneExported = await remoteStates(paths);
        await command(
          destination,
          ['lane', 'switch', 'qualification.alpha/feature', '--skip-dependency-installation'],
          mode,
          13
        );
        states.laneImported = await snapshotScope(destination, true);

        if (!baseline) baseline = states;
        else
          assert.deepEqual(
            comparisonState(states),
            comparisonState(baseline),
            `${transport}/${mode} exact canonical state`
          );
        runs.push({ ...activeRun, states: options.omitStates ? undefined : states });
      }
    }
    await verify();
    if (modes.includes('native') && options.diagnostics !== false) {
      for (const transport of transports) {
        const rows = diagnostics.filter((row) => row.transport === transport);
        const positive = (step, kind) => {
          const row = rows.find((item) => item.step === step);
          assert.ok(row, `${transport} operation ${step} diagnostic required`);
          const metric = row.trace.mergeState[kind];
          assert.ok(metric.completed > 0, `${transport} operation ${step} must execute ${kind}`);
          assert.equal(metric.failed, 0, `${transport} operation ${step} ${kind} failed acknowledgements`);
          return metric;
        };
        for (const step of [5, 12]) {
          assert.ok(positive(step, 'transferCollect').sources > 0);
          assert.equal(positive(step, 'transferInitialize').bodyBytes, 0, 'Sources stay in native spool');
          positive(step, 'transferTransactionInitialize');
          positive(step, 'transferTransactionReceipt');
          if (transport === 'file') positive(step, 'transferPending');
          else assert.ok(positive(step, 'transferArchive').archiveBytes > 0);
        }
        const incoming = rows.find((item) => item.step === 6);
        assert.ok(
          incoming.trace.tar.operations > 0 && incoming.trace.tar.nativeSources > 0,
          `${transport} incoming Sources must execute native tar import`
        );
        assert.equal(incoming.trace.tar.fallbacks, 0);
        if (transport === 'file') {
          positive(6, 'transferCollect');
          assert.ok(positive(6, 'transferArchive').archiveBytes > 0);
        }
      }
    }
    const report = {
      schemaVersion: 1,
      temporary,
      cliProvenance: marker,
      helperSha256,
      nativeSourceDigest,
      bindings,
      extraFiles,
      fixture: { components: 2, filesPerComponent: 3 + extraFiles, totalTrackedFiles: 2 * (3 + extraFiles) },
      indexComparison:
        'All fields and duplicate rows retained; only component/lane index row insertion order is sorted for comparison. Raw index bytes remain in correctness reports.',
      measurement: options.measure
        ? { rounds: options.rounds || 3, warmupExcluded: true, remoteServerCpuIncluded: false }
        : undefined,
      diagnostics,
      runs,
    };
    if (options.report) await fs.writeFile(options.report, JSON.stringify(report, null, 2) + '\n');
    return report;
  } finally {
    if (server) {
      server.disconnect();
      await new Promise((resolve) => server.once('exit', resolve));
    }
  }
}
module.exports = { runQualification };
if (require.main === module)
  runQualification(process.argv[2], process.argv[3], {
    modes: process.env.BIT_TRANSFER_QUALIFICATION_NODE_ONLY === '1' ? ['node'] : undefined,
    transports: process.env.BIT_TRANSFER_QUALIFICATION_TRANSPORTS?.split(','),
    report: process.env.BIT_TRANSFER_QUALIFICATION_REPORT,
    diagnostics: process.env.BIT_TRANSFER_QUALIFICATION_DIAGNOSTICS !== '0',
  })
    .then((report) => console.log(JSON.stringify({ temporary: report.temporary, runs: report.runs.length })))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
