// Actual public commands operate only on freshly created disposable workspaces.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { sourceIdentity } = require('./artifacts/contract.cjs');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const { writeComponents, capture } = require('./snapshot-transaction-fixture.cjs');
const { measuredCommand, pairedEntries } = require('./merge-history-measurement.cjs');
const digest = (value) => createHash('sha256').update(value).digest('hex');
function comparisonState(value, key) {
  if (key === 'index' && typeof value === 'string') {
    const parsed = JSON.parse(value);
    for (const field of ['components', 'lanes'])
      if (Array.isArray(parsed[field]))
        parsed[field].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
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
  if (options.canonicalSmoke) assert.deepEqual(options.modes, ['node'], 'unqualified smoke must stay canonical');
  const repository = path.resolve(__dirname, '../..');
  const marker = JSON.parse(await fs.readFile(path.join(cli, '.bit-object-import-build.json'), 'utf8'));
  const helperSha256 = digest(await fs.readFile(helper));
  const nativeSourceDigest = sourceIdentity(repository);
  const names = [
    'snapshot-transaction-qualification.cjs',
    'snapshot-transaction-fixture.cjs',
    'snapshot-transaction-determinism.cjs',
    'snapshot-transaction-measure.cjs',
    'import-trace.cjs',
    'merge-history-measurement.cjs',
    '../rust-dependency-analysis/process-tree-memory.cjs',
    '../rust-dependency-analysis/process-tree-memory-control.cjs',
  ];
  const bindings = Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, digest(await fs.readFile(path.join(__dirname, name)))]))
  );
  async function verify() {
    for (const [name, hash] of Object.entries(options.canonicalSmoke ? {} : marker.sourceSha256))
      assert.equal(digest(await fs.readFile(path.join(repository, name))), hash, `source ${name}`);
    for (const row of marker.compiledModules)
      assert.equal(
        digest(await fs.readFile(path.join(cli, 'node_modules/@teambit', row.path))),
        row.sha256,
        `compiled ${row.path}`
      );
    for (const [name, hash] of Object.entries(bindings))
      assert.equal(digest(await fs.readFile(path.join(__dirname, name))), hash, `harness ${name}`);
    assert.equal(digest(await fs.readFile(helper)), helperSha256);
    if (!options.canonicalSmoke) assert.equal(sourceIdentity(repository), nativeSourceDigest);
  }
  await verify();
  const temporary = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-real-snapshot-transaction-'));
  const globals = benchmarkGlobals(temporary);
  const modes = options.modes || ['node', 'native', 'missing-helper', 'crashed-helper'];
  const runs = [],
    diagnostics = [];
  let measurements = [];
  async function command(directory, args, mode, step, expectedCode = 0) {
    assert.ok(directory.startsWith(temporary + path.sep));
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
      BIT_SNAPSHOT_QUALIFICATION_SEED: `snapshot-transaction:${step}`,
      BIT_SNAPSHOT_QUALIFICATION_CLOCK: String(1800000000000 + step * 1000),
    };
    for (const name of [
      'BIT_RUST_OBJECT_TAR',
      'BIT_RUST_OBJECT_IMPORT_OPERATION',
      'BIT_IMPORT_TRACE',
      'BIT_IMPORT_TRACE_OWNER',
    ])
      delete env[name];
    const traced = mode === 'native' && options.diagnostics !== false && ['snap', 'tag'].includes(args[0]);
    const trace = path.join(directory, `snapshot-transaction-trace-${step}.json`);
    const nodeArgs = ['--require', path.join(__dirname, 'snapshot-transaction-determinism.cjs')];
    if (traced) {
      env.BIT_IMPORT_TRACE = trace;
      nodeArgs.push('--require', path.join(__dirname, 'import-trace.cjs'));
    }
    nodeArgs.push(path.join(cli, 'bin/bit.js'), ...args);
    const measured = options.measure && !traced && expectedCode === 0 && ['snap', 'tag'].includes(args[0]);
    const measurementResult = measured
      ? await measuredCommand(nodeArgs, {
          cwd: directory,
          env,
          step,
          operation: `${args[0]}-${step}`,
          cpuDirectory: temporary,
        })
      : undefined;
    if (measurementResult) measurements.push(measurementResult.measurement);
    const result =
      measurementResult?.result ||
      (await new Promise((resolve, reject) => {
        const child = cp.spawn(process.execPath, nodeArgs, { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '',
          stderr = '';
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error(`command timed out: ${args.join(' ')}`));
        }, 120000);
        child.stdout.on('data', (chunk) => (stdout += chunk));
        child.stderr.on('data', (chunk) => (stderr += chunk));
        child.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.on('close', (code) => {
          clearTimeout(timeout);
          if (code !== expectedCode)
            reject(new Error(`${mode} step ${step}: ${args.join(' ')} failed (${code}):\n${stdout}\n${stderr}`));
          else resolve({ stdout, stderr, code });
        });
      }));
    if (traced) diagnostics.push({ mode, step, args, trace: JSON.parse(await fs.readFile(trace, 'utf8')) });
    return result;
  }
  const entries = pairedEntries(options.rounds || 1, options.modes).filter(
    (entry) => !(options.measure && options.diagnostics === false && entry.fallback)
  );
  for (const entry of entries) {
    const { mode } = entry;
    measurements = [];
    const directory = path.join(temporary, `${mode}-${entry.warmup ? 'warmup' : entry.round}`, 'snapshot-workspace');
    await fs.mkdir(directory, { recursive: true });
    await command(directory, ['init', '--skip-interactive', '--default-scope', 'qualification.snapshot'], 'node', 0);
    const scopeFile = path.join(directory, '.bit/scope.json');
    const scope = JSON.parse(await fs.readFile(scopeFile, 'utf8'));
    scope.name = 'qualification.snapshot';
    await fs.writeFile(scopeFile, JSON.stringify(scope));
    await fs.writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: 'snapshot-transaction-qualification', private: true })
    );
    await writeComponents(directory, Number(options.extraFiles || 0));
    for (const name of ['alpha', 'beta'])
      await command(directory, ['add', name, '--id', name, '--main', 'index.js'], 'node', 1);
    await command(directory, ['link'], 'node', 2);
    const stages = [];
    const stage = async (name, step) => {
      stages.push({
        name,
        state: await capture(directory),
        status: JSON.parse((await command(directory, ['status', '--json'], 'node', step)).stdout),
      });
      if (options.report && !options.omitStates)
        await fs.writeFile(
          options.report,
          JSON.stringify(
            {
              schemaVersion: 1,
              qualified: false,
              validationPending: true,
              temporary,
              cliProvenance: marker,
              helperSha256,
              nativeSourceDigest,
              bindings,
              diagnostics,
              runs,
              currentRun: { ...entry, stages },
            },
            null,
            2
          ) + '\n'
        );
    };
    await command(
      directory,
      ['tag', '--ver', '1.0.0', '--soft', '--message', 'initial Ω🌱', '--ignore-issues', '*'],
      mode,
      3
    );
    await stage('soft-initial', 4);
    await command(
      directory,
      ['tag', '--persist=skip-build', '--disable-tag-pipeline', '--ignore-issues', '*'],
      mode,
      5
    );
    await stage('persist-initial', 6);
    await fs.writeFile(path.join(directory, 'beta/index.js'), "module.exports = () => 'updated dependency';\n");
    await command(
      directory,
      ['tag', 'beta', '--ver', '1.0.1', '--soft', '--message', 'autotag dependency', '--ignore-issues', '*'],
      mode,
      7
    );
    await stage('soft-autotag', 8);
    await command(
      directory,
      ['tag', '--persist=skip-build', '--disable-tag-pipeline', '--ignore-issues', '*'],
      mode,
      9
    );
    await stage('persist-autotag', 10);
    const models = Object.values(stages.at(-1).state.objects)
      .filter((object) => object.type === 'Component')
      .map((object) => object.body);
    assert.equal(models.length, 2);
    for (const model of models) assert.ok(model.versions['1.0.1'], `${model.name} must be tagged or auto-tagged`);
    await command(directory, ['lane', 'create', 'feature', '--scope', 'qualification.snapshot'], 'node', 11);
    await fs.writeFile(path.join(directory, 'beta/index.js'), "module.exports = () => 'lane dependency';\n");
    await command(
      directory,
      ['snap', 'beta', '--message', 'lane dependency', '--disable-snap-pipeline', '--ignore-issues', '*'],
      mode,
      12
    );
    await stage('lane-autosnap', 13);
    await command(directory, ['lane', 'switch', 'main', '--skip-dependency-installation'], 'node', 14);
    await command(directory, ['checkout', '1.0.0', 'beta', '--skip-dependency-installation'], 'node', 15);
    await fs.writeFile(path.join(directory, 'beta/index.js'), "module.exports = () => 'detached dependency';\n");
    await command(
      directory,
      [
        'snap',
        'beta',
        '--detach-head',
        '--skip-auto-snap',
        '--message',
        'detached dependency',
        '--disable-snap-pipeline',
        '--ignore-issues',
        '*',
      ],
      mode,
      16
    );
    await stage('detached-snap', 17);
    await command(directory, ['checkout', 'head', 'beta', '--skip-dependency-installation'], 'node', 22);
    await command(
      directory,
      [
        'tag',
        '--ver',
        '1.0.2',
        '--unmodified',
        '--build',
        '--skip-tests',
        '--disable-tag-pipeline',
        '--ignore-issues',
        '*',
      ],
      mode,
      18
    );
    await stage('built-tag', 19);
    const builtVersions = Object.values(stages.at(-1).state.objects).filter(
      (object) => object.type === 'Version' && object.body.buildStatus === 'succeed'
    );
    assert.ok(builtVersions.length >= 2, 'both components must complete their real local build');
    for (const version of builtVersions) {
      const artifacts = version.body.extensions.find((extension) => extension.name === 'teambit.pipelines/builder')
        ?.data?.artifacts;
      assert.ok(Array.isArray(artifacts) && artifacts.length >= 3, 'real build must persist nonempty artifacts');
      for (const task of ['TSCompiler', 'ExtractSchema', 'GeneratePreview']) {
        const artifact = artifacts.find((artifact) => artifact.task.name === task);
        assert.ok(artifact?.files.length > 0, `${task} must produce stored files`);
        for (const file of artifact.files) {
          const stored = stages.at(-1).state.objects[file.file];
          assert.equal(stored?.type, 'Source', `${task} artifact ${file.relativePath} must be stored`);
          assert.ok(stored.inflatedHex.length > 0);
        }
      }
    }
    await fs.writeFile(path.join(directory, 'beta/index.js'), 'module.exports = ;\n');
    const buildFailure = await command(
      directory,
      ['tag', '--ver', '1.0.3', '--build', '--skip-tests', '--disable-tag-pipeline', '--ignore-issues', '*'],
      mode,
      20,
      1
    );
    assert.match(buildFailure.stdout + buildFailure.stderr, /error|fail/i, 'actual compiler failure must be reported');
    await stage('failed-build-prefix', 21);
    await verify();
    if (runs.length)
      assert.deepEqual(comparisonState(stages), comparisonState(runs[0].stages), `${mode} snapshot transaction parity`);
    runs.push({ ...entry, measurements, buildFailure, stages });
  }
  // Preserve complete raw parity evidence even when a mandatory native acceptance gate rejects the run.
  if (options.report)
    await fs.writeFile(
      options.report,
      JSON.stringify(
        {
          schemaVersion: 1,
          qualified: false,
          validationPending: true,
          temporary,
          cliProvenance: marker,
          helperSha256,
          nativeSourceDigest,
          bindings,
          diagnostics,
          runs,
        },
        null,
        2
      ) + '\n'
    );
  if (!options.canonicalSmoke && options.diagnostics !== false && modes.includes('native')) {
    const native = diagnostics.filter((entry) => entry.mode === 'native');
    const required = [
      'snapshotTransactionBegin',
      'snapshotTransactionReceipt',
      'snapshotRepositoryBegin',
      'snapshotRepositoryReceipt',
      'snapshotFutureVersions',
      'snapshotAutoTag',
      'snapshotDependencyUpdates',
      'snapshotSerialize',
      'snapshotCommit',
    ];
    for (const kind of required) {
      const metrics = native.map((entry) => entry.trace.mergeState[kind]);
      assert.ok(
        metrics.some((metric) => metric?.completed > 0),
        `actual snapshot command must accept ${kind}`
      );
      assert.equal(
        metrics.reduce((sum, metric) => sum + (metric?.failed || 0), 0),
        0,
        `${kind} native failure`
      );
    }
    for (const entry of native) {
      const metrics = Object.entries(entry.trace.mergeState).filter(([kind]) => kind.startsWith('snapshot'));
      const helpers = new Set(metrics.flatMap(([, metric]) => metric.helperIds || []));
      assert.equal(helpers.size, 1, `snapshot token requests must share one pinned helper at step ${entry.step}`);
      const serialized = entry.trace.mergeState.snapshotSerialize;
      assert.equal(
        serialized.sources,
        serialized.workspaceSources + serialized.repositorySources + serialized.generatedSources,
        'every Source must have explicit provenance'
      );
      assert.equal(
        entry.trace.mergeState.snapshotCommit.dataFailed,
        0,
        'ordinary native commit must complete its filesystem steps'
      );
    }
    assert.ok(
      native.some((entry) => entry.trace.mergeState.snapshotSerialize.workspaceSources > 0),
      'real snapshot must serialize workspace Sources natively'
    );
    assert.ok(
      native.some((entry) => entry.step === 18 && entry.trace.mergeState.snapshotSerialize.artifactSources > 0),
      'actual local build must serialize capsule artifacts from native disk provenance'
    );
    assert.ok(
      native.some((entry) => entry.trace.mergeState.snapshotCommit.stepsCompleted > 0),
      'real snapshot must commit native objects'
    );
  }
  const report = {
    schemaVersion: 1,
    qualified: !options.canonicalSmoke,
    temporary,
    cliProvenance: marker,
    helperSha256,
    nativeSourceDigest,
    bindings,
    diagnostics,
    runs: options.omitStates
      ? runs.map(({ stages, ...run }) => ({
          ...run,
          stageHashes: stages.map((stage) => ({
            name: stage.name,
            hash: digest(JSON.stringify(comparisonState(stage))),
          })),
        }))
      : runs,
    indexComparison:
      'All fields and duplicate rows retained; only component/lane index row insertion order is sorted. Raw index bytes are retained.',
  };
  if (options.report) await fs.writeFile(options.report, JSON.stringify(report, null, 2) + '\n');
  return report;
}
module.exports = { runQualification };
if (require.main === module)
  runQualification(process.argv[2], process.argv[3], {
    modes: process.env.BIT_SNAPSHOT_TRANSACTION_NODE_ONLY === '1' ? ['node'] : undefined,
    canonicalSmoke: process.env.BIT_SNAPSHOT_TRANSACTION_CANONICAL_SMOKE === '1',
    report: process.env.BIT_SNAPSHOT_TRANSACTION_REPORT,
  })
    .then((report) => console.log(JSON.stringify({ temporary: report.temporary, runs: report.runs.length })))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
