const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const fixtureModule = require('./cold-recovery-fixture.cjs');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const { validateRecovery } = require('./cold-recovery-validation.cjs');
const { observe } = require('./workspace-inspection-body-read.cjs');
const { commandBackend, measurementEntries } = require('./merge-transaction-qualification.cjs');
const { measuredCommand } = require('./merge-history-measurement.cjs');
const { bindRecovery, verifyArtifacts } = require('./cold-recovery-binding.cjs');

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function runCanonicalOracle(cli, options = {}) {
  const nodeBaseline = options.nodeBaseline || 'javascript';
  assert.ok(['javascript', 'native-wrapper'].includes(nodeBaseline));
  const scenarios = fixtureModule.scenarios;
  const dimensions = { nodeBaseline, extraFiles: options.extraFiles ?? 0, scenarios: scenarios.map((row) => row.name) };
  const binding = options.qualify ? await bindRecovery(cli, options.helper, dimensions, options) : undefined;
  let proofSha256;
  if (options.measure) {
    assert.ok(binding && options.proof && !options.diagnostic && !options.scenarios && !options.modes);
    assert.ok(!options.helper.includes('/debug/'), 'release binary required for retained timings');
    const proofBytes = await fs.readFile(options.proof);
    const proof = JSON.parse(proofBytes);
    assert.equal(proof.qualified, true);
    for (const [key, value] of Object.entries(binding.metadata)) assert.deepEqual(proof[key], value, key);
    assert.deepEqual(
      proof.runs.map((run) => run.mode),
      ['node', 'native', 'missing-helper', 'crashed-helper']
    );
    for (const run of proof.runs) {
      assert.deepEqual(
        run.stages.map((stage) => stage.scenario),
        dimensions.scenarios
      );
      for (const stage of run.stages) {
        const scenario = scenarios.find((row) => row.name === stage.scenario);
        if (run.mode === 'native' && !scenario.error && !scenario.canonicalFallback) {
          assert.equal(stage.bodyObservation?.bytes, 0, 'proof must retain zero Node Source bytes');
        }
        if (run.mode === 'native' || (run.mode === 'node' && nodeBaseline === 'native-wrapper'))
          validateRecovery(
            stage.diagnostics,
            scenarios.find((row) => row.name === stage.scenario),
            { wrapper: run.mode === 'node' }
          );
      }
    }
    await verifyArtifacts(proof);
    proofSha256 = hash(proofBytes);
  }
  const temporary = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-cold-recovery-'));
  const globals = benchmarkGlobals(temporary);
  const measurements = [];
  let ordinal = 0;
  const command = async (directory, args, mode = 'node', trace, operation, clock) => {
    const helperExecutable =
      mode === 'missing-helper'
        ? path.join(temporary, 'missing-helper')
        : mode === 'crashed-helper'
          ? process.execPath
          : options.helper || 'off';
    const backend = commandBackend(mode, operation ? nodeBaseline : 'javascript', helperExecutable);
    const env = {
      ...process.env,
      ...backend.env,
      BIT_GLOBALS_DIR: globals,
      BIT_CHECKOUT_TRANSITION_QUALIFICATION_SEED: hash(args.join('\0')),
      BIT_CHECKOUT_TRANSITION_QUALIFICATION_CLOCK: clock || '1700000060000',
      BIT_CHECKOUT_TRANSITION_DISPLAY_DURATION: 'deterministic',
      CI: '',
    };
    for (const key of ['BIT_IMPORT_TRACE', 'BIT_IMPORT_TRACE_OWNER', 'NODE_OPTIONS']) delete env[key];
    if (trace) env.BIT_IMPORT_TRACE = trace;
    let executable = process.execPath;
    let argsForNode = [
      ...(backend.wrapper ? ['--require', path.join(__dirname, 'cold-command-wrapper-baseline.cjs')] : []),
      '--require',
      path.join(__dirname, 'checkout-transition-determinism.cjs'),
      ...(trace ? ['--require', path.join(__dirname, 'import-trace.cjs')] : []),
      path.join(cli, 'bin/bit.js'),
      ...args,
    ];
    if (operation && options.measure) {
      const measured = await measuredCommand(argsForNode, {
        cwd: directory,
        env,
        step: ordinal++,
        operation,
        cpuDirectory: temporary,
      });
      measurements.push(measured.measurement);
      return { code: 0, signal: null, ...measured.result };
    }
    return new Promise((resolve, reject) => {
      if (trace && process.platform === 'linux') {
        argsForNode = [
          '-f',
          '-yy',
          '-s',
          '32',
          '-e',
          'trace=read,pread64,clone,clone3,execve,prctl',
          '-o',
          trace + '.strace',
          process.execPath,
          ...argsForNode,
        ];
        executable = 'strace';
      }
      const child = cp.spawn(executable, argsForNode, { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
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
  };
  const baseline = await fixtureModule.createBaseline(cli, temporary, command, options);
  const selected = options.scenarios
    ? fixtureModule.scenarios.filter((scenario) => options.scenarios.includes(scenario.name))
    : fixtureModule.scenarios;
  assert.equal(selected.length, options.scenarios?.length || fixtureModule.scenarios.length);
  const stages = [];
  const runs = [];
  const report = {
    qualified: false,
    canonicalOnly: !options.helper,
    cli,
    temporary,
    stages,
    runs,
    ...binding?.metadata,
    proofSha256,
  };
  const expected = new Map();
  const matched = new Map();
  const entries = options.measure
    ? measurementEntries()
    : (options.modes || ['node']).map((mode) => ({ mode, round: 0, warmup: false }));
  const timed = selected.filter((scenario) => !scenario.error && !scenario.untimed && !scenario.canonicalFallback);
  for (const entry of entries) {
    const { mode } = entry;
    const runStages = [],
      measurementStart = measurements.length;
    for (const scenario of options.measure ? timed : selected) {
      const directory = path.join(temporary, 'routes', scenario.name, 'workspace');
      await fs.rm(directory, { recursive: true, force: true });
      await fs.mkdir(path.dirname(directory), { recursive: true });
      await fs.cp(baseline.directory, directory, { recursive: true, verbatimSymlinks: true });
      await fs.rm(path.join(temporary, 'remote'), { recursive: true });
      await fs.cp(baseline.pristineRemote, path.join(temporary, 'remote'), { recursive: true, verbatimSymlinks: true });
      const { original, before } = await fixtureModule.prepareRecovery(cli, directory, scenario, baseline, command);
      const args = fixtureModule.commandFor(scenario, baseline.fixture);
      const tracePath =
        !options.measure && (mode === 'native' || (mode === 'node' && nodeBaseline === 'native-wrapper'))
          ? path.join(temporary, `${mode}-${scenario.name}.trace.json`)
          : undefined;
      const result = await command(directory, args, mode, tracePath, scenario.name);
      assert.equal(result.signal, null, `${scenario.name}: command must terminate normally`);
      assert.equal(result.code, scenario.error ? 1 : 0, `${scenario.name}: ${result.stderr || result.stdout}`);
      const after = await fixtureModule.capture(cli, directory);
      const stage = { scenario: scenario.name, directory, args, original, before, after, result };
      const artifact = path.join(options.report + '.states', `${mode}-${entry.round}-${scenario.name}.json`);
      await fs.mkdir(path.dirname(artifact), { recursive: true });
      const bytes = JSON.stringify(stage);
      await fs.writeFile(artifact, bytes);
      if (options.measure) {
        const key = `${entry.round}/${scenario.name}`;
        const pair = matched.get(key) || {};
        pair[mode] = artifact;
        matched.set(key, pair);
        if (pair.node && pair.native)
          assert.deepEqual(JSON.parse(await fs.readFile(pair.node)), JSON.parse(await fs.readFile(pair.native)), key);
      } else if (mode === 'node') expected.set(scenario.name, stage);
      else assert.deepEqual(stage, expected.get(scenario.name), `${mode}/${scenario.name}: exact state and output`);
      let diagnostics, bodyObservation;
      if (tracePath) {
        diagnostics = JSON.parse(await fs.readFile(tracePath));
        validateRecovery(diagnostics, scenario, { wrapper: mode === 'node' });
        if (mode === 'native' && process.platform === 'linux') {
          const sources = [before, after].flatMap((state) =>
            Object.entries(state.roots).flatMap(([root, files]) =>
              Object.keys(files).map((name) => path.join(directory, root, name))
            )
          );
          bodyObservation = await observe(tracePath + '.strace', sources);
          if (!scenario.error && !scenario.canonicalFallback) assert.equal(bodyObservation.bytes, 0);
        }
      }
      const summary = {
        mode,
        scenario: scenario.name,
        artifact,
        sha256: hash(bytes),
        outputSha256: hash(JSON.stringify(result)),
        diagnostics,
        bodyObservation,
      };
      stages.push(summary);
      runStages.push(summary);
      await fs.writeFile(options.report, JSON.stringify(report, null, 2));
    }
    runs.push({ ...entry, stages: runStages, measurements: measurements.slice(measurementStart) });
  }
  if (options.measure) {
    assert.equal(matched.size, timed.length * 4);
    for (const pair of matched.values()) assert.ok(pair.node && pair.native);
    report.measurementScope = {
      scenarios: timed.map((row) => row.name),
      warmupPairs: 1,
      retainedPairs: 3,
      unit: 'complete CLI command',
      excludes: ['setup', 'state capture', 'tracing'],
    };
    assert.equal(hash(await fs.readFile(options.proof)), proofSha256);
  }
  if (binding) {
    await binding.verify();
    await verifyArtifacts(report);
    if (!options.diagnostic) {
      if (!options.measure)
        assert.deepEqual(
          entries.map((entry) => entry.mode),
          ['node', 'native', 'missing-helper', 'crashed-helper']
        );
      report.qualified = true;
    }
  }
  await fs.writeFile(options.report, JSON.stringify(report, null, 2));
  return report;
}

async function runQualification(cli, helper, options = {}) {
  if (!options.diagnostic) assert.equal(options.scenarios, undefined, 'final proof covers the fixed recovery corpus');
  return runCanonicalOracle(cli, {
    ...options,
    helper,
    qualify: true,
    ...(options.measure ? {} : { modes: options.modes || ['node', 'native', 'missing-helper', 'crashed-helper'] }),
  });
}

module.exports = { runCanonicalOracle, runQualification };
