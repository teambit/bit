const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { sourceIdentity } = require('./artifacts/contract.cjs');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const fixtureModule = require('./merge-transaction-fixture.cjs');
const { validateMergeTransactionDiagnostics } = require('./merge-transaction-validation.cjs');
const { comparableMergeStdout, comparableVersionHistory } = require('./merge-transaction-report.cjs');
const { pairedEntries, measuredCommand } = require('./merge-history-measurement.cjs');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function localRuntimeDependencies(entries) {
  const pending = entries.map((name) => path.resolve(__dirname, name)),
    seen = new Set();
  while (pending.length) {
    const filename = pending.pop();
    if (seen.has(filename)) continue;
    assert.ok(
      filename.startsWith(path.resolve(__dirname, '..') + path.sep),
      'harness dependency must remain in scripts'
    );
    seen.add(filename);
    const body = await fs.readFile(filename, 'utf8');
    for (const match of body.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      const base = path.resolve(path.dirname(filename), match[1]);
      let resolved;
      for (const candidate of [base, base + '.cjs', base + '.js', base + '.json', path.join(base, 'index.cjs')]) {
        try {
          if ((await fs.stat(candidate)).isFile()) {
            resolved = candidate;
            break;
          }
        } catch (error) {
          if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
        }
      }
      assert.ok(resolved, `unresolved local harness dependency ${filename}: ${match[1]}`);
      pending.push(resolved);
    }
  }
  return [...seen].map((filename) => path.relative(__dirname, filename)).sort();
}

function comparable(state, concurrentHistory = false) {
  if (concurrentHistory)
    state = {
      ...state,
      objects: Object.fromEntries(
        Object.entries(state.objects).map(([key, value]) => [key, comparableVersionHistory(value)])
      ),
    };
  if (!state.index) return state;
  const index = JSON.parse(Buffer.from(state.index, 'hex').toString());
  for (const key of ['components', 'lanes'])
    if (Array.isArray(index[key])) index[key].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { ...state, index };
}

function comparableStage(stage) {
  const scenario = fixtureModule.scenarios.find((item) => item.name === stage.scenario);
  const concurrentFileRows =
    scenario &&
    !scenario.hidden &&
    !scenario.unrelated &&
    !scenario.detachHead &&
    scenario.topology !== 'deletion' &&
    (scenario.topology !== 'fast-forward' || scenario.noSnap);
  return {
    ...stage,
    before: comparable(stage.before, stage.scenario === 'main-into-lane-clean'),
    after: comparable(stage.after, stage.scenario === 'main-into-lane-clean'),
    result: concurrentFileRows ? { ...stage.result, stdout: comparableMergeStdout(stage.result.stdout) } : stage.result,
  };
}

function validateMeasurementProof(proof, expected) {
  assert.equal(proof.qualified, true);
  assert.equal(proof.baselineOnly, false);
  assert.deepEqual(proof.modeCoverage, ['node', 'native', 'missing-helper', 'crashed-helper']);
  assert.deepEqual(
    proof.runs.map((run) => run.mode),
    proof.modeCoverage
  );
  for (const key of ['helperSha256', 'nativeSourceDigest', 'bindings', 'cliProvenance', 'fixtureDimensions'])
    assert.deepEqual(proof[key], expected[key], key);
  for (const run of proof.runs)
    assert.deepEqual(
      run.stages.map((stage) => stage.scenario),
      expected.fixtureDimensions.scenarios
    );
}

function measurementEntries() {
  return pairedEntries(3).filter((entry) => !entry.fallback);
}

function timedScenarios(scenarios) {
  return scenarios
    .filter(
      (scenario) => !scenario.error && !scenario.canonicalError && !scenario.promptCancellation && !scenario.untimed
    )
    .map((scenario) => scenario.name);
}

