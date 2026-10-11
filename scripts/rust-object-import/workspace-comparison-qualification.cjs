// Actual status/diff commands with isolated workspaces, configuration and scope objects.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { createCheckoutFixture } = require('./checkout-qualification.cjs');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const { createBenchmarkProcessControl } = require('../rust-dependency-analysis/process-tree-memory-control.cjs');
const { createProcessTreeMemorySampler } = require('../rust-dependency-analysis/process-tree-memory.cjs');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function runQualification(cliRoot, helper, options = {}) {
  cliRoot = path.resolve(cliRoot);
  helper = path.resolve(helper);
  const repository = path.resolve(__dirname, '../..');
  const provenance = JSON.parse(await fs.readFile(path.join(cliRoot, '.bit-object-import-build.json'), 'utf8'));
  const helperSha256 = digest(await fs.readFile(helper));
  const harnessSha256 = digest(await fs.readFile(__filename));
  const fixtureHarness = path.join(__dirname, 'checkout-qualification.cjs');
  const fixtureHarnessSha256 = digest(await fs.readFile(fixtureHarness));
  async function verifyProvenance() {
    for (const [filename, hash] of Object.entries(provenance.sourceSha256))
      assert.equal(digest(await fs.readFile(path.join(repository, filename))), hash, `source ${filename}`);
    for (const file of provenance.compiledModules)
      assert.equal(
        digest(await fs.readFile(path.join(cliRoot, 'node_modules/@teambit', file.path))),
        file.sha256,
        `compiled ${file.path}`
      );
    assert.equal(digest(await fs.readFile(helper)), helperSha256);
    assert.equal(digest(await fs.readFile(__filename)), harnessSha256);
    assert.equal(digest(await fs.readFile(fixtureHarness)), fixtureHarnessSha256);
  }
  await verifyProvenance();
  const temporary = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-real-workspace-comparison-'));
  const globals = benchmarkGlobals(temporary);
  const fixture = await createCheckoutFixture(cliRoot, path.join(temporary, 'remote'), {
    extraFiles: options.extraFiles,
  });
  const load = createRequire(path.join(cliRoot, 'package.json'));
  let ordinal = 0;
  async function command(directory, args, mode = 'node', traceFile) {
    const env = {
      ...process.env,
      CI: '1',
      BIT_GLOBALS_DIR: globals,
      BIT_RUST_CLIENT_VCS: mode === 'node' ? 'off' : 'on',
      BIT_RUST_OBJECT_IMPORT:
        mode === 'missing-helper'
          ? path.join(directory, 'missing-helper')
          : mode === 'crashed-helper'
            ? process.execPath
            : helper,
      BIT_RUST_OBJECT_TAR: 'off',
      BIT_RUST_OBJECT_IMPORT_OPERATION: 'off',
      BIT_RUST_WORKSPACE_MATERIALIZATION: 'off',
      BIT_RUST_WORKSPACE_PERSISTENCE: 'off',
    };
    delete env.BIT_IMPORT_TRACE;
    delete env.BIT_IMPORT_TRACE_OWNER;
    if (traceFile) env.BIT_IMPORT_TRACE = traceFile;
    const argsNode = [path.join(cliRoot, 'bin/bit.js'), ...args];
    if (traceFile) argsNode.unshift('--require', path.join(__dirname, 'import-trace.cjs'));
    const cpuFile = path.join(directory, `comparison-cpu-${ordinal++}.txt`);
    const linux = process.platform === 'linux';
    const started = performance.now();
    const result = await new Promise((resolve, reject) => {
      const child = cp.spawn(
        linux ? '/usr/bin/time' : process.execPath,
        linux ? ['-f', '%U %S', '-o', cpuFile, process.execPath, ...argsNode] : argsNode,
        { cwd: directory, env, detached: linux, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      const sampler = linux ? createProcessTreeMemorySampler(child.pid, { intervalMs: 10 }) : undefined;
      sampler?.start();
      const control = linux ? createBenchmarkProcessControl(child) : undefined;
      const timer = linux ? undefined : setTimeout(() => child.kill('SIGKILL'), 120000);
      let stdout = '',
        stderr = '';
      child.stdout.on('data', (bytes) => {
        stdout += bytes;
      });
      child.stderr.on('data', (bytes) => {
        stderr += bytes;
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        sampler?.stop();
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        const processTree = sampler?.stop();
        if (control?.failure) reject(control.failure);
        else resolve({ code, stdout, stderr, wallMs: performance.now() - started, processTree });
      });
    });
    assert.equal(result.code, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    if (linux) {
      const [user, system] = (await fs.readFile(cpuFile, 'utf8')).trim().split(/\s+/).map(Number);
      result.cpuSeconds = { user, system, total: user + system };
    }
    if (args.includes('--json')) result.json = JSON.parse(result.stdout);
    return result;
  }
  const rounds = Number(options.rounds || 1);
  assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 100);
  const schedule = [];
  if (rounds > 1) for (const mode of ['node', 'native']) schedule.push({ mode, round: -1, warmup: true });
  for (let round = 0; round < rounds; round++)
    for (const mode of round % 2 ? ['native', 'node'] : ['node', 'native'])
      schedule.push({ mode, round, warmup: false });
  for (const mode of ['missing-helper', 'crashed-helper'])
    schedule.push({ mode, round: 0, warmup: false, fallback: true });
  const runs = [];
  for (const entry of schedule) {
    const directory = path.join(temporary, `${entry.mode}-${entry.warmup ? 'warmup' : entry.round}`);
    await fs.mkdir(directory);
    await command(directory, ['init', '--skip-interactive', '--default-scope', 'qualification.destination']);
    const scopeFile = path.join(directory, '.bit/scope.json');
    const scopeJson = JSON.parse(await fs.readFile(scopeFile, 'utf8'));
    scopeJson.name = 'qualification.destination';
    scopeJson.remotes = fixture.remotes;
    await fs.writeFile(scopeFile, JSON.stringify(scopeJson));
    await fs.writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: 'comparison-qualification', private: true, type: 'module' })
    );
    await command(directory, [
      'import',
      `${fixture.id}@1.0.1`,
      '--all-history',
      '--skip-dependency-installation',
      '--override',
      '--safe-mode',
    ]);
    const map = load('comment-json').parse(await fs.readFile(path.join(directory, '.bitmap'), 'utf8'));
    const component = Object.values(map).find((value) => value && `${value.scope}/${value.name}` === fixture.id);
    assert.ok(component?.rootDir);
    const componentRoot = path.join(directory, component.rootDir);
    const cleanStatus = await command(directory, ['status', '--json'], entry.mode);
    const cleanDiff = await command(directory, ['diff', fixture.id, '--json'], entry.mode);
    assert.deepEqual(cleanStatus.json.modifiedComponents, []);
    assert.ok(
      cleanDiff.json.every((diff) => !diff.filesDiff?.length),
      'clean component must have no file changes'
    );
    await fs.writeFile(path.join(componentRoot, 'index.js'), 'export default "modified locally";\n');
    await fs.rm(path.join(componentRoot, 'added.js'));
    await fs.rename(path.join(componentRoot, 'case.js'), path.join(componentRoot, 'renamed.js'));
    await fs.writeFile(path.join(componentRoot, 'new.js'), 'export const newFile = true;\n');
    await fs.writeFile(
      path.join(componentRoot, 'component.json'),
      JSON.stringify({
        componentId: { scope: 'qualification.checkout', name: 'component', version: '1.0.1' },
        extensions: {
          'teambit.dependencies/dependency-resolver': {
            policy: { dependencies: { 'comparison-dependency': '1.0.0' } },
          },
        },
      })
    );
    const modifiedStatus = await command(directory, ['status', '--json'], entry.mode);
    const modifiedDiff = await command(directory, ['diff', fixture.id, '--json'], entry.mode);
    assert.deepEqual(modifiedStatus.json.modifiedComponents, [fixture.id]);
    const diff = modifiedDiff.json.find((value) => value.id === fixture.id);
    assert.ok(diff?.hasDiff);
    for (const filename of ['index.js', 'added.js', 'case.js', 'renamed.js', 'new.js'])
      assert.ok(
        diff.filesDiff.some((file) => file.filePath === filename),
        `modified diff ${filename}`
      );
    assert.ok(
      JSON.stringify(diff.fieldsDiff).includes('comparison-dependency'),
      'dependency metadata changes must remain visible'
    );
    let diagnostics;
    if (entry.mode === 'native' && entry.round === 0 && !entry.warmup) {
      diagnostics = {};
      for (const kind of ['status', 'diff']) {
        const traceFile = path.join(directory, `${kind}-comparison-trace.json`);
        await command(
          directory,
          kind === 'status' ? ['status', '--json'] : ['diff', fixture.id, '--json'],
          entry.mode,
          traceFile
        );
        diagnostics[kind] = JSON.parse(await fs.readFile(traceFile, 'utf8'));
        const metrics = diagnostics[kind].workspace;
        assert.equal(diagnostics[kind].persistence.helpers, 1, `${kind} must reuse one operation helper`);
        assert.ok(metrics.scan.frames > 0, `${kind} must scan within its operation scope`);
        assert.equal(metrics.scan.failed, 0);
        assert.ok(metrics.read.files > 0, `${kind} must use native workspace reads`);
        assert.equal(metrics.read.completed, metrics.read.files);
        assert.equal(metrics.read.failed, 0);
        const operation = kind === 'status' ? 'compare' : 'diff';
        assert.ok(metrics[operation].files > 0, `${kind} must exercise native ${operation}`);
        assert.equal(metrics[operation].completed, metrics[operation].files);
        assert.equal(metrics[operation].failed, 0);
      }
    }
    runs.push({ ...entry, cleanStatus, cleanDiff, modifiedStatus, modifiedDiff, diagnostics });
  }
  for (const name of ['cleanStatus', 'cleanDiff', 'modifiedStatus', 'modifiedDiff'])
    for (const run of runs.slice(1)) assert.deepEqual(run[name].json, runs[0][name].json, `${run.mode} ${name} parity`);
  await verifyProvenance();
  const report = {
    schemaVersion: 1,
    temporary,
    node: process.version,
    cliProvenance: provenance,
    helperSha256,
    harnessSha256,
    fixtureHarnessSha256,
    fixtureVersions: fixture.versionRefs,
    rounds,
    workload: { components: 1, versions: 2, filesPerVersion: Object.keys(fixture.definitions[0]).length },
    measurement: 'GNU time command CPU and 10ms process-tree RSS on Linux; setup, warmups and diagnostics excluded',
    runs,
  };
  if (options.report) await fs.writeFile(options.report, JSON.stringify(report, null, 2));
  return report;
}
module.exports = { runQualification };
if (require.main === module)
  runQualification(process.argv[2], process.argv[3], {
    scratch: process.env.BIT_WORKSPACE_COMPARISON_TMPDIR,
    report: process.env.BIT_WORKSPACE_COMPARISON_REPORT,
    rounds: process.env.BIT_WORKSPACE_COMPARISON_ROUNDS,
    extraFiles: process.env.BIT_WORKSPACE_COMPARISON_EXTRA_FILES,
  })
    .then((report) => console.log(JSON.stringify({ temporary: report.temporary, runs: report.runs.length })))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
