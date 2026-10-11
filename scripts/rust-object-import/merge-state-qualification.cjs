const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const { seedUnrelatedLane } = require('./merge-state-fixture.cjs');
const { createMergeFixture } = require('./merge-history-fixture.cjs');
const { pairedEntries, measuredCommand } = require('./merge-history-measurement.cjs');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function runQualification(cliRoot, helper, options = {}) {
  cliRoot = path.resolve(cliRoot);
  helper = path.resolve(helper);
  assert.ok(cliRoot.startsWith('/tmp/') || cliRoot.startsWith(os.tmpdir() + path.sep), 'private CLI required');
  const repository = path.resolve(__dirname, '../..');
  const marker = JSON.parse(await fs.readFile(path.join(cliRoot, '.bit-object-import-build.json'), 'utf8'));
  const helperSha256 = digest(await fs.readFile(helper));
  const bindings = Object.fromEntries(
    await Promise.all(
      [
        'merge-state-qualification.cjs',
        'merge-history-fixture.cjs',
        'merge-state-fixture.cjs',
        'merge-state-determinism.cjs',
        'merge-history-measurement.cjs',
        'import-trace.cjs',
      ].map(async (filename) => [filename, digest(await fs.readFile(path.join(__dirname, filename)))])
    )
  );
  async function verify() {
    if (options.verifySources !== false)
      for (const [filename, sha] of Object.entries(marker.sourceSha256))
        assert.equal(digest(await fs.readFile(path.join(repository, filename))), sha, filename);
    for (const entry of marker.compiledModules)
      assert.equal(
        digest(await fs.readFile(path.join(cliRoot, 'node_modules/@teambit', entry.path))),
        entry.sha256,
        entry.path
      );
    for (const [filename, sha] of Object.entries(bindings))
      assert.equal(digest(await fs.readFile(path.join(__dirname, filename))), sha, filename);
    assert.equal(digest(await fs.readFile(helper)), helperSha256);
  }
  await verify();
  const temporary = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-real-merge-state-'));
  const globals = benchmarkGlobals(temporary);
  const load = createRequire(path.join(cliRoot, 'package.json'));
  let measurements;
  let baselineStages;
  let fileCounts;
  function measuredOperation(args, step) {
    if (step === 20) {
      if (args.includes('--squash')) return 'laneMergeSquash';
      const unrelated = args.find((arg) => arg.startsWith('--resolve-unrelated='));
      const policy = unrelated ? unrelated.split('=')[1] : args[args.indexOf('--auto-merge-resolve') + 1];
      return `laneMerge${unrelated ? 'Unrelated' : ''}${policy[0].toUpperCase()}${policy.slice(1)}`;
    }
    return { 13: 'laneSnap', 21: 'laneComponentAbort', 22: 'laneRemerge', 23: 'laneResolve', 26: 'laneAbort' }[step];
  }
  async function command(directory, args, mode, step, traced = false) {
    assert.ok(directory.startsWith(temporary + path.sep));
    const env = {
      ...process.env,
      CI: '1',
      BIT_GLOBALS_DIR: globals,
      BIT_RUST_CLIENT_VCS: mode.startsWith('node') ? 'off' : 'on',
      BIT_RUST_OBJECT_IMPORT:
        mode === 'missing-helper'
          ? path.join(directory, 'missing-helper')
          : mode === 'crashed-helper'
            ? process.execPath
            : helper,
      BIT_SNAPSHOT_QUALIFICATION_SEED: `merge:${step}`,
      BIT_SNAPSHOT_QUALIFICATION_CLOCK: String(1800000000000 + step * 1000),
      BIT_RUST_OBJECT_TAR: 'off',
      BIT_RUST_OBJECT_IMPORT_OPERATION: 'off',
      BIT_RUST_WORKSPACE_MATERIALIZATION: 'off',
      BIT_RUST_WORKSPACE_PERSISTENCE: 'off',
    };
    delete env.BIT_IMPORT_TRACE;
    delete env.BIT_IMPORT_TRACE_OWNER;
    const traceFile = path.join(directory, `merge-trace-${step}.json`);
    const nodeArgs = ['--require', path.join(__dirname, 'merge-state-determinism.cjs')];
    if (traced) {
      env.BIT_IMPORT_TRACE = traceFile;
      nodeArgs.push('--require', path.join(__dirname, 'import-trace.cjs'));
    }
    nodeArgs.push(path.join(cliRoot, 'bin/bit.js'), ...args);
    const operation = measuredOperation(args, step);
    const measured = Boolean(options.measure && !traced && operation);
    const execution = measured ? await measuredCommand(nodeArgs, { cwd: directory, env, step, operation }) : undefined;
    if (execution) measurements.push(execution.measurement);
    const result =
      execution?.result ||
      (await new Promise((resolve, reject) => {
        const child = cp.spawn(process.execPath, nodeArgs, { cwd: directory, env, stdio: ['ignore', 'pipe', 'pipe'] });
        const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
        let stdout = '',
          stderr = '';
        child.stdout.on('data', (bytes) => (stdout += bytes));
        child.stderr.on('data', (bytes) => (stderr += bytes));
        child.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.once('close', (code) => {
          clearTimeout(timer);
          if (code) reject(new Error(`${args.join(' ')}\n${stdout}\n${stderr}`));
          else resolve({ stdout, stderr });
        });
      }));
    if (traced) diagnostics.push({ mode, step, args, trace: JSON.parse(await fs.readFile(traceFile, 'utf8')) });
    return args.includes('--json') ? JSON.parse(result.stdout) : result;
  }
  async function state(directory, componentRoot) {
    const files = {};
    async function tree(base, prefix = '') {
      for (const entry of (await fs.readdir(base, { withFileTypes: true })).sort((a, b) =>
        a.name.localeCompare(b.name)
      )) {
        const relative = path.join(prefix, entry.name);
        if (entry.isDirectory()) await tree(path.join(base, entry.name), relative);
        else
          files[relative.split(path.sep).join('/')] = (await fs.readFile(path.join(base, entry.name))).toString('hex');
      }
    }
    await tree(componentRoot);
    const objects = {};
    const root = path.join(directory, '.bit/objects');
    for (const shard of (await fs.readdir(root)).sort()) {
      if (!/^[0-9a-f]{2}$/.test(shard)) continue;
      for (const suffix of (await fs.readdir(path.join(root, shard))).sort()) {
        if (!/^[0-9a-f]{38}$/.test(suffix)) continue;
        objects[shard + suffix] = zlib.inflateSync(await fs.readFile(path.join(root, shard, suffix))).toString('hex');
      }
    }
    const unmergedFile = path.join(directory, '.bit/unmerged.json');
    return {
      files,
      objects,
      bitmap: await fs.readFile(path.join(directory, '.bitmap'), 'utf8'),
      index: await fs.readFile(path.join(directory, '.bit/index.json'), 'utf8'),
      unmerged: await fs.readFile(unmergedFile, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      }),
    };
  }
  const runs = [];
  const diagnostics = [];
  const rounds = Number(options.rounds || 1);
  const extraFiles = Number(options.extraFiles || 0);
  assert.ok(Number.isInteger(extraFiles) && extraFiles >= 0 && extraFiles <= 1000);
  const entries = pairedEntries(rounds, options.modes).filter(
    (entry) => !(options.measure && options.diagnostics === false && entry.fallback)
  );
  for (const [runIndex, entryOptions] of entries.entries()) {
    const { mode } = entryOptions;
    measurements = [];
    const directory = path.join(temporary, `${mode}-${runIndex}`);
    await fs.mkdir(directory);
    const fixture = await createMergeFixture(cliRoot, path.join(temporary, `${mode}-${runIndex}-remote`), {
      extraFiles,
    });
    await command(directory, ['init', '--skip-interactive', '--default-scope', 'qualification.destination'], 'node', 0);
    const scopeFile = path.join(directory, '.bit/scope.json');
    const scope = JSON.parse(await fs.readFile(scopeFile, 'utf8'));
    scope.name = 'qualification.destination';
    scope.remotes = fixture.remotes;
    await fs.writeFile(scopeFile, JSON.stringify(scope));
    await fs.writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: 'merge-qualification', private: true })
    );
    await command(
      directory,
      ['import', `${fixture.id}@1.0.0`, '--all-history', '--skip-dependency-installation', '--override', '--safe-mode'],
      'node',
      1
    );
    const bitmap = load('comment-json').parse(await fs.readFile(path.join(directory, '.bitmap'), 'utf8'));
    const entry = Object.values(bitmap).find(
      (value) => value?.scope === 'qualification.merge' && value.name === 'component'
    );
    assert.ok(entry?.rootDir);
    const componentRoot = path.join(directory, entry.rootDir);
    await fixture.writeLocal(componentRoot);
    await command(directory, ['add', entry.rootDir, '--id', fixture.id, '--main', 'index.js'], 'node', 2);
    await command(
      directory,
      [
        'snap',
        fixture.id,
        '--message',
        'local branch',
        '--skip-auto-snap',
        '--disable-snap-pipeline',
        '--ignore-issues',
        '*',
      ],
      'node',
      3
    );
    const local = await state(directory, componentRoot);
    const remoteRef = await fixture.publishRemoteSibling();
    await command(
      directory,
      ['import', `${fixture.id}@1.0.1`, '--objects', '--all-history', '--skip-dependency-installation'],
      mode,
      4
    );
    const divergedStatus = await command(
      directory,
      ['status', '--json'],
      mode,
      5,
      mode === 'native' && options.diagnostics !== false
    );
    const beforeMerge = await state(directory, componentRoot);
    await command(
      directory,
      ['merge', fixture.id, '--auto-merge-resolve', 'manual', '--no-snap', '--skip-dependency-installation'],
      mode,
      6,
      mode === 'native' && options.diagnostics !== false
    );
    const conflicted = await state(directory, componentRoot);
    assert.ok(
      Buffer.from(conflicted.files['index.js'], 'hex').toString().includes('<<<<<<<'),
      'manual merge writes exact conflict markers'
    );
    await command(directory, ['merge', fixture.id, '--abort', '--skip-dependency-installation'], mode, 7);
    const aborted = await state(directory, componentRoot);
    const expectedAbortFiles = Object.fromEntries(
      Object.entries(beforeMerge.files).map(([filename, hex]) => {
        let bytes = Buffer.from(hex, 'hex');
        if (bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191]))) bytes = bytes.subarray(3);
        return [filename, load('@teambit/toolbox.string.eol').lf(bytes).toString('hex')];
      })
    );
    assert.deepEqual(
      aborted.files,
      expectedAbortFiles,
      'abort restores local committed Sources with canonical BOM/EOL normalization'
    );
    assert.equal(aborted.bitmap, beforeMerge.bitmap, 'abort restores bitmap');
    await command(
      directory,
      ['merge', fixture.id, '--auto-merge-resolve', 'manual', '--no-snap', '--skip-dependency-installation'],
      mode,
      8
    );
    await fs.writeFile(path.join(componentRoot, 'index.js'), 'export const value = "resolved";\n');
    await fs.writeFile(path.join(componentRoot, 'binary.bin'), Buffer.from([0, 249, 13, 10, 248]));
    await command(directory, ['merge', fixture.id, '--resolve', '--skip-dependency-installation'], mode, 9);
    const resolved = await state(directory, componentRoot);
    const resolvedStatus = await command(directory, ['status', '--json'], 'node', 10);
    const history = await command(directory, ['log', fixture.id, '--json'], 'node', 11);
    await command(directory, ['lane', 'create', 'lane-a', '--scope', 'qualification.destination'], 'node', 12);
    await fs.writeFile(path.join(componentRoot, 'index.js'), 'export const value = "lane-a";\n');
    const snapArgs = ['snap', fixture.id, '--skip-auto-snap', '--disable-snap-pipeline', '--ignore-issues', '*'];
    await command(
      directory,
      [...snapArgs, '--message', 'lane-a'],
      mode,
      13,
      mode === 'native' && options.diagnostics !== false
    );
    await command(directory, ['switch', 'main', '--skip-fetch', '--skip-dependency-installation'], 'node', 14);
    await command(directory, ['lane', 'create', 'lane-b', '--scope', 'qualification.destination'], 'node', 15);
    for (let step = 0; step < 3; step++) {
      await fs.writeFile(path.join(componentRoot, 'index.js'), `export const value = "lane-b-${step}";\n`);
      await command(directory, [...snapArgs, '--message', `lane-b-${step}`], 'node', 16 + step);
    }
    const laneBBitmap = load('comment-json').parse(await fs.readFile(path.join(directory, '.bitmap'), 'utf8'));
    const laneBHead = Object.values(laneBBitmap).find(
      (value) => value?.scope === 'qualification.merge' && value.name === 'component'
    ).version;
    await command(directory, ['switch', 'lane-a', '--skip-fetch', '--skip-dependency-installation'], 'node', 19);
    const unrelatedHead = await seedUnrelatedLane(cliRoot, directory, fixture.id);
    const policies = {};
    for (const policy of ['manual', 'ours', 'theirs', 'squash', 'unrelated-ours', 'unrelated-theirs']) {
      const scenario = path.join(temporary, `${path.basename(directory)}-${policy}`);
      await fs.cp(directory, scenario, { recursive: true, dereference: false });
      const scenarioRoot = path.join(scenario, entry.rootDir);
      const before = await state(scenario, scenarioRoot);
      const beforeBitmap = load('comment-json').parse(before.bitmap);
      const laneAHead = Object.values(beforeBitmap).find(
        (value) => value?.scope === 'qualification.merge' && value.name === 'component'
      ).version;
      const unrelated = policy.startsWith('unrelated-');
      const args = [
        'lane',
        'merge',
        unrelated ? 'unrelated' : 'lane-b',
        '--skip-fetch',
        '--skip-dependency-installation',
        '--auto-merge-resolve',
        policy === 'squash' ? 'theirs' : unrelated ? policy.slice('unrelated-'.length) : policy,
      ];
      if (unrelated) args.push(`--resolve-unrelated=${policy.slice('unrelated-'.length)}`);
      if (policy === 'manual') args.push('--no-auto-snap');
      if (policy === 'squash') args.push('--squash');
      await command(scenario, args, mode, 20, mode === 'native' && options.diagnostics !== false);
      const merged = await state(scenario, scenarioRoot);
      if (policy === 'manual') {
        assert.ok(Buffer.from(merged.files['index.js'], 'hex').toString().includes('<<<<<<<'));
        await command(scenario, ['merge', fixture.id, '--abort', '--skip-dependency-installation'], mode, 21);
        const abortedLane = await state(scenario, scenarioRoot);
        assert.deepEqual(abortedLane.files, before.files, 'lane abort restores sources');
        assert.equal(abortedLane.bitmap, before.bitmap, 'lane abort restores bitmap');
        await command(scenario, args, mode, 22);
        await fs.writeFile(path.join(scenarioRoot, 'index.js'), 'export const value = "lane-resolved";\n');
        await command(scenario, ['merge', fixture.id, '--resolve', '--skip-dependency-installation'], mode, 23);
        policies[policy] = { merged, abortedLane, resolved: await state(scenario, scenarioRoot) };
      } else {
        const text = Buffer.from(merged.files['index.js'], 'hex').toString();
        assert.ok(
          text.includes(
            policy === 'ours' || policy === 'unrelated-ours' ? 'lane-a' : unrelated ? 'unrelated' : 'lane-b-2'
          )
        );
        policies[policy] = { merged };
      }
      policies[policy].history = await command(scenario, ['log', fixture.id, '--json'], 'node', 24);
      const latest = policies[policy].history.at(-1);
      assert.deepEqual(
        latest.parents,
        unrelated ? [laneAHead] : policy === 'squash' ? [laneAHead] : [laneAHead, laneBHead],
        `${policy} preserves exact parent order`
      );
      const finalState = policies[policy].resolved || policies[policy].merged;
      const inflated = Buffer.from(finalState.objects[latest.hash], 'hex');
      const versionBody = JSON.parse(inflated.subarray(inflated.indexOf(0) + 1));
      if (policy === 'squash') {
        assert.deepEqual(versionBody.squashed.previousParents, [laneAHead, laneBHead]);
        assert.deepEqual(versionBody.squashed.laneId, { scope: 'qualification.destination', name: 'lane-b' });
        assert.ok(
          !policies[policy].history.some((row) => row.hash === laneBHead),
          'squash history excludes dropped lane head'
        );
      } else assert.equal(versionBody.squashed, undefined);
      if (unrelated)
        assert.deepEqual(versionBody.unrelated, {
          head: unrelatedHead,
          laneId: { scope: 'qualification.destination', name: 'lane-a' },
        });
      else assert.equal(versionBody.unrelated, undefined);
      policies[policy].status = await command(scenario, ['status', '--json'], 'node', 25);
      if (policy === 'ours') {
        await command(scenario, ['lane', 'merge-abort', '--skip-dependency-installation'], mode, 26);
        const restored = await state(scenario, scenarioRoot);
        assert.deepEqual(restored.files, before.files, 'completed lane abort restores sources');
        assert.equal(
          restored.bitmap,
          merged.bitmap,
          'canonical diverged auto-snap abort retains the merged bitmap version'
        );
        policies[policy].laneAborted = restored;
      }
    }
    const stages = {
      policies,
      local,
      remoteRef,
      divergedStatus,
      conflicted,
      aborted,
      resolved,
      resolvedStatus,
      history,
    };
    fileCounts ||= { current: Object.keys(local.files).length, laneSnapshot: Object.keys(resolved.files).length };
    if (baselineStages) assert.deepEqual(stages, baselineStages, `${mode} complete merge/abort/resolve parity`);
    else baselineStages = stages;
    const retainedStages = options.compactReport
      ? Object.fromEntries(
          Object.entries(stages).map(([name, value]) => [name, digest(Buffer.from(JSON.stringify(value)))])
        )
      : stages;
    runs.push({ ...entryOptions, stages: retainedStages, measurements });
  }
  if (options.diagnostics !== false && runs.some(({ mode }) => mode === 'native')) {
    assert.ok(
      diagnostics.some(({ trace }) => trace.history.diverge.completed > 0),
      'actual divergence accepted'
    );
    assert.ok(
      diagnostics.some(({ trace }) => trace.history.mergeFiles.completed > 0),
      'actual whole-file merge accepted'
    );
    assert.ok(
      diagnostics.some(({ trace }) => trace.history.mergeFiles.workspaceFiles > 0),
      'merge reads workspace bodies natively'
    );
    for (const { trace } of diagnostics) assert.equal(trace.history.mergeFiles.failed, 0);
    for (const kind of ['initialize', 'transition', 'commit', 'laneSnap', 'reconcileSnap']) {
      assert.ok(
        diagnostics.some(({ trace }) => trace.mergeState[kind].completed > 0),
        `actual native ${kind} accepted`
      );
      for (const { trace } of diagnostics) assert.equal(trace.mergeState[kind].failed, 0);
    }
  }
  await verify();
  const report = {
    schemaVersion: 1,
    temporary,
    cliProvenance: marker,
    helperSha256,
    bindings,
    diagnostics,
    rounds,
    extraFiles,
    fileCounts,
    compactReport: Boolean(options.compactReport),
    measurements: options.measure === true,
    runs,
  };
  if (options.report) await fs.writeFile(options.report, JSON.stringify(report, null, 2) + '\n');
  return report;
}
module.exports = { runQualification };
if (require.main === module)
  runQualification(process.argv[2], process.argv[3], {
    modes: process.env.BIT_MERGE_STATE_QUALIFICATION_NODE_ONLY === '1' ? ['node'] : undefined,
    report: process.env.BIT_MERGE_STATE_QUALIFICATION_REPORT,
    scratch: process.env.BIT_MERGE_STATE_QUALIFICATION_TMPDIR,
    rounds: process.env.BIT_MERGE_STATE_QUALIFICATION_ROUNDS,
    extraFiles: process.env.BIT_MERGE_STATE_QUALIFICATION_EXTRA_FILES,
    compactReport: process.env.BIT_MERGE_STATE_QUALIFICATION_COMPACT_REPORT === '1',
    measure: process.env.BIT_MERGE_STATE_QUALIFICATION_MEASURE === '1',
    diagnostics: process.env.BIT_MERGE_STATE_QUALIFICATION_DIAGNOSTICS !== '0',
  })
    .then((report) => console.log(JSON.stringify({ temporary: report.temporary, modes: report.runs.length })))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