async function runQualification(cli, helper, options = {}) {
  cli = path.resolve(cli);
  helper = path.resolve(helper);
  assert.ok(cli.startsWith(os.tmpdir() + path.sep), 'physically compiled private CLI required');
  if (options.canonicalSmoke)
    assert.deepEqual(options.modes, ['node'], 'unqualified prerequisite smoke must remain Node-only');
  if (options.diagnostics === false)
    assert.equal(options.measure, true, 'diagnostics-off requires proof-bound measurement');
  if (options.measure) {
    assert.equal(options.canonicalSmoke, undefined);
    assert.equal(options.diagnostics, false);
    assert.equal(
      options.scenarios,
      undefined,
      'measurement route selection is fixed by the complete acceptance corpus'
    );
    assert.equal(options.modes, undefined, 'retained pairs require alternating Node/native order');
    assert.equal(options.rounds || 3, 3, 'one warmup and three retained pairs required');
  }
  const fixtureDimensions = {
    extraFiles: options.extraFiles || 0,
    scenarios: fixtureModule.scenarios
      .filter((item) => !options.scenarios || options.scenarios.includes(item.name))
      .map((item) => item.name),
  };
  const repository = path.resolve(__dirname, '../..');
  const marker = JSON.parse(await fs.readFile(path.join(cli, '.bit-object-import-build.json')));
  const helperSha256 = hash(await fs.readFile(helper));
  const nativeSourceDigest = sourceIdentity(repository);
  const names = await localRuntimeDependencies([
    'merge-transaction-qualification.cjs',
    'merge-transaction-measure.cjs',
    'merge-history-measurement.cjs',
    '../rust-dependency-analysis/process-tree-memory.cjs',
    '../rust-dependency-analysis/process-tree-memory-control.cjs',
    'merge-transaction-fixture.cjs',
    'merge-transaction-validation.cjs',
    'merge-transaction-determinism.cjs',
    'merge-transaction-fault.cjs',
    'merge-transaction-measure.cjs',
    'history-reset-determinism.cjs',
    'checkout-transition-fixture.cjs',
    'checkout-qualification.cjs',
    'import-trace.cjs',
    'artifacts/contract.cjs',
    '../rust-dependency-analysis/command-workspace.cjs',
  ]);
  const bindings = Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, hash(await fs.readFile(path.join(__dirname, name)))]))
  );
  let priorProof, proofSha256;
  if (options.measure) {
    assert.ok(options.proof, 'completed four-mode acceptance proof required');
    const bytes = await fs.readFile(options.proof);
    priorProof = JSON.parse(bytes);
    proofSha256 = hash(bytes);
    validateMeasurementProof(priorProof, {
      helperSha256,
      nativeSourceDigest,
      bindings,
      cliProvenance: marker,
      fixtureDimensions,
    });
    for (const run of priorProof.runs) {
      assert.deepEqual(
        run.stages.map((stage) => stage.scenario),
        fixtureDimensions.scenarios
      );
      for (const stage of run.stages) {
        assert.equal(hash(await fs.readFile(stage.artifact)), stage.sha256);
        if (stage.faultArtifact)
          assert.equal(hash(await fs.readFile(stage.faultArtifact.artifact)), stage.faultArtifact.sha256);
        if (run.mode === 'native') {
          assert.ok(stage.diagnostics, 'proof must retain Native acceptance for every route');
          validateMergeTransactionDiagnostics(
            stage.diagnostics,
            fixtureModule.scenarios.find((scenario) => scenario.name === stage.scenario)
          );
        }
      }
    }
  }
  async function verify() {
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(cli, '.bit-object-import-build.json'))), marker);
    if (!options.canonicalSmoke)
      for (const [name, expected] of Object.entries(marker.sourceSha256))
        assert.equal(hash(await fs.readFile(path.join(repository, name))), expected, name);
    for (const item of marker.compiledModules)
      assert.equal(hash(await fs.readFile(path.join(cli, 'node_modules/@teambit', item.path))), item.sha256, item.path);
    for (const [name, expected] of Object.entries(bindings))
      assert.equal(hash(await fs.readFile(path.join(__dirname, name))), expected, name);
    assert.equal(hash(await fs.readFile(helper)), helperSha256);
    if (proofSha256) {
      assert.equal(hash(await fs.readFile(options.proof)), proofSha256);
      for (const run of priorProof.runs)
        for (const stage of run.stages) {
          assert.equal(hash(await fs.readFile(stage.artifact)), stage.sha256);
          if (stage.faultArtifact)
            assert.equal(hash(await fs.readFile(stage.faultArtifact.artifact)), stage.faultArtifact.sha256);
        }
    }
    if (!options.canonicalSmoke) assert.equal(sourceIdentity(repository), nativeSourceDigest);
  }
  await verify();
  const temporary = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-merge-transaction-'));
  const globals = benchmarkGlobals(temporary);
  const fixture = await fixtureModule.createFixture(cli, path.join(temporary, 'remote'), options);
  const remotePristine = path.join(temporary, 'remote-pristine');
  await fs.cp(path.join(temporary, 'remote'), remotePristine, { recursive: true, verbatimSymlinks: true });
  const load = createRequire(path.join(cli, 'package.json'));
  const env = { ...process.env, BIT_GLOBALS_DIR: globals, CI: '', BIT_RUST_CLIENT_VCS: 'off' };
  for (const name of [
    'BIT_RUST_OBJECT_TAR',
    'BIT_RUST_OBJECT_IMPORT_OPERATION',
    'BIT_IMPORT_TRACE',
    'BIT_IMPORT_TRACE_OWNER',
    'BIT_IMPORT_TRACE_QUERY_ONLY',
    'BIT_IMPORT_TRACE_PROTOCOL_ONLY',
    'BIT_MERGE_TRANSACTION_FAULT_CLI',
    'BIT_MERGE_TRANSACTION_FAULT_REPORT',
    'BIT_MERGE_TRANSACTION_FAULT_KIND',
    'BIT_MERGE_TRANSACTION_FAULT_PHASE',
  ])
    delete env[name];
  const measurements = [];
  let commandOrdinal = 0;
  async function command(directory, args, mode = 'node', trace, operation, expectedError = false, fault) {
    const message = args[args.indexOf('--message') + 1];
    const snapshot = typeof message === 'string' ? /^query snapshot (\d+)/.exec(message) : undefined;
    const clock =
      1700000000000 +
      (typeof message === 'string' && message.startsWith('query tied snapshot')
        ? 70000
        : snapshot
          ? (Number(snapshot[1]) + 2) * 10000
          : message === 'query tag above snaps'
            ? 40000
            : message === 'query lane child'
              ? 50000
              : 60000);
    const executable =
      mode === 'missing-helper'
        ? path.join(temporary, 'absent-helper')
        : mode === 'crashed-helper'
          ? process.execPath
          : helper;
    const nodeArgs = [
      '--require',
      path.join(__dirname, 'merge-transaction-determinism.cjs'),
      ...(args[0] === '__api' ? args.slice(1) : [path.join(cli, 'bin/bit.js'), ...args]),
    ];
    if (trace) nodeArgs.unshift('--require', path.join(__dirname, 'import-trace.cjs'));
    if (fault) nodeArgs.unshift('--require', path.join(__dirname, 'merge-transaction-fault.cjs'));
    const commandEnv = {
      ...env,
      BIT_RUST_CLIENT_VCS: mode === 'node' ? 'off' : 'on',
      BIT_RUST_OBJECT_IMPORT: executable,
      BIT_CHECKOUT_TRANSITION_QUALIFICATION_SEED: hash(args.join('\0')),
      BIT_CHECKOUT_TRANSITION_QUALIFICATION_CLOCK: String(clock),
      BIT_CHECKOUT_TRANSITION_DISPLAY_DURATION: 'deterministic',
      ...(trace ? { BIT_IMPORT_TRACE: trace, BIT_IMPORT_TRACE_PROTOCOL_ONLY: '1' } : {}),
      ...(fault
        ? {
            BIT_MERGE_TRANSACTION_FAULT_CLI: cli,
            BIT_MERGE_TRANSACTION_FAULT_REPORT: fault.report,
            BIT_MERGE_TRANSACTION_FAULT_KIND: fault.kind,
            BIT_MERGE_TRANSACTION_FAULT_PHASE: fault.phase || '',
          }
        : {}),
    };
    if (options.measure && operation && !expectedError && !trace) {
      const measured = await measuredCommand(nodeArgs, {
        cwd: directory,
        env: commandEnv,
        step: commandOrdinal++,
        operation,
        cpuDirectory: temporary,
      });
      measurements.push(measured.measurement);
      return { code: 0, signal: null, ...measured.result };
    }
    return new Promise((resolve, reject) => {
      const child = cp.spawn(process.execPath, nodeArgs, {
        cwd: directory,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: commandEnv,
      });
      let stdout = '',
        stderr = '';
      child.stdout.on('data', (bytes) => {
        stdout += bytes;
      });
      child.stderr.on('data', (bytes) => {
        stderr += bytes;
      });
      const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal, stdout, stderr });
      });
    });
  }
  const successful = async (directory, args) => {
    const result = await command(directory, args);
    assert.equal(result.code, 0, result.stderr || result.stdout);
  };
  const baseline = path.join(temporary, 'baseline');
  await fs.mkdir(baseline);
  await successful(baseline, ['init', '--skip-interactive', '--default-scope', 'qualification.destination']);
  const scopePath = path.join(baseline, '.bit/scope.json');
  const scope = JSON.parse(await fs.readFile(scopePath));
  scope.remotes = fixture.remotes;
  scope.name = 'qualification.destination';
  await fs.writeFile(scopePath, JSON.stringify(scope));
  await fs.writeFile(
    path.join(baseline, 'package.json'),
    JSON.stringify({ name: 'merge-transaction-qualification', private: true, type: 'module' })
  );
  await successful(baseline, [
    'import',
    `${fixture.dependencyId}@1.0.0`,
    `${fixture.id}@1.0.1`,
    '--all-history',
    '--skip-dependency-installation',
    '--override',
    '--safe-mode',
  ]);
  await successful(baseline, ['link']);
  const bitmap = load('comment-json').parse(await fs.readFile(path.join(baseline, '.bitmap'), 'utf8'));
  const roots = ['component', 'dependency'].map(
    (name) => Object.values(bitmap).find((entry) => entry?.name === name)?.rootDir
  );
  assert.ok(roots.every(Boolean), 'both imported roots required');

  const baselineState = await fixtureModule.capture(baseline, roots);
  const sourceInventory = (state) =>
    Object.entries(state.roots)
      .flatMap(([root, files]) =>
        Object.entries(files)
          .filter(([, value]) => typeof value.bytes === 'string')
          .map(([file]) => `${root}/${file}`)
      )
      .sort();
  const workspaceSourceFiles = sourceInventory(baselineState);
  const actualWorkspaceSourceFiles = workspaceSourceFiles.length;
  assert.ok(actualWorkspaceSourceFiles > 0, 'real captured workspace Sources required');
  const baselineSourceBytesSha256 = hash(JSON.stringify(baselineState.roots));
  const scenarios = fixtureModule.scenarios.filter(
    (item) => !options.scenarios || options.scenarios.includes(item.name)
  );
  if (priorProof) {
    assert.equal(actualWorkspaceSourceFiles, priorProof.actualWorkspaceSourceFiles);
    assert.deepEqual(workspaceSourceFiles, priorProof.workspaceSourceFiles);
    assert.equal(baselineSourceBytesSha256, priorProof.baselineSourceBytesSha256);
  }
  const modes = options.modes || ['node', 'native', 'missing-helper', 'crashed-helper'];
  assert.equal(modes[0], 'node', 'canonical raw baseline must run first');
  if (!options.canonicalSmoke) assert.ok(modes.includes('native'), 'qualification requires actual native acceptance');
  const rawDirectory = path.resolve(options.report ? options.report + '.states' : path.join(temporary, 'states'));
  assert.ok(!rawDirectory.startsWith(repository + path.sep));
  await fs.mkdir(rawDirectory, { recursive: true });
  const canonical = new Map(),
    runs = [],
    matched = new Map();
  const entries = options.measure ? measurementEntries() : modes.map((mode) => ({ mode, round: 0, warmup: false }));
  const timedNames = timedScenarios(scenarios);
  const executedScenarios = options.measure
    ? scenarios.filter((scenario) => timedNames.includes(scenario.name))
    : scenarios;
  for (const entry of entries) {
    const { mode } = entry;
    const measurementStart = measurements.length;
    const stages = [];
    for (const scenario of executedScenarios) {
      // Preserve absolute paths in canonical errors by reusing one owned path.
      const directory = path.join(temporary, 'routes', scenario.name, 'workspace');
      assert.ok(directory.startsWith(temporary + path.sep));
      await fs.rm(directory, { recursive: true, force: true });
      await fs.mkdir(path.dirname(directory), { recursive: true });
      await fs.cp(baseline, directory, { recursive: true, verbatimSymlinks: true });
      // Public export prerequisites may advance this owned remote. Reset its exact seed for each independent route.
      await fs.rm(path.join(temporary, 'remote'), { recursive: true, force: true });
      await fs.cp(remotePristine, path.join(temporary, 'remote'), { recursive: true, verbatimSymlinks: true });
      if (fixtureModule.prepareScenario)
        await fixtureModule.prepareScenario(
          directory,
          scenario,
          { root: path.join(directory, roots[0]), dependencyRoot: path.join(directory, roots[1]) },
          fixture,
          command,
          cli
        );
      const before = await fixtureModule.capture(directory, roots);
      if (scenario.built) fixtureModule.assertBuiltArtifacts(before);
      if (scenario.hidden || scenario.unrelated) {
        /* The actual hidden route imports only the visible leaf; inventory is reported per stage. */
      } else if (scenario.target === 'component')
        assert.equal(
          sourceInventory(before).length,
          actualWorkspaceSourceFiles,
          'component branch has exact fixture Source count'
        );
      else if (scenario.topology !== 'deletion')
        assert.deepEqual(sourceInventory(before), workspaceSourceFiles, 'scenario Source scale');
      const tracePath =
        mode === 'native' && options.diagnostics !== false
          ? path.join(temporary, `${scenario.name}.trace.json`)
          : undefined;
      const faultPath = scenario.fault ? path.join(temporary, `${mode}-${scenario.name}.fault.json`) : undefined;
      const result = await command(
        directory,
        fixtureModule.commandFor(scenario, fixture),
        mode,
        tracePath,
        scenario.name,
        Boolean(scenario.error || scenario.canonicalError || scenario.promptCancellation || scenario.untimed),
        scenario.fault ? { ...scenario.fault, report: faultPath } : undefined
      );
      assert.equal(result.signal, null);
      assert.equal(result.code, scenario.error || scenario.canonicalError ? 1 : 0, result.stderr || result.stdout);
      if (scenario.errorText) assert.match(result.stdout + result.stderr, new RegExp(scenario.errorText));
      if (scenario.fault && mode === 'native') {
        const triggered = JSON.parse(await fs.readFile(faultPath));
        assert.equal(triggered.kind, scenario.fault.kind, 'actual configured receipt loss must trigger');
        if (scenario.fault.phase) assert.equal(triggered.phase, scenario.fault.phase);
        assert.equal(triggered.acknowledgedByHelper, true);
      }
      const after = await fixtureModule.capture(directory, roots);
      if (scenario.resolveUnrelated === 'ours')
        assert.deepEqual(after.roots, before.roots, 'unrelated ours preserves actual current workspace bytes');
      if (scenario.built) fixtureModule.assertBuiltArtifacts(after);
      if (scenario.hidden) require('./merge-transaction-hidden-fixture.cjs').assertHiddenMerge(before, after);

      let abort;
      if (scenario.abort) {
        const result = await command(
          directory,
          ['lane', 'merge-abort', '--skip-dependency-installation', '--silent'],
          mode
        );
        assert.equal(result.code, 0, result.stderr || result.stdout);
        abort = { result, state: await fixtureModule.capture(directory, roots) };
        assert.deepEqual(abort.state.roots, before.roots, 'public abort restores actual working files');
        assert.equal(abort.state.bitmap, before.bitmap, 'public abort restores bitmap exactly');
      }
      const stage = {
        scenario: scenario.name,
        actualWorkspaceSourceFiles: sourceInventory(before).length,
        ...(abort ? { abort } : {}),
        result,
        before,
        after,
      };
      // Persist full evidence before either parity or acceptance can reject the stage.
      const artifact = path.join(
        rawDirectory,
        `${mode}-${entry.warmup ? 'warmup' : entry.round}-${scenario.name}.json`
      );
      const bytes = JSON.stringify(stage);
      await fs.writeFile(artifact, bytes);
      if (mode === 'node') canonical.set(scenario.name, stage);
      else if (!options.measure)
        assert.deepEqual(
          comparableStage(stage),
          comparableStage(canonical.get(scenario.name)),
          `${mode}/${scenario.name}: raw state and canonical report fields`
        );
      if (options.measure) {
        const key = `${entry.warmup ? 'warmup' : entry.round}/${scenario.name}`;
        const pair = matched.get(key) || {};
        pair[mode] = artifact;
        matched.set(key, pair);
        if (pair.node && pair.native) {
          const other = JSON.parse(await fs.readFile(pair[mode === 'node' ? 'native' : 'node']));
          assert.deepEqual(comparableStage(stage), comparableStage(other), key);
        }
      }
      const diagnostics = tracePath ? JSON.parse(await fs.readFile(tracePath)) : undefined;
      if (diagnostics) validateMergeTransactionDiagnostics(diagnostics, scenario);
      const faultArtifact =
        scenario.fault && mode === 'native'
          ? { artifact: faultPath, sha256: hash(await fs.readFile(faultPath)) }
          : undefined;
      stages.push({
        scenario: scenario.name,
        ...(faultArtifact ? { faultArtifact } : {}),
        artifact,
        sha256: hash(bytes),
        outputSha256: hash(JSON.stringify(result)),
        diagnostics,
      });
      if (options.report)
        await fs.writeFile(options.report + '.partial', JSON.stringify({ qualified: false, temporary, runs, stages }));
    }
    runs.push({ ...entry, stages, measurements: measurements.slice(measurementStart) });
  }
  await verify();
  for (const run of runs)
    for (const stage of run.stages) {
      assert.equal(hash(await fs.readFile(stage.artifact)), stage.sha256);
      if (stage.faultArtifact)
        assert.equal(hash(await fs.readFile(stage.faultArtifact.artifact)), stage.faultArtifact.sha256);
    }
  if (options.measure) {
    assert.equal(matched.size, executedScenarios.length * 4);
    for (const pair of matched.values())
      assert.ok(pair.node && pair.native, 'both members of every matched pair required');
    const timed = timedScenarios(scenarios);
    for (const run of runs)
      assert.deepEqual(
        run.measurements.map((sample) => sample.operation),
        timed
      );
  }
  const report = {
    qualified: !options.canonicalSmoke,
    comparison:
      'Raw artifacts retained; repository index entries, adjacent concurrent added/updated CLI rows, and complete VersionHistory rows in main-into-lane-clean are compared as multisets; all other output and state remain exact',
    proofSha256,
    measurementScope: options.measure
      ? {
          unit: 'complete CLI command',
          includes: ['Node', 'helper', 'Git descendants', 'CLI formatting'],
          scenarios: timedNames,
          excludes: [
            'fixture setup',
            'state capture and parity assertions',
            'expected-error and supplementary untimed routes',
          ],
          warmupPairs: 1,
          retainedPairs: 3,
        }
      : undefined,
    baselineOnly: Boolean(options.canonicalSmoke),
    temporary,
    cliProvenance: marker,
    helperSha256,
    nativeSourceDigest,
    actualWorkspaceSourceFiles,
    workspaceSourceFiles,
    baselineSourceBytesSha256,
    bindings,
    modeCoverage: modes,
    nativeExpectations: Object.fromEntries(
      scenarios.map((scenario) => [scenario.name, scenario.nativeExpectation || 'owned-merge-transaction'])
    ),
    fixtureDimensions,
    runs,
  };
  if (options.report) await fs.writeFile(options.report, JSON.stringify(report, null, 2));
  return report;
}

module.exports = {
  runQualification,
  comparable,
  localRuntimeDependencies,
  supportsMeasurement: true,
  validateMeasurementProof,
  measurementEntries,
  timedScenarios,
};
if (require.main === module)
  runQualification(process.argv[2], process.argv[3], { report: process.argv[4] })
    .then(() => console.log('merge-transaction qualification passed'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
