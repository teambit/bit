#!/usr/bin/env node
// Genuine local-only install benchmark: gate first, then nine interleaved pairs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { createProcessTreeMemorySampler } = require('./process-tree-memory.cjs');
const { createBenchmarkProcessControl } = require('./process-tree-memory-control.cjs');
assert.equal(process.argv.length, 6, 'usage: install-benchmark.cjs <private-cli> <fixture> <helper> <report.json>');
const [cli, fixture, native, destination] = process.argv.slice(2).map((value) => path.resolve(value));
const provenance = JSON.parse(fs.readFileSync(path.join(cli, '.bit-rust-private-build.json')));
const fixtureManifest = JSON.parse(fs.readFileSync(path.join(fixture, '.rust-install-fixture.json')));
const hash = (data) => createHash('sha256').update(data).digest('hex');
for (const entry of provenance.compiledModules)
  assert.equal(hash(fs.readFileSync(path.join(cli, 'node_modules/@teambit', entry.path))), entry.sha256);
for (const [file, sha] of Object.entries(fixtureManifest.sources))
  assert.equal(hash(fs.readFileSync(path.join(fixture, file))), sha);
assert.equal(fixtureManifest.cliRevision, provenance.revision);
assert.equal(fs.realpathSync(fixture), fixture);
assert.ok([os.tmpdir(), '/tmp'].some((root) => fixture.startsWith(root + path.sep)));
assert.equal(cp.spawnSync('unshare', ['-Urn', 'true']).status, 0, 'network namespace required');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-install-benchmark-'));
const baseline = path.join(root, 'baseline');
const workspace = path.join(root, 'workspace');
const compileCache = path.join(root, 'node-compile-cache');
const tracer = path.join(__dirname, 'install-trace.cjs');
const load = createRequire(path.join(cli, 'package.json'));
const cacache = load('cacache');
const command = ['install', '--lockfile-only', '--skip-import', '--skip-compile', '--skip-write-config-files'];
const report = {
  provenance: { revision: provenance.revision, version: provenance.version },
  fixture: fixtureManifest,
  helperSha256: hash(fs.readFileSync(native)),
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  cpu: os.cpus()[0].model,
  command,
  network: 'unshare -Urn for every real CLI command; no external network',
  globalWrites: 'BIT_GLOBALS_DIR plus native package store/cache inside owned workspace',
  installedState: 'every run is restored from the same physical fixture snapshot',
  timingBoundary:
    'real Node CLI process startup through real package-manager completion, excluding restoration and cache inspection',
  acceptance: false,
  runs: [],
};
let activeControl;
let interrupted = false;
function interrupt() {
  interrupted = true;
  activeControl?.terminate(new Error('install benchmark interrupted'));
}
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
function copy(from, to) {
  fs.cpSync(from, to, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (entry.isSymbolicLink()) {
        const target = fs.readlinkSync(filename);
        if (target.startsWith(from + path.sep)) {
          fs.unlinkSync(filename);
          fs.symlinkSync(to + target.slice(from.length), filename);
        }
      }
    }
  }
  visit(to);
}
async function records() {
  const result = {};
  const cache = path.join(workspace, '.bit/cache/components/deps');
  const entries = await cacache.ls(cache);
  for (const key of Object.keys(entries).sort())
    result[key] = JSON.parse((await cacache.get(cache, key)).data.toString());
  return result;
}
async function execute(variant, measured) {
  fs.rmSync(workspace, { recursive: true, force: true });
  copy(baseline, workspace);
  fs.rmSync(path.join(workspace, '.bit/cache/components/deps'), { recursive: true, force: true });
  assert.equal(Object.keys(await records()).length, 0);
  fs.writeFileSync(
    path.join(workspace, 'pnpm-workspace.yaml'),
    `storeDir: ${JSON.stringify(path.join(workspace, '.store'))}\ncacheDir: ${JSON.stringify(path.join(workspace, '.cache'))}\nenableGlobalVirtualStore: false\nfetchRetries: 0\nfetchTimeout: 3000\n`
  );
  const trace = path.join(root, 'helper-trace.json');
  const pmTrace = path.join(root, 'pm-trace.json');
  fs.rmSync(trace, { force: true });
  fs.rmSync(pmTrace, { force: true });
  const env = {
    ...process.env,
    BIT_GLOBALS_DIR: path.join(workspace, '.globals'),
    BIT_ENABLE_GLOBAL_VIRTUAL_STORE: 'false',
    NODE_COMPILE_CACHE: compileCache,
    BIT_COMMAND_BENCH_TRACE: trace,
    BIT_INSTALL_VALIDATION_TRACE: pmTrace,
    BIT_INSTALL_VALIDATION_ROOT: workspace,
  };
  delete env.BIT_COMMAND_BENCH_TRACE_OWNER;
  if (interrupted) throw new Error('install benchmark interrupted');
  if (variant === 'native') env.BIT_RUST_DEPENDENCY_SCANNER = native;
  else delete env.BIT_RUST_DEPENDENCY_SCANNER;
  const start = performance.now();
  const child = cp.spawn(
    '/usr/bin/time',
    [
      '-f',
      '\nBIT_INSTALL_RESOURCE %U %S %M',
      'unshare',
      '-Urn',
      process.execPath,
      '--require',
      tracer,
      path.join(cli, 'bin/bit.js'),
      ...command,
    ],
    { cwd: workspace, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const control = createBenchmarkProcessControl(child, { timeoutMs: 30_000 });
  activeControl = control;
  let stdout = '';
  let stderr = '';
  let outputBytes = 0;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  function collect(stream, chunk) {
    outputBytes += Buffer.byteLength(chunk);
    if (outputBytes > 8 * 1024 * 1024) {
      control.terminate(new Error('install output exceeds benchmark limit'));
      return;
    }
    if (stream === 'stdout') stdout += chunk;
    else stderr += chunk;
  }
  child.stdout.on('data', (chunk) => collect('stdout', chunk));
  child.stderr.on('data', (chunk) => collect('stderr', chunk));
  const closing = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ status: code, signal }));
  });
  let sampler;
  let run;
  let memory;
  try {
    if (!child.pid) await closing;
    sampler = createProcessTreeMemorySampler(child.pid);
    sampler.start();
    run = { ...(await closing), stdout, stderr };
    memory = sampler.stop();
    if (control.failure) throw control.failure;
    if (interrupted) throw new Error('install benchmark interrupted');
    assert.equal(memory.failedProcReads, 0, 'procfs failures cannot pass');
    assert.equal(memory.racedProcessReads, 0, 'PID reuse cannot pass');
  } finally {
    sampler?.stop();
    control.dispose();
    activeControl = undefined;
  }
  const elapsedMs = performance.now() - start;
  const resource = stderr.match(/BIT_INSTALL_RESOURCE ([\d.]+) ([\d.]+) (\d+)/);
  assert.ok(resource, stderr);
  const helper = fs.existsSync(trace) ? JSON.parse(fs.readFileSync(trace)) : {};
  const pm = fs.existsSync(pmTrace) ? JSON.parse(fs.readFileSync(pmTrace)) : { calls: [], treeCalls: 0 };
  report.lastAttempt = {
    variant,
    status: run.status,
    helper,
    pm,
    stdout: run.stdout.slice(0, 4096),
    stderr: run.stderr.slice(0, 4096),
  };
  assert.equal(run.status, 0, `${run.error?.message || ''}\n${run.stderr}\n${run.stdout}`);
  assert.ok(
    pm.calls.length > 0 && pm.calls.every((call) => call.lockfileOnly === true),
    'actual original lockfile-only installer required'
  );
  assert.ok(pm.treeCalls > 0, 'source extraction must occur');
  if (variant === 'native') assert.ok(helper.requests > 0 && helper.outcomes?.ok > 0, 'native success required');
  else assert.equal(helper.requests, 0);
  const dependencies = await records();
  assert.equal(Object.keys(dependencies).length, fixtureManifest.componentCount);
  const lockfile = fs.readFileSync(path.join(workspace, 'pnpm-lock.yaml'), 'utf8');
  return {
    variant,
    measured,
    elapsedMs,
    totalTreeCpuMs: (Number(resource[1]) + Number(resource[2])) * 1000,
    maxSingleProcessRssKiB: Number(resource[3]),
    memory,
    cacheEntriesBefore: 0,
    dependencies,
    projects: pm.calls.map((call) => call.projects),
    lockfile,
    installerCalls: pm.calls.map((call) => ({
      storeDir: call.storeDir,
      cacheDir: call.cacheDir,
      lockfileOnly: call.lockfileOnly,
      projectCount: call.projects.length,
    })),
    treeCalls: pm.treeCalls,
    ...helper,
  };
}
function verify(value, reference) {
  assert.deepEqual(value.dependencies, reference.dependencies, 'exact dependency cache records');
  assert.deepEqual(value.projects, reference.projects, 'exact original installer project inputs');
  assert.equal(value.lockfile, reference.lockfile, 'exact lockfile bytes');
}
function summarize(run) {
  const { dependencies, projects, lockfile, ...rest } = run;
  return {
    ...rest,
    dependencyRecordsSha256: hash(JSON.stringify(dependencies)),
    projectsSha256: hash(JSON.stringify(projects)),
    lockfileSha256: hash(lockfile),
  };
}
(async () => {
  try {
    copy(fixture, baseline);
    const reference = await execute('legacy', false);
    const proof = await execute('native', false);
    verify(proof, reference);
    report.gate = {
      legacy: summarize(reference),
      native: summarize(proof),
      exactDependencyRecords: true,
      exactProjectInputs: true,
      exactLockfileBytes: true,
    };
    if (process.env.BIT_INSTALL_BENCH_PROOF_ONLY === '1') {
      report.proofOnly = true;
      report.acceptance = true;
      return;
    }
    for (let iteration = 0; iteration < 9; iteration++) {
      for (const variant of iteration % 2 ? ['native', 'legacy'] : ['legacy', 'native']) {
        const result = await execute(variant, true);
        verify(result, reference);
        report.runs.push({ iteration, ...summarize(result) });
      }
    }
    const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
    report.legacyMedianMs = median(report.runs.filter((run) => run.variant === 'legacy').map((run) => run.elapsedMs));
    report.nativeMedianMs = median(report.runs.filter((run) => run.variant === 'native').map((run) => run.elapsedMs));
    report.nativeToLegacyRatio = report.nativeMedianMs / report.legacyMedianMs;
    report.memoryMethod =
      'near-simultaneous 20ms Linux process-tree RSS sum, GNU time/unshare wrappers and observed CLI descendants included; driver excluded';
    report.memoryCaveats = [
      'shared pages count once perprocess',
      'short-lived processes and between-sample peaks may be missed',
      'sampler CPU is reported separately and excluded from GNU time command-tree CPU',
    ];
    for (const variant of ['legacy', 'native']) {
      const runs = report.runs.filter((run) => run.variant === variant);
      report[`${variant}MedianTreeCpuMs`] = median(runs.map((run) => run.totalTreeCpuMs));
      report[`${variant}MedianSampledTreeRssKiB`] = median(runs.map((run) => run.memory.peakSampledRssKiB));
    }
    report.acceptance = true;
  } catch (error) {
    report.failure = error.message;
    process.exitCode = 1;
  } finally {
    // Reports are committed: replace the disposable root (often under the user's home) with a placeholder.
    const json = JSON.stringify(report, null, 2).split(JSON.stringify(root).slice(1, -1)).join('<benchmark-root>');
    fs.writeFileSync(destination, json + '\n');
    fs.rmSync(root, { recursive: true, force: true });
  }
})();
