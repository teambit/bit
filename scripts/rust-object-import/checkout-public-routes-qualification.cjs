const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { sourceIdentity } = require('./artifacts/contract.cjs');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const fixtureModule = require('./checkout-transition-fixture.cjs');
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
  const harnessNames = [
    'checkout-public-routes-qualification.cjs',
    'checkout-transition-fixture.cjs',
    'checkout-public-routes-determinism.cjs',
    'checkout-qualification.cjs',
    'import-trace.cjs',
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
  const temporary = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-checkout-transition-'));
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
  let measurements,
    commandOrdinal = 0;
  async function command(directory, args, mode = 'node', trace, operation) {
    const executable =
      mode === 'missing-helper'
        ? path.join(temporary, 'missing-helper')
        : mode === 'crashed-helper'
          ? process.execPath
          : helper;
    const nodeArgs = [
      '--require',
      path.join(__dirname, 'checkout-public-routes-determinism.cjs'),
      path.join(cli, 'bin/bit.js'),
      ...args,
    ];
    if (trace) nodeArgs.unshift('--require', path.join(__dirname, 'import-trace.cjs'));
    const commandEnv = {
      ...env,
      // Compare ordinary client output. CI adds implementation-specific async stack frames to errors.
      // The disposable global config already disables analytics and error reporting.
      CI: '',
      BIT_RUST_CLIENT_VCS: mode === 'node' ? 'off' : 'on',
      BIT_RUST_OBJECT_IMPORT: executable,
      BIT_CHECKOUT_TRANSITION_QUALIFICATION_SEED: hash(args.join('\0')),
      BIT_CHECKOUT_TRANSITION_QUALIFICATION_CLOCK: '1700000000000',
      BIT_CHECKOUT_TRANSITION_DISPLAY_DURATION: 'deterministic',
      ...(trace ? { BIT_IMPORT_TRACE: trace } : {}),
    };
    let result;
    if (options.measure && operation && !trace) {
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
  const routes = ['stash-clean', 'stash-manual', 'latest', 'head', 'ancestor', 'main'];
  const runs = [];
  for (const mode of options.modes || ['node', 'native', 'missing-helper', 'crashed-helper']) {
    const stages = [];
    for (const route of routes) {
      const directory = path.join(temporary, mode, route, 'workspace');
      await fs.mkdir(path.dirname(directory), { recursive: true });
      await fs.cp(baseline, directory, { recursive: true, dereference: false, verbatimSymlinks: true });
      const stable = path.join(directory, componentEntry.rootDir, 'stable.txt');
      let args;
      if (route.startsWith('stash')) {
        await fs.writeFile(stable, 'from stash\nsecond\nthird\n');
        await successful(directory, ['stash', 'save']);
        assert.ok((await fs.readdir(path.join(directory, '.bit/stash'))).some((name) => name.endsWith('.json')));
        if (route === 'stash-manual') await fs.writeFile(stable, 'from local\nsecond\nthird\n');
        args = ['stash', 'load', ...(route === 'stash-manual' ? ['--manual'] : [])];
      } else if (route === 'main') {
        await successful(directory, ['lane', 'create', 'qualification-lane', '--scope', 'qualification.destination']);
        await fs.writeFile(stable, 'divergent lane snap\nsecond\nthird\n');
        await successful(directory, [
          'snap',
          'component',
          '--message',
          'lane route target',
          '--disable-snap-pipeline',
          '--ignore-issues',
          '*',
        ]);
        args = ['checkout', 'main', fixture.id, '--skip-dependency-installation'];
      } else {
        await fs.writeFile(stable, 'untagged snap\nsecond\nthird\n');
        await successful(directory, [
          'snap',
          'component',
          '--message',
          'public route target',
          '--disable-snap-pipeline',
          '--ignore-issues',
          '*',
        ]);
        await successful(directory, ['checkout', '1.0.0', fixture.id, '--skip-dependency-installation']);
        args = ['checkout', route === 'ancestor' ? 'head~1' : route, fixture.id, '--skip-dependency-installation'];
      }
      const before = await fixtureModule.capture(directory, roots);
      const trace = mode === 'native' ? path.join(temporary, `${mode}-${route}-trace.json`) : undefined;
      const result = await command(directory, args, mode, trace, route);
      assert.equal(result.code, 0, result.stderr || result.stdout);
      const after = await fixtureModule.capture(directory, roots);
      const text = await fs.readFile(stable, 'utf8');
      if (route === 'stash-clean') assert.ok(text.startsWith('from stash\n'));
      if (route === 'stash-manual') {
        assert.ok(text.includes('<<<<<<<') && text.includes('from stash') && text.includes('from local'));
      }
      if (route.startsWith('stash')) {
        assert.equal(after.bitmap, before.bitmap, 'stash load preserves bitmap version');
        assert.equal(
          (await fs.readdir(path.join(directory, '.bit/stash'))).filter((name) => name.endsWith('.json')).length,
          0
        );
      } else {
        const current = entryFor(await bitmap(directory), 'component').version;
        if (route === 'head') {
          assert.match(current, /^[a-f0-9]{40}$/);
          assert.ok(text.startsWith('untagged snap\n'));
        } else assert.equal(current, '1.0.1');
      }
      stages.push({ route, args, result, before: comparable(before), after: comparable(after) });
    }
    if (runs.length) {
      if (options.report)
        await fs.writeFile(
          options.report + '.partial',
          JSON.stringify({ qualified: false, temporary, runs: [...runs, { mode, stages }], diagnostics }, null, 2)
        );
      assert.deepEqual(stages, runs[0].stages, `${mode} exact public route parity`);
    }
    runs.push({ mode, stages });
  }
  if (runs.some((run) => run.mode === 'native'))
    for (const row of diagnostics) {
      const metrics = row.trace.mergeState;
      for (const kind of [
        'checkoutSelectBegin',
        'checkoutApplyDecision',
        'checkoutPrepare',
        'checkoutMaterialize',
        'checkoutFinish',
      ])
        assert.ok(metrics[kind].completed > 0, `${row.scenario} ${kind} accepted`);
      if (row.scenario.startsWith('stash'))
        assert.ok(metrics.checkoutApply.completed > 0, 'stash modified apply accepted');
      assert.ok(metrics.checkoutMaterialize.stepsCompleted > 0, `${row.scenario} actual retained writes`);
      const owned = row.trace.workspaceFrames.filter(
        (frame) =>
          ['BWP1', 'BWC0', 'BWC1', 'BCK1', 'BMH1'].includes(frame.magic) ||
          (frame.magic === 'BMT1' && (frame.kind.startsWith('checkout') || frame.kind.startsWith('inspection')))
      );
      assert.equal(new Set(owned.map((frame) => frame.helperId)).size, 1, `${row.scenario} pinned checkout owner`);
      for (const kind of Object.keys(metrics).filter((kind) => kind.startsWith('checkout'))) {
        assert.equal(metrics[kind].failed, 0);
        assert.equal(metrics[kind].dataFailed, 0);
        assert.equal(metrics[kind].sourceBodyBytes, 0);
      }
    }
  await verify();
  const report = {
    qualified: !options.canonicalSmoke,
    temporary,
    cliProvenance: marker,
    helperSha256,
    nativeSourceDigest,
    bindings,
    diagnostics,
    runs,
  };
  if (options.report) await fs.writeFile(options.report, JSON.stringify(report, null, 2) + '\n');
  return report;
}
module.exports = { runQualification };
