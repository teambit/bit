const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { sourceIdentity } = require('./artifacts/contract.cjs');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const fixtureModule = require('./history-reset-fixture.cjs');
const { validateHistoryResetDiagnostics } = require('./history-reset-validation.cjs');
const { pairedEntries, measuredCommand } = require('./merge-history-measurement.cjs');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Only the documented pre-existing scope-index insertion order is normalized.
function comparable(state) {
  if (!state.index) return state;
  const index = JSON.parse(Buffer.from(state.index, 'hex').toString());
  for (const name of ['components', 'lanes'])
    if (Array.isArray(index[name])) index[name].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { ...state, index };
}

async function runQualification(cli, helper, options = {}) {
  cli = path.resolve(cli);
  helper = path.resolve(helper);
  assert.ok(cli.startsWith(os.tmpdir() + path.sep), 'physically compiled private CLI required');
  if (options.canonicalSmoke) assert.deepEqual(options.modes, ['node']);
  if (options.diagnostics === false && !options.canonicalSmoke)
    assert.equal(
      options.measure,
      true,
      'Native acceptance diagnostics may only be disabled for proof-bound measurements'
    );
  const repository = path.resolve(__dirname, '../..');
  const marker = JSON.parse(await fs.readFile(path.join(cli, '.bit-object-import-build.json')));
  const helperSha256 = hash(await fs.readFile(helper));
  const nativeSourceDigest = sourceIdentity(repository);
  const fixtureDimensions = {
    extraFiles: options.extraFiles || 0,
    scenarios: fixtureModule.scenarios
      .filter((item) => !options.scenarios || options.scenarios.includes(item.name))
      .map((item) => item.name),
  };
  const harnessNames = [
    'history-reset-qualification.cjs',
    'history-reset-fixture.cjs',
    'checkout-transition-fixture.cjs',
    'history-reset-determinism.cjs',
    'history-reset-fault.cjs',
    'history-reset-validation.cjs',
    'checkout-qualification.cjs',
    'import-trace.cjs',
    'history-reset-measure.cjs',
    'merge-history-measurement.cjs',
    '../rust-dependency-analysis/process-tree-memory.cjs',
    '../rust-dependency-analysis/process-tree-memory-control.cjs',
  ];
  const bindings = Object.fromEntries(
    await Promise.all(harnessNames.map(async (name) => [name, hash(await fs.readFile(path.join(__dirname, name)))]))
  );
  let priorProof, proofSha256;
  if (options.measure && options.diagnostics === false) {
    assert.ok(options.proof, 'diagnostics-off measurements require a completed matching Native acceptance proof');
    const bytes = await fs.readFile(options.proof);
    priorProof = JSON.parse(bytes);
    proofSha256 = hash(bytes);
    assert.equal(priorProof.qualified, true);
    assert.equal(priorProof.helperSha256, helperSha256);
    assert.equal(priorProof.nativeSourceDigest, nativeSourceDigest);
    assert.deepEqual(priorProof.bindings, bindings, 'measurements must use the exact qualified harness');
    assert.deepEqual(priorProof.cliProvenance, marker, 'measurements must use the exact qualified source/compiled CLI');
    assert.deepEqual(
      priorProof.fixtureDimensions,
      fixtureDimensions,
      'measurements require the exact qualified Source scale and scenario selection'
    );
  }
  async function verify() {
    if (!options.canonicalSmoke) {
      for (const [name, expected] of Object.entries(marker.sourceSha256))
        assert.equal(hash(await fs.readFile(path.join(repository, name))), expected, `source ${name}`);
      assert.equal(sourceIdentity(repository), nativeSourceDigest);
    }
    for (const module of marker.compiledModules)
      assert.equal(
        hash(await fs.readFile(path.join(cli, 'node_modules/@teambit', module.path))),
        module.sha256,
        module.path
      );
    for (const [name, expected] of Object.entries(bindings))
      assert.equal(hash(await fs.readFile(path.join(__dirname, name))), expected, name);
    assert.equal(hash(await fs.readFile(helper)), helperSha256);
    if (proofSha256)
      assert.equal(hash(await fs.readFile(options.proof)), proofSha256, 'retained correctness proof changed');
  }
  await verify();
  const temporary = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-history-reset-'));
  const globals = benchmarkGlobals(temporary);
  const fixture = await fixtureModule.createFixture(cli, path.join(temporary, 'remote'), options);
  const load = createRequire(path.join(cli, 'package.json'));
  const jsonc = load('comment-json');
  const env = { ...process.env, BIT_GLOBALS_DIR: globals, CI: '1', BIT_RUST_CLIENT_VCS: 'off' };
  for (const name of [
    'BIT_RUST_OBJECT_TAR',
    'BIT_RUST_OBJECT_IMPORT_OPERATION',
    'BIT_IMPORT_TRACE',
    'BIT_IMPORT_TRACE_OWNER',
  ])
    delete env[name];
  delete env.BIT_CHECKOUT_TRANSITION_DISPLAY_DURATION;
  const diagnostics = [];
  const measurements = [];
  let commandOrdinal = 0;
  async function command(directory, args, mode = 'node', trace, operation, fault, expectedError = false) {
    const executable =
      mode === 'missing-helper'
        ? path.join(temporary, 'missing-helper')
        : mode === 'crashed-helper'
          ? process.execPath
          : helper;
    const nodeArgs = [
      '--require',
      path.join(__dirname, 'history-reset-determinism.cjs'),
      path.join(cli, 'bin/bit.js'),
      ...args,
    ];
    if (trace) nodeArgs.unshift('--require', path.join(__dirname, 'import-trace.cjs'));
    if (fault) nodeArgs.unshift('--require', path.join(__dirname, 'history-reset-fault.cjs'));
    const commandEnv = {
      ...env,
      // Compare ordinary client output. CI adds implementation-specific async stack frames to errors.
      // The disposable global config already disables analytics and error reporting.
      CI: '',
      BIT_RUST_CLIENT_VCS: mode === 'node' ? 'off' : 'on',
      BIT_RUST_OBJECT_IMPORT: executable,
      BIT_HISTORY_RESET_PRIVATE_CLI: cli,
      BIT_HISTORY_RESET_PERSIST_FAULT: fault ? 'after-unmerged-write' : '',
      BIT_CHECKOUT_TRANSITION_QUALIFICATION_SEED: hash(args.join('\0')),
      BIT_CHECKOUT_TRANSITION_QUALIFICATION_CLOCK: '1700000000000',
      BIT_CHECKOUT_TRANSITION_DISPLAY_DURATION: 'deterministic',
      ...(trace ? { BIT_IMPORT_TRACE: trace } : {}),
    };
    let result;
    if (options.measure && operation && !trace && !expectedError) {
      const measured = await measuredCommand(nodeArgs, {
        cwd: directory,
        env: commandEnv,
        step: commandOrdinal++,
        operation,
        cpuDirectory: temporary,
      });
      result = { code: 0, signal: null, ...measured.result };
      measurements.push(measured.measurement);
    } else
      result = await new Promise((resolve, reject) => {
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
    if (trace)
      diagnostics.push({
        scenario: operation || 'conflict-rejected',
        args,
        result,
        trace: JSON.parse(await fs.readFile(trace)),
      });
    return result;
  }
  async function successful(directory, args) {
    const result = await command(directory, args);
    assert.equal(result.code, 0, result.stderr || result.stdout);
  }
  const baseline = path.join(temporary, 'baseline');
  await fs.mkdir(baseline);
  await successful(baseline, ['init', '--skip-interactive', '--default-scope', 'qualification.destination']);
  const scopeFile = path.join(baseline, '.bit/scope.json');
  const scope = JSON.parse(await fs.readFile(scopeFile));
  scope.remotes = fixture.remotes;
  scope.name = 'qualification.destination';
  await fs.writeFile(scopeFile, JSON.stringify(scope));
  await fs.writeFile(
    path.join(baseline, 'package.json'),
    JSON.stringify({ name: 'checkout-transition-qualification', private: true, type: 'module' })
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
  const baselineStatus = await command(baseline, ['status', '--json']);
  assert.equal(baselineStatus.code, 0, baselineStatus.stderr);
  assert.deepEqual(
    JSON.parse(baselineStatus.stdout).modifiedComponents,
    [],
    'both imported component Versions must start canonically clean'
  );
  const bitmap = (directory) => fs.readFile(path.join(directory, '.bitmap'), 'utf8').then((text) => jsonc.parse(text));
  const entries = await bitmap(baseline);
  const entryFor = (entries, name) =>
    Object.values(entries).find(
      (entry) => entry && typeof entry === 'object' && entry.rootDir && entry.name === name
    ) || Object.entries(entries).find(([key, entry]) => key.endsWith('/' + name) && entry?.rootDir)?.[1];
  const componentEntry = entryFor(entries, 'component'),
    dependencyEntry = entryFor(entries, 'dependency');
  assert.ok(componentEntry && dependencyEntry, 'both genuine imported components must be tracked');
  const roots = [componentEntry.rootDir, dependencyEntry.rootDir];
  const runs = [];
  const runEntries = options.measure
    ? pairedEntries(options.rounds || 3, options.modes).filter(
        (entry) => options.diagnostics !== false || !entry.fallback
      )
    : (options.modes || ['node', 'native', 'missing-helper', 'crashed-helper']).map((mode) => ({ mode, round: 0 }));
  for (let entryIndex = 0; entryIndex < runEntries.length; entryIndex++) {
    const entry = runEntries[entryIndex];
    const { mode } = entry;
    const measurementStart = measurements.length;
    const stages = [];
    for (const scenario of fixtureModule.scenarios.filter(
      (item) => !options.scenarios || options.scenarios.includes(item.name)
    )) {
      const directory = path.join(temporary, `${mode}-${entryIndex}`, scenario.name, 'workspace');
      await fs.mkdir(path.dirname(directory), { recursive: true });
      await fs.cp(baseline, directory, { recursive: true, dereference: false, verbatimSymlinks: true });
      await fixtureModule.prepare(directory, roots, scenario, successful, cli);
      const scenarioRoots = scenario.neverExported ? [...roots, 'new-component'] : roots;
      const before = await fixtureModule.capture(directory, scenarioRoots);
      const trace =
        mode === 'native' && options.diagnostics !== false
          ? path.join(temporary, `${mode}-${entryIndex}-${scenario.name}-trace.json`)
          : undefined;
      const result = await command(
        directory,
        scenario.command,
        mode,
        trace,
        scenario.name,
        scenario.writeFailure,
        scenario.error
      );
      if (options.report)
        await fs.writeFile(
          options.report + '.progress',
          JSON.stringify(
            { qualified: false, temporary, scenario: scenario.name, before: comparable(before), result, runs, stages },
            null,
            2
          )
        );
      assert.equal(result.signal, null);
      assert.equal(result.code, scenario.error ? 1 : 0, scenario.name + ': ' + (result.stderr || result.stdout));
      if (scenario.error) assert.match(result.stderr + result.stdout, new RegExp(scenario.errorText || 'dependent'));
      else assert.match(result.stdout, /successfully/);
      const after = await fixtureModule.capture(directory, scenarioRoots);
      fixtureModule.assertWorkspaceBytesPreserved(before, after);
      if (scenario.writeFailure)
        assert.deepEqual(
          JSON.parse(Buffer.from(after.persistFault, 'hex').toString()),
          { calls: 1 },
          'public persistence fault callback must run once'
        );
      if (scenario.writeFailure) {
        assert.notDeepEqual(
          after.objects,
          before.objects,
          'object persistence prefix must complete before callback failure'
        );
        assert.equal(after.bitmap, before.bitmap, 'failed persistence must not execute the later bitmap write');
      }
      const status = await command(directory, ['status', '--json'], mode);
      stages.push({
        scenario: scenario.name,
        args: scenario.command,
        result,
        status,
        before: comparable(before),
        after: comparable(after),
        rawIndex: { before: before.index, after: after.index },
      });
    }
    if (runs.length) {
      if (options.report)
        await fs.writeFile(
          options.report + '.partial',
          JSON.stringify({ qualified: false, temporary, diagnostics, runs: [...runs, { mode, stages }] }, null, 2)
        );
      const comparableStages = (items) => items.map(({ rawIndex, ...stage }) => stage);
      assert.deepEqual(
        comparableStages(stages),
        comparableStages(runs[0].stages),
        `${mode} exact history-reset command/error/partial-state parity`
      );
    }
    runs.push({ ...entry, stages, measurements: measurements.slice(measurementStart) });
  }
  const acceptance = options.canonicalSmoke
    ? undefined
    : priorProof
      ? priorProof.acceptance
      : validateHistoryResetDiagnostics(diagnostics);
  await verify();
  const report = {
    qualified: !options.canonicalSmoke,
    fixtureDimensions,
    temporary,
    cliProvenance: marker,
    helperSha256,
    nativeSourceDigest,
    bindings,
    diagnostics,
    acceptance,
    proofSha256,
    comparison:
      'Exact raw public outputs, object bodies, bitmap/config/history/pending/workspace state; only scope-index component/lane row order is compared semantically, with raw index bytes retained.',
    actualWorkspaceSourceFiles: Object.values(runs[0].stages[0].before.roots).reduce(
      (count, files) => count + Object.keys(files).length,
      0
    ),
    runs,
  };
  if (options.omitStates)
    for (const run of report.runs)
      run.stages = run.stages.map((stage) => ({
        scenario: stage.scenario,
        sha256: hash(JSON.stringify(stage)),
        rawIndex: stage.rawIndex,
      }));
  if (options.report) await fs.writeFile(options.report, JSON.stringify(report, null, 2) + '\n');
  return report;
}
module.exports = { runQualification };
