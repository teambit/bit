// Real commands and all mutable state are confined to disposable qualification workspaces.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { sourceIdentity } = require('./artifacts/contract.cjs');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const { pairedEntries, measuredCommand } = require('./merge-history-measurement.cjs');
const { observe } = require('./workspace-inspection-body-read.cjs');
const { writeComponents, capture, mutate } = require('./workspace-inspection-fixture.cjs');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
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
  if (options.canonicalSmoke) assert.deepEqual(options.modes, ['node']);
  const root = path.resolve(__dirname, '../..');
  const marker = JSON.parse(await fs.readFile(path.join(cli, '.bit-object-import-build.json'), 'utf8'));
  const helperSha256 = digest(await fs.readFile(helper)),
    nativeSourceDigest = sourceIdentity(root);
  const load = createRequire(path.join(cli, 'package.json'));
  const discovery = load(path.join(path.dirname(load.resolve('@teambit/objects')), 'objects/rust-object-discovery.js'));
  const addon = discovery.resolveRustWorkspaceAddon(helper);
  const addonSha256 = addon ? digest(await fs.readFile(addon)) : undefined;
  const names = [
    'workspace-inspection-qualification.cjs',
    'workspace-inspection-fixture.cjs',
    'workspace-inspection-determinism.cjs',
    'workspace-inspection-measure.cjs',
    'workspace-inspection-body-read.cjs',
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
      assert.equal(digest(await fs.readFile(path.join(root, name))), hash, `source ${name}`);
    for (const row of marker.compiledModules)
      assert.equal(
        digest(await fs.readFile(path.join(cli, 'node_modules/@teambit', row.path))),
        row.sha256,
        `compiled ${row.path}`
      );
    for (const [name, hash] of Object.entries(bindings))
      assert.equal(digest(await fs.readFile(path.join(__dirname, name))), hash, `harness ${name}`);
    assert.equal(digest(await fs.readFile(helper)), helperSha256);
    if (addon) assert.equal(digest(await fs.readFile(addon)), addonSha256);
    if (!options.canonicalSmoke) assert.equal(sourceIdentity(root), nativeSourceDigest);
  }
  await verify();
  const temporary = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-real-workspace-inspection-'));
  const globals = benchmarkGlobals(temporary),
    runs = [],
    diagnostics = [];
  let measurements = [],
    ordinal = 0;
  async function command(directory, args, mode, operation, sourcePaths = []) {
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
      BIT_INSPECTION_QUALIFICATION_SEED: `inspection:${operation || args.join(':')}`,
      BIT_INSPECTION_QUALIFICATION_CLOCK: '1800000000000',
    };
    for (const name of [
      'BIT_RUST_OBJECT_TAR',
      'BIT_RUST_OBJECT_IMPORT_OPERATION',
      'BIT_IMPORT_TRACE',
      'BIT_IMPORT_TRACE_OWNER',
      'BIT_IMPORT_TRACE_QUERY_ONLY',
      'BIT_IMPORT_TRACE_PROTOCOL_ONLY',
      'BIT_IMPORT_TRACE_WORKSPACE_ADDON',
    ])
      delete env[name];
    const traced = Boolean(operation && mode === 'native' && options.diagnostics !== false);
    const trace = path.join(directory, `inspection-trace-${ordinal++}.json`);
    const nodeArgs = ['--require', path.join(__dirname, 'workspace-inspection-determinism.cjs')];
    if (traced) {
      env.BIT_IMPORT_TRACE = trace;
      env.BIT_IMPORT_TRACE_PROTOCOL_ONLY = '1';
      if (addon) env.BIT_IMPORT_TRACE_WORKSPACE_ADDON = addon;
      nodeArgs.push('--require', path.join(__dirname, 'import-trace.cjs'));
    }
    nodeArgs.push(path.join(cli, 'bin/bit.js'), ...args);
    const systemTrace = path.join(temporary, `body-read-${ordinal}.strace`);
    const syscallObservation = traced && process.platform === 'linux' && options.bodyObservation !== false;
    const executable = syscallObservation ? 'strace' : process.execPath;
    const observedArgs = syscallObservation
      ? [
          '-f',
          '-yy',
          '-s',
          '32',
          '-e',
          'trace=execve,clone,clone3,prctl,read,pread64',
          '-o',
          systemTrace,
          process.execPath,
          ...nodeArgs,
        ]
      : nodeArgs;
    let result;
    if (options.measure && operation && !operation.startsWith('missing-main-') && !traced) {
      const measured = await measuredCommand(nodeArgs, {
        cwd: directory,
        env,
        step: ordinal,
        operation,
        cpuDirectory: temporary,
      });
      measurements.push(measured.measurement);
      result = { ...measured.result, code: 0 };
    } else {
      result = await new Promise((resolve, reject) => {
        const child = cp.spawn(executable, observedArgs, { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '',
          stderr = '';
        const timer = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error(`${mode} ${args.join(' ')} timed out`));
        }, 120000);
        child.stdout.on('data', (bytes) => (stdout += bytes));
        child.stderr.on('data', (bytes) => (stderr += bytes));
        child.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once('close', (code) => {
          clearTimeout(timer);
          resolve({ code, stdout, stderr });
        });
      });
    }
    if (traced)
      diagnostics.push({
        operation,
        args,
        trace: JSON.parse(await fs.readFile(trace, 'utf8')),
        bodyReads: syscallObservation ? await observe(systemTrace, sourcePaths) : undefined,
      });
    return result;
  }
  const entries = pairedEntries(options.rounds || 1, options.modes).filter(
    (entry) => !(options.measure && options.diagnostics === false && entry.fallback)
  );
  for (const entry of entries) {
    const { mode } = entry;
    measurements = [];
    const directory = path.join(temporary, `${mode}-${entry.warmup ? 'warmup' : entry.round}`, 'inspection-workspace');
    await fs.mkdir(directory, { recursive: true });
    for (const args of [['init', '--skip-interactive', '--default-scope', 'qualification.inspection']]) {
      const result = await command(directory, args, 'node');
      assert.equal(result.code, 0, result.stderr);
    }
    const scopeFile = path.join(directory, '.bit/scope.json'),
      scope = JSON.parse(await fs.readFile(scopeFile, 'utf8'));
    scope.name = 'qualification.inspection';
    await fs.writeFile(scopeFile, JSON.stringify(scope));
    await fs.writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: 'workspace-inspection-qualification', private: true })
    );
    await writeComponents(directory, Number(options.extraFiles || 0));
    for (const name of ['alpha', 'beta']) {
      const result = await command(directory, ['add', name, '--id', name, '--main', 'index.js'], 'node');
      assert.equal(result.code, 0, result.stderr);
    }
    for (const args of [
      ['link'],
      [
        'tag',
        '--ver',
        '1.0.0',
        '--message',
        'inspection baseline',
        '--soft',
        '--disable-tag-pipeline',
        '--ignore-issues',
        '*',
      ],
    ]) {
      const result = await command(directory, args, 'node');
      assert.equal(result.code, 0, result.stdout + result.stderr);
    }
    const persisted = await command(
      directory,
      ['tag', '--persist=skip-build', '--disable-tag-pipeline', '--ignore-issues', '*'],
      'node'
    );
    assert.equal(persisted.code, 0, persisted.stdout + persisted.stderr);
    const stages = [];
    for (const phase of ['clean', 'eol', 'config', 'content', 'inventory', 'missing-main']) {
      if (phase !== 'clean') await mutate(directory, phase);
      const before = await capture(directory),
        outputs = {};
      const sourcePaths = Object.keys(before.workingFiles)
        .filter((name) => !name.endsWith('/component.json'))
        .map((name) => path.join(directory, name));
      for (const [hash, object] of Object.entries(before.objects))
        if (object.type === 'Source')
          sourcePaths.push(path.join(directory, '.bit/objects', hash.slice(0, 2), hash.slice(2)));
      for (const [name, args] of [
        ['mini', ['mini-status', '--json']],
        ['status', ['status', '--json']],
        ['diff', ['diff', '--json']],
      ]) {
        const result = await command(directory, args, mode, `${phase}-${name}`, sourcePaths);
        outputs[name] = { code: result.code, stdout: result.stdout, stderr: result.stderr };
        if (phase !== 'missing-main')
          assert.equal(result.code, 0, `${mode} ${phase} ${name}: ${result.stdout}\n${result.stderr}`);
      }
      if (phase === 'clean' || phase === 'eol' || phase === 'config') {
        assert.deepEqual(
          JSON.parse(outputs.mini.stdout).modified,
          [],
          `${phase}: mini-status checks only Source files`
        );
        const modified = JSON.parse(outputs.status.stdout).modifiedComponents;
        assert.deepEqual(
          modified,
          phase === 'config' ? ['qualification.inspection/beta'] : [],
          `${phase}: full status distinguishes metadata-only changes`
        );
        if (phase === 'config')
          assert.ok(
            outputs.diff.stdout.includes('inspection-dependency'),
            'public diff must expose dependency metadata'
          );
      }
      const after = await capture(directory);
      stages.push({ phase, outputs, before, after });
      if (options.report && !options.omitStates)
        await fs.writeFile(
          options.report,
          JSON.stringify(
            {
              qualified: false,
              validationPending: true,
              temporary,
              cliProvenance: marker,
              helperSha256,
              nativeSourceDigest,
              bindings,
              runs,
              currentRun: { ...entry, stages },
              diagnostics,
            },
            null,
            2
          ) + '\n'
        );
    }
    await verify();
    if (runs.length)
      assert.deepEqual(comparisonState(stages), comparisonState(runs[0].stages), `${mode} exact inspection parity`);
    runs.push({ ...entry, stages, measurements });
  }
  if (options.diagnostics !== false && entries.some((entry) => entry.mode === 'native')) {
    assert.ok(
      diagnostics.some((entry) => entry.trace.workspace.inventoryFinish?.completed > 0),
      'actual commands must complete native inventory'
    );
    if (addon) {
      assert.ok(
        diagnostics.some(
          (entry) => entry.operation === 'eol-status' && entry.trace.workspace.statusResult?.completed > 0
        ),
        'the warm ordinary full-status command must complete without Harmony'
      );
      for (const kind of ['dependencyCacheRead', 'dependencyCacheFreshness']) {
        assert.ok(
          diagnostics.some((entry) => entry.trace.workspace[kind].completed > 0),
          `actual commands must consume native ${kind}`
        );
        assert.equal(
          diagnostics.reduce((sum, entry) => sum + entry.trace.workspace[kind].failed, 0),
          0,
          `ordinary commands must not decline ${kind}`
        );
      }
      assert.ok(
        diagnostics.some((entry) => entry.trace.workspace.dependencyCacheRead.hits > 0),
        'actual commands must receive native dependency cache hits'
      );
    }
    const kinds = ['inspectionBegin', 'inspectionFiles', 'inspectionCompare', 'inspectionDiff', 'inspectionFinish'];
    for (const kind of kinds) {
      if (!addon || kind !== 'inspectionFiles')
        assert.ok(
          diagnostics.some((entry) => entry.trace.mergeState[kind].completed > 0),
          `actual commands must accept ${kind}`
        );
      assert.equal(
        diagnostics.reduce((sum, entry) => sum + entry.trace.mergeState[kind].failed, 0),
        0,
        `${kind} must not fail in the ordinary Native lane`
      );
    }
    for (const entry of diagnostics) {
      assert.equal(entry.trace.frameworkObservation, 'disabled', 'observation must preserve public class guards');
      if (addon)
        assert.ok(
          entry.trace.workspaceFrames.every((frame) => frame.backend === 'addon'),
          'packaged inspection must use the addon'
        );
      if (!entry.operation.endsWith('-mini')) {
        assert.ok(entry.trace.workspace.inventoryFinish.completed > 0, `${entry.operation}: native inventory required`);
        assert.equal(entry.trace.workspace.inventoryBegin.failed + entry.trace.workspace.inventoryFinish.failed, 0);
        assert.equal(entry.trace.workspace.scan.frames, 0, `${entry.operation}: no legacy scan/filter continuation`);
      }
      const coldMini = Boolean(addon && entry.operation.endsWith('-mini'));
      const coldFull = Boolean(
        addon && entry.operation.endsWith('-status') && entry.trace.workspace.statusResult?.completed
      );
      const coldStatus = coldMini || coldFull;
      if (coldMini) {
        for (const kind of ['statusPrepare', 'statusScan', 'statusFinish', 'statusComplete']) {
          assert.ok(entry.trace.workspace[kind].completed > 0, `${entry.operation}: ${kind} must own the command`);
          assert.equal(entry.trace.workspace[kind].failed, 0);
        }
        assert.equal(entry.trace.workspace.statusPrepare.frames, 1);
        assert.equal(entry.trace.workspace.statusComplete.frames, 1);
        assert.equal(new Set(entry.trace.workspaceFrames.map((frame) => frame.helperId)).size, 1);
        assert.deepEqual(entry.trace.loadedCommandModels, [], 'cold status must not hydrate Node workspace/models');
      }
      if (coldFull) {
        for (const kind of ['statusContext', 'dependencyPolicyCached', 'statusCompare', 'statusResult']) {
          assert.ok(entry.trace.workspace[kind].completed > 0, `${entry.operation}: ${kind} must own full status`);
          assert.equal(entry.trace.workspace[kind].failed, 0);
        }
        assert.equal(new Set(entry.trace.workspaceFrames.map((frame) => frame.helperId)).size, 1);
        assert.deepEqual(entry.trace.loadedCommandModels, [], 'cold full status must not load Node workspace/models');
        if (process.platform === 'linux') {
          assert.ok(entry.bodyReads, 'Linux body-read evidence is mandatory');
          assert.equal(entry.bodyReads.bytes, 0, 'cold full status must not read Source files on JavaScript/libuv');
          assert.ok(entry.bodyReads.rustBytes > 0, 'native workers must own full-status Source reads');
        }
      }
      const metrics = entry.trace.mergeState;
      const operationHelpers = new Set(kinds.flatMap((kind) => metrics[kind].helperIds));
      assert.equal(
        operationHelpers.size,
        coldStatus ? 0 : 1,
        `${entry.operation}: all inspection requests, including semantic Compare, must share one command owner`
      );
      const starts = new Map(metrics.inspectionBegin.tokens.map((row) => [row.token, row.helperId]));
      for (const kind of ['inspectionFiles', 'inspectionDiff', 'inspectionFinish'])
        for (const row of metrics[kind].tokens)
          assert.equal(
            row.helperId,
            starts.get(row.token),
            `${entry.operation}: retained token must use the same pinned helper`
          );
      for (const token of starts.keys())
        assert.ok(
          metrics.inspectionFinish.tokens.some((row) => row.token === token),
          `${entry.operation}: retained token must finish before command escapes`
        );
      for (const kind of kinds)
        assert.equal(
          metrics[kind].sourceBodyBytes,
          0,
          `${entry.operation}: private protocol must not inline Source bodies`
        );
      if (entry.operation.endsWith('-mini')) {
        if (!coldStatus) {
          for (const kind of ['inspectionBegin', 'inspectionFiles', 'inspectionFinish'])
            assert.ok(metrics[kind].completed > 0, `${entry.operation}: snapshot file summary must be Native`);
          assert.ok(metrics.inspectionBegin.snapshotBytes > 0);
        }
        if (addon) assert.equal(metrics.inspectionBegin.spooledFiles, 0, 'addon mini-status must retain bytes in Rust');
        if (process.platform === 'linux') {
          assert.ok(entry.bodyReads, 'Linux body-read evidence is mandatory');
          assert.equal(
            entry.bodyReads.bytes,
            0,
            `${entry.operation}: JavaScript/libuv must not read Source files/spools`
          );
          if (addon)
            assert.ok(entry.bodyReads.rustBytes > 0, 'named native workers must account for captured Source reads');
        }
      }
    }
    for (const phase of ['config', 'content', 'inventory'])
      assert.ok(
        diagnostics.some(
          (entry) => entry.operation === `${phase}-diff` && entry.trace.mergeState.inspectionDiff.completed > 0
        ),
        `${phase}: real public diff must use the retained Native engine`
      );
    const betaModel = Object.values(runs[0].stages[0].before.objects).find(
      (object) => object.type === 'Component' && object.body.name === 'beta'
    );
    const betaVersion = runs[0].stages[0].before.objects[betaModel.body.versions['1.0.0']];
    const betaHash = betaVersion.body.files.find((file) => file.relativePath === 'index.js').file;
    assert.ok(
      diagnostics.some(
        (entry) =>
          entry.operation === 'config-status' &&
          (entry.trace.mergeState.inspectionCompare.modelHashes.includes(betaHash) ||
            (entry.trace.workspace.statusResult?.completed > 0 &&
              entry.trace.workspace.statusCompare.identities.includes('qualification.inspection/beta')))
      ),
      'metadata-only dependent comparison must accept beta, not merely an unrelated unchanged component'
    );
    for (const phase of ['config', 'content', 'inventory']) {
      const diff = diagnostics.find((entry) => entry.operation === `${phase}-diff`);
      assert.equal(diff.trace.mergeState.inspectionBegin.spooledFiles, 0, 'diff must not spool caller-owned sources');
    }
    options.validateNative?.(diagnostics);
  }
  await verify();
  const report = {
    qualified: !options.canonicalSmoke,
    temporary,
    cliProvenance: marker,
    helperSha256,
    addonSha256,
    nativeSourceDigest,
    bindings,
    diagnostics,
    workload: { components: 2, workspaceSources: 4 + 2 * Number(options.extraFiles || 0) },
    runs: options.omitStates
      ? runs.map(({ stages, ...run }) => ({
          ...run,
          stageHashes: stages.map((stage) => ({
            phase: stage.phase,
            hash: digest(JSON.stringify(comparisonState(stage))),
          })),
        }))
      : runs,
    bodyReadContract:
      'Cold mini-status and full status read zero Source files/spools on JavaScript/libuv threads; named Rust workers, canonical fallback and public diff content are reported separately.',
    indexComparison:
      'All fields/duplicates compared; component/lane index row insertion order only sorted. Raw bytes retained.',
  };
  if (options.report) await fs.writeFile(options.report, JSON.stringify(report, null, 2) + '\n');
  return report;
}
module.exports = { runQualification };
