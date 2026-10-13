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

function checkoutOwnsFrame(frame) {
  if (
    frame.magic === 'BWS1' &&
    [
      'dependencyScan',
      'dependencyResolve',
      'dependencyGraph',
      'dependencyCacheRead',
      'dependencyCacheFreshness',
    ].includes(frame.kind)
  )
    return false;
  return (
    ['BWS1', 'BWP1', 'BWC0', 'BWC2', 'BWC1', 'BCK1', 'BMH1'].includes(frame.magic) ||
    (frame.magic === 'BMT1' && (frame.kind.startsWith('checkout') || frame.kind.startsWith('inspection')))
  );
}

function declinedPreflightOwners(frames) {
  const readOnly = new Set([
    'commandPrepare',
    'inventoryBegin',
    'inventoryFinish',
    'dependencyDetectFresh',
    'dependencyPolicyDetected',
    'commandPlan',
  ]);
  return new Set(
    frames
      .filter((frame) => frame.magic === 'BWS1' && frame.kind === 'commandPrepare')
      .map((frame) => frame.helperId)
      .filter((helperId) => {
        const owned = frames.filter((frame) => frame.helperId === helperId);
        if (owned.some((frame) => frame.receipt?.applied)) return false;
        if (owned.every((frame) => frame.magic === 'BWS1' && frame.kind === 'commandPrepare')) return true;
        return (
          owned.at(-1)?.receipt?.failed === true &&
          owned.filter((frame) => frame.receipt?.failed).length === 1 &&
          owned.every(
            (frame) =>
              frame.magic === 'BWS1' &&
              readOnly.has(frame.kind) &&
              frame.receipt &&
              !frame.receipt.applied &&
              (frame.kind !== 'commandPlan' || frame.receipt.failed)
          )
        );
      })
  );
}

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
    'checkout-transition-qualification.cjs',
    'checkout-transition-fixture.cjs',
    'checkout-transition-determinism.cjs',
    'checkout-transition-measure.cjs',
    'merge-history-measurement.cjs',
    '../rust-dependency-analysis/process-tree-memory.cjs',
    '../rust-dependency-analysis/process-tree-memory-control.cjs',
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
      path.join(__dirname, 'checkout-transition-determinism.cjs'),
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
  // A newly created local lane still resolves its scope during checkout history lookup.
  // Keep that lookup inside the disposable fixture instead of contacting bit.cloud.
  const destinationRemote = path.join(temporary, 'destination-remote');
  const { Scope } = load('@teambit/legacy.scope');
  const destination = await Scope.ensure(destinationRemote, 'qualification.destination');
  await destination.ensureDir();
  Scope.scopeCache = {};
  scope.remotes = { ...fixture.remotes, 'qualification.destination': `file://${destinationRemote}` };
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
  const schedule = pairedEntries(Number(options.rounds || 1), options.modes).filter(
    (entry) => !(options.measure && options.diagnostics === false && entry.fallback)
  );
  const runs = [];
  let baselineStages, workloadScenarios;
  for (const { mode, round, warmup = false, fallback = false } of schedule) {
    measurements = [];
    const stages = [];
    for (const scenario of fixtureModule.scenarios(fixture.id)) {
      const directory = path.join(temporary, `${mode}-${warmup ? 'warmup' : round}`, scenario.name, 'workspace');
      await fs.mkdir(path.dirname(directory), { recursive: true });
      await fs.cp(baseline, directory, { recursive: true, dereference: false, verbatimSymlinks: true });
      const componentRoot = scenario.workspaceRoot ? '.' : componentEntry.rootDir;
      if (scenario.workspaceRoot) {
        await fixtureModule.markWorkspaceRoot(cli, directory, fixture.versionRefs);
        const map = await bitmap(directory);
        entryFor(map, 'component').rootDir = '.';
        await fs.writeFile(path.join(directory, '.bitmap'), jsonc.stringify(map, null, 2));
        for (const name of Object.keys(fixture.definitions[1]))
          await fs.rename(path.join(directory, componentEntry.rootDir, name), path.join(directory, name));
        await fs.rm(path.join(directory, componentEntry.rootDir), { recursive: true });
        await fs.writeFile(path.join(directory, 'unrelated-root.txt'), 'must survive root reset\n');
      }
      if (scenario.lane)
        await successful(directory, ['lane', 'create', 'qualification-lane', '--scope', 'qualification.destination']);
      if (scenario.prepare) await successful(directory, scenario.prepare);
      if (scenario.mutation) await fixtureModule.mutate(path.join(directory, componentRoot), scenario.mutation);
      const scenarioRoots = [componentRoot, dependencyEntry.rootDir];
      const before = await fixtureModule.capture(directory, scenarioRoots);
      const trace =
        mode === 'native' && !warmup && round === 0 && options.diagnostics !== false
          ? path.join(temporary, `${mode}-${scenario.name}-trace.json`)
          : undefined;
      const result = await command(directory, scenario.args, mode, trace, scenario.failure ? undefined : scenario.name);
      assert.equal(result.code === 0, !scenario.failure, `${scenario.name}: ${result.stderr || result.stdout}`);
      const after = await fixtureModule.capture(directory, scenarioRoots);
      assert.deepEqual(
        after.roots[dependencyEntry.rootDir],
        before.roots[dependencyEntry.rootDir],
        'checkout must not write its dependency files'
      );
      const afterBitmap = await bitmap(directory);
      assert.deepEqual(
        entryFor(afterBitmap, 'dependency'),
        entryFor(await bitmap(baseline), 'dependency'),
        'dependency bitmap identity/version remains unchanged'
      );
      if (scenario.version) assert.equal(entryFor(afterBitmap, 'component').version, scenario.version);
      if (scenario.name === 'revert-keeps-version')
        assert.equal(after.bitmap, before.bitmap, 'revert preserves exact bitmap bytes');
      const mainBytes = after.roots[componentRoot]['index.js']?.bytes;
      if (scenario.failure) {
        assert.ok(
          result.stdout.includes('automatic merge has failed') || result.stderr.includes('automatic merge has failed')
        );
        assert.deepEqual(
          after.roots,
          before.roots,
          'this isolated conflict fork has no restoration prefix and performs no writer effect'
        );
        assert.equal(after.bitmap, before.bitmap);
      } else if (scenario.strategy === 'manual') {
        const body = Buffer.from(mainBytes, 'hex').toString();
        assert.ok(body.includes('<<<<<<< 1.0.1 modified\n'));
        assert.ok(body.includes('=======\n'));
        assert.ok(body.includes('>>>>>>> 1.0.0\n'));
      } else if (scenario.strategy === 'ours') {
        assert.equal(
          mainBytes,
          before.roots[componentRoot]['index.js'].bytes,
          'ours retains current Source bytes while updating selected version'
        );
      } else {
        const version = scenario.contentsVersion || scenario.version;
        const expected = fixture.definitions[version === '1.0.0' ? 0 : 1];
        for (const [name, bytes] of Object.entries(expected)) {
          if (name === 'stable.txt' && scenario.mutation?.startsWith('stable-')) continue;
          assert.equal(
            after.roots[componentRoot][name]?.bytes,
            load('@teambit/toolbox.string.eol').auto(bytes).toString('hex'),
            `${scenario.name}/${name}`
          );
        }
      }
      if (scenario.mutation === 'stable-delete')
        assert.equal(
          after.roots[componentRoot]['stable.txt'],
          undefined,
          'head retains unchanged locally deleted file'
        );
      if (scenario.mutation === 'stable-edit')
        assert.equal(
          after.roots[componentRoot]['stable.txt'].bytes,
          before.roots[componentRoot]['stable.txt'].bytes,
          'nonconflicting edit survives checkout'
        );
      if (scenario.workspaceRoot) {
        // A genuine root component owns discovered ordinary root files: canonical reset removes this one.
        await assert.rejects(fs.stat(path.join(directory, 'unrelated-root.txt')), { code: 'ENOENT' });
        assert.equal(after.config, before.config);
        assert.ok(await fs.stat(path.join(directory, '.bit/objects')));
      }
      stages.push({ scenario: scenario.name, result, before, after });
    }
    if (baselineStages)
      assert.deepEqual(
        stages.map((row) => ({ ...row, before: comparable(row.before), after: comparable(row.after) })),
        baselineStages.map((row) => ({ ...row, before: comparable(row.before), after: comparable(row.after) })),
        `${mode} exact commands/state parity`
      );
    baselineStages ||= stages;
    workloadScenarios ||= stages.map((stage) => ({
      scenario: stage.scenario,
      beforeInventory: Object.fromEntries(
        Object.entries(stage.before.roots).map(([root, files]) => [root, Object.keys(files).length])
      ),
      afterInventory: Object.fromEntries(
        Object.entries(stage.after.roots).map(([root, files]) => [root, Object.keys(files).length])
      ),
    }));
    runs.push({
      mode,
      round,
      warmup,
      fallback,
      measurements,
      ...(options.omitStates
        ? {
            stages: stages.map(({ scenario, result, before, after }) => ({
              scenario,
              result,
              beforeSha256: hash(JSON.stringify(comparable(before))),
              afterSha256: hash(JSON.stringify(comparable(after))),
            })),
          }
        : { stages }),
    });
    await verify();
  }
  if (!options.canonicalSmoke && options.diagnostics !== false) {
    const kinds = [
      'checkoutSelectBegin',
      'checkoutSelectReceipt',
      'checkoutApplyDecision',
      'checkoutPrepare',
      'checkoutRemovals',
      'checkoutApply',
      'checkoutMaterialize',
      'checkoutFinish',
    ];
    const cold = (row) => row.trace.workspace.commandApply?.applied > 0;
    for (const row of diagnostics.filter(cold)) {
      assert.deepEqual(row.trace.loadedCommandModels, [], `${row.scenario}: cold ownership avoids canonical models`);
      assert.equal(row.trace.objectTypes?.Source || 0, 0, `${row.scenario}: no Node Source parsing`);
      for (const kind of ['commandPrepare', 'commandPlan', 'commandFinalize', 'commandApply'])
        assert.equal(row.trace.workspace[kind]?.sourceBodyBytes || 0, 0, `${row.scenario}/${kind}: metadata only`);
      assert.ok(row.trace.workspaceFrames.some((frame) => frame.kind === 'commandPlan'));
    }
    for (const kind of kinds) {
      assert.ok(
        diagnostics.some((row) => row.trace.mergeState[kind]?.completed > 0) ||
          (kind === 'checkoutApply' &&
            ['head-preserves-local-edit', 'head-preserves-local-deletion', 'conflict-manual', 'conflict-theirs'].every(
              (scenario) => {
                const row = diagnostics.find((entry) => entry.scenario === scenario);
                return row && cold(row) && row.trace.workspace.commandApply.completed > 0;
              }
            )),
        `actual commands must accept ${kind}`
      );
      for (const row of diagnostics) {
        assert.equal(row.trace.mergeState[kind]?.failed || 0, 0, `${kind} must not silently decline`);
        assert.equal(
          row.trace.mergeState[kind]?.sourceBodyBytes || 0,
          0,
          `${kind} must not return Source bodies to Node for private RPC`
        );
      }
    }
    for (const row of diagnostics) {
      const frames = row.trace.workspaceFrames;
      const preflightOwners = declinedPreflightOwners(frames);
      // A declined cold preflight has no accepted plan, apply, finalize or publication frames.
      // Every frame of the subsequent canonical transaction still has one owner.
      row.declinedColdPreflight = frames.filter((frame) => preflightOwners.has(frame.helperId));
      const owned = frames.filter((frame) => !preflightOwners.has(frame.helperId) && checkoutOwnsFrame(frame));
      assert.equal(
        new Set(owned.map((frame) => frame.helperId)).size,
        1,
        `${row.args.join(' ')} must use one pinned engine across checkout, inspection, merge and persistence`
      );
      for (const kind of kinds) {
        const metric = row.trace.mergeState[kind];
        if (metric?.dataFailed !== undefined) assert.equal(metric.dataFailed, 0, `${kind} effects must complete`);
      }
    }
    assert.ok(
      diagnostics.some(
        (row) =>
          (cold(row) && row.trace.workspace.commandApply.completed > 0) ||
          row.trace.mergeState.checkoutMaterialize.stepsCompleted > 0
      ),
      'positive ACK alone is insufficient: actual retained Sources must be written'
    );
    const retainedWriteScenarios = ['clean-old', 'reset-edited-deleted', 'reset-workspace-root'];
    for (const scenario of retainedWriteScenarios) {
      const row = diagnostics.find((entry) => entry.scenario === scenario);
      assert.ok(row, `${scenario} must retain its actual Native command diagnostic`);
      if (cold(row)) {
        assert.ok(row.trace.workspace.commandApply.completed > 0, `${scenario}: accepted apply must write files`);
        continue;
      }
      assert.ok(
        row.trace.mergeState.checkoutPrepare.completed > 0,
        `${scenario} cannot pass entirely through canonical preparation`
      );
      assert.ok(
        row.trace.mergeState.checkoutPrepare.snapshotBytes > 0,
        `${scenario} must retain verified Source bodies privately`
      );
      assert.ok(row.trace.mergeState.checkoutMaterialize.completed > 0, `${scenario} must accept the retained writer`);
      assert.ok(
        row.trace.mergeState.checkoutMaterialize.stepsCompleted > 0,
        `${scenario} must actually persist retained Sources`
      );
      assert.ok(row.trace.mergeState.checkoutFinish.completed > 0, `${scenario} must close its retained plan`);
    }
    const ours = diagnostics.find((row) => row.scenario === 'conflict-ours');
    if (!cold(ours)) {
      assert.ok(ours?.trace.mergeState.checkoutSelectBegin.completed > 0, 'ours still uses Native selection');
      assert.ok(
        ours?.trace.mergeState.checkoutApplyDecision.completed > 0,
        'ours must accept its early apply decision'
      );
      const oursDecision = ours.trace.workspaceFrames.findIndex((frame) => frame.kind === 'checkoutApplyDecision');
      assert.ok(oursDecision >= 0);
      assert.ok(
        !ours.trace.workspaceFrames.slice(oursDecision + 1).some((frame) => frame.kind === 'checkoutPrepare'),
        'ours may detect conflicts first but must not reload a target plan after its early apply decision'
      );
      assert.equal(
        ours.trace.mergeState.checkoutMaterialize.frames,
        0,
        'ours retains existing Sources without target writes'
      );
    }
    const conflict = diagnostics.find((row) => row.scenario === 'conflict-rejected');
    assert.ok(
      conflict?.trace.mergeState.checkoutPrepare.completed > 0,
      'default conflict is detected from the retained merge plan'
    );
    assert.equal(
      conflict.trace.mergeState.checkoutMaterialize.frames,
      0,
      'default conflict error precedes writer effects'
    );
    assert.equal(
      conflict.trace.mergeState.checkoutRemovals.frames,
      0,
      'this conflict fork rejects before apply-removal effects'
    );
    options.validateNative?.(diagnostics);
  }
  await verify();
  const report = {
    qualified: !options.canonicalSmoke,
    temporary,
    cliProvenance: marker,
    helperSha256,
    nativeSourceDigest,
    bindings,
    proof: proofSha256 ? { path: path.resolve(options.proof), sha256: proofSha256 } : undefined,
    diagnostics,
    runs,
    workload: {
      componentFiles: fixture.definitions.map((files) => Object.keys(files).length),
      dependencyFiles: 1,
      rootAdditionalFiles: 3,
      scenarios: workloadScenarios,
    },
    bodyContract:
      'Retained target and merged Sources use metadata-only engine RPCs; canonical current-component loading and legitimate public error/diff content remain distinct.',
  };
  if (options.report) await fs.writeFile(options.report, JSON.stringify(report, null, 2) + '\n');
  return report;
}
module.exports = { runQualification, checkoutOwnsFrame, declinedPreflightOwners };
