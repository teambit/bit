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
        'lane-recovery-qualification.cjs',
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
  const temporary = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-real-lane-recovery-'));
  const globals = benchmarkGlobals(temporary);
  const load = createRequire(path.join(cliRoot, 'package.json'));
  let measurements;
  let fileCounts;
  async function command(directory, args, mode, step, traced = false, operation) {
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
    const recovery = {};
    for (const name of ['last-merged', 'staged-config']) {
      const recoveryRoot = path.join(directory, '.bit', name);
      async function recoveryTree(base, prefix) {
        for (const entry of (await fs.readdir(base, { withFileTypes: true })).sort((a, b) =>
          a.name.localeCompare(b.name)
        )) {
          const filename = path.join(base, entry.name),
            relative = path.posix.join(prefix, entry.name);
          if (entry.isDirectory()) await recoveryTree(filename, relative);
          else recovery[relative] = (await fs.readFile(filename)).toString('hex');
        }
      }
      await recoveryTree(recoveryRoot, name).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
    const stagedSnaps = await fs.readFile(path.join(directory, '.bit/staged-snaps'), 'utf8').catch((error) => {
      if (error.code !== 'ENOENT') throw error;
      return undefined;
    });
    const unmergedFile = path.join(directory, '.bit/unmerged.json');
    return {
      files,
      objects,
      recovery,
      stagedSnaps,
      workspaceJsonc: await fs.readFile(path.join(directory, 'workspace.jsonc'), 'utf8'),
      bitmap: await fs.readFile(path.join(directory, '.bitmap'), 'utf8'),
      index: await fs.readFile(path.join(directory, '.bit/index.json'), 'utf8'),
      unmerged: await fs.readFile(unmergedFile, 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return undefined;
        throw error;
      }),
    };
  }
  const runs = [],
    diagnostics = [];
  const rounds = Number(options.rounds || 1);
  const extraFiles = Number(options.extraFiles || 0);
  assert.ok(Number.isInteger(extraFiles) && extraFiles >= 0 && extraFiles <= 1000);
  const entries = pairedEntries(rounds, options.modes).filter(
    (entry) => !(options.measure && options.diagnostics === false && entry.fallback)
  );
  let baseline;
  for (const [runIndex, entryOptions] of entries.entries()) {
    const { mode } = entryOptions;
    measurements = [];
    const scenarios = {};
    for (const count of [3])
      for (const target of ['lane'])
        for (const stagedPresence of options.stagedModes || ['present', 'absent']) {
          const name = `${target}-${count}-${stagedPresence}`;
          const directory = path.join(temporary, `${mode}-${runIndex}-${name}`);
          await fs.mkdir(directory);
          const fixture = await createMergeFixture(cliRoot, `${directory}-remote`, { extraFiles });
          await command(
            directory,
            ['init', '--skip-interactive', '--default-scope', 'qualification.destination'],
            'node',
            0
          );
          const workspaceFile = path.join(directory, 'workspace.jsonc');
          const workspaceBody = await fs.readFile(workspaceFile, 'utf8');
          await fs.writeFile(
            workspaceFile,
            workspaceBody.replace(/"name": "[^"]*"/, '"name": "lane-recovery-qualification"')
          );
          const scopeFile = path.join(directory, '.bit/scope.json');
          const scope = JSON.parse(await fs.readFile(scopeFile, 'utf8'));
          scope.name = 'qualification.destination';
          scope.remotes = fixture.remotes;
          await fs.writeFile(scopeFile, JSON.stringify(scope));
          await fs.writeFile(
            path.join(directory, 'package.json'),
            JSON.stringify({ name: 'lane-recovery-qualification', private: true })
          );
          await command(
            directory,
            [
              'import',
              `${fixture.id}@1.0.0`,
              '--all-history',
              '--skip-dependency-installation',
              '--override',
              '--safe-mode',
            ],
            'node',
            1
          );
          const bitmap = load('comment-json').parse(await fs.readFile(path.join(directory, '.bitmap'), 'utf8'));
          const component = Object.values(bitmap).find(
            (value) => value?.scope === 'qualification.merge' && value.name === 'component'
          );
          const componentRoot = path.join(directory, component.rootDir);
          await command(directory, ['lane', 'create', 'incoming', '--scope', 'qualification.destination'], 'node', 2);
          for (let index = 0; index < count; index++) {
            await fs.writeFile(path.join(componentRoot, 'index.js'), `export const value = "incoming-${index}";\n`);
            await fs.writeFile(path.join(componentRoot, 'clean.js'), `export const clean = ${index};\n`);
            await command(
              directory,
              [
                'snap',
                fixture.id,
                '--message',
                index === 1 ? 'middle\nmultiline' : `incoming ${index}`,
                '--skip-auto-snap',
                '--disable-snap-pipeline',
                '--ignore-issues',
                '*',
              ],
              'node',
              3 + index
            );
          }
          await command(directory, ['switch', 'main', '--skip-fetch', '--skip-dependency-installation'], 'node', 7);
          if (target === 'lane')
            await command(
              directory,
              ['lane', 'create', 'destination', '--scope', 'qualification.destination'],
              'node',
              8
            );
          if (target === 'detached') {
            await fs.writeFile(path.join(componentRoot, 'index.js'), 'export const value = "detached-local";\n');
            await command(
              directory,
              [
                'snap',
                fixture.id,
                '--message',
                'detached local',
                '--skip-auto-snap',
                '--disable-snap-pipeline',
                '--ignore-issues',
                '*',
              ],
              'node',
              9
            );
          }
          const stagedConfigFile = path.join(
            directory,
            '.bit/staged-config/qualification.destination/destination.json'
          );
          await fs.mkdir(path.dirname(stagedConfigFile), { recursive: true });
          await fs.writeFile(
            stagedConfigFile,
            JSON.stringify(
              [
                {
                  id: { scope: 'qualification.merge', name: 'component', version: '1.0.0' },
                  config: { 'teambit.component/deprecation': { deprecate: false } },
                  componentMapObject: component,
                },
              ],
              null,
              2
            )
          );
          if (stagedPresence === 'absent') {
            await fs.rm(stagedConfigFile, { force: true });
            await fs.rm(path.join(directory, '.bit/staged-snaps'), { force: true });
          }
          const beforeMerge = await state(directory, componentRoot);
          const beforeAbortHistory =
            target === 'lane' && count === 3
              ? await command(directory, ['log', fixture.id, '--json'], 'node', 19)
              : undefined;
          const mergeArgs = [
            'lane',
            'merge',
            'incoming',
            '--skip-fetch',
            '--skip-dependency-installation',
            '--message',
            'qualification squash title',
          ];
          if (target === 'lane') mergeArgs.push('--squash');
          if (target === 'detached') mergeArgs.push('--detach-head', '--auto-merge-resolve', 'ours');
          const result = await command(
            directory,
            mergeArgs,
            mode,
            20,
            mode === 'native' && options.diagnostics !== false,
            `squash${target[0].toUpperCase()}${target.slice(1)}${count}`
          );
          const status = await command(directory, ['status', '--json'], 'node', 21);
          const history = await command(directory, ['log', fixture.id, '--json'], 'node', 22);
          scenarios[name] = { state: await state(directory, componentRoot), status, history };
          fileCounts ||= { workspace: Object.keys(scenarios[name].state.files).length };
          if (target === 'lane' && count === 3) {
            const abortResult = await command(
              directory,
              ['lane', 'merge-abort', '--skip-dependency-installation', '--silent'],
              mode,
              26,
              mode === 'native' && options.diagnostics !== false,
              'laneAbort3'
            );
            assert.ok(abortResult.stdout.includes('restored successfully'), 'abort completed restoration');
            scenarios[name].aborted = await state(directory, componentRoot);
            assert.deepEqual(
              scenarios[name].aborted.files,
              beforeMerge.files,
              'abort restores premerge committed files'
            );
            assert.equal(scenarios[name].aborted.bitmap, beforeMerge.bitmap, 'abort restores premerge bitmap');
            assert.equal(
              scenarios[name].aborted.workspaceJsonc,
              beforeMerge.workspaceJsonc,
              'abort restores exact workspace bytes'
            );
            assert.equal(
              scenarios[name].aborted.stagedSnaps,
              beforeMerge.stagedSnaps,
              'abort restores staged snap bytes'
            );
            assert.deepEqual(
              scenarios[name].aborted.recovery,
              beforeMerge.recovery,
              'abort restores staged config bytes and removes backup'
            );
            await assert.rejects(() => fs.stat(path.join(directory, '.bit/last-merged')), { code: 'ENOENT' });
            scenarios[name].abortStatus = await command(directory, ['status', '--json'], 'node', 27);
            scenarios[name].abortHistory = await command(directory, ['log', fixture.id, '--json'], 'node', 28);
            assert.deepEqual(
              scenarios[name].abortHistory,
              beforeAbortHistory,
              'abort restores reachable premerge history'
            );
            const preReset = await state(directory, componentRoot);
            const localVersions = [];
            for (let local = 0; local < 2; local++) {
              await fs.writeFile(
                path.join(componentRoot, 'index.js'),
                `export const value = "reset-local-${local}";\n`
              );
              await command(
                directory,
                [
                  'snap',
                  fixture.id,
                  '--message',
                  `reset local ${local}`,
                  '--skip-auto-snap',
                  '--disable-snap-pipeline',
                  '--ignore-issues',
                  '*',
                ],
                'node',
                30 + local
              );
              const snapBitmap = load('comment-json').parse(await fs.readFile(path.join(directory, '.bitmap'), 'utf8'));
              localVersions.push(
                Object.values(snapBitmap).find(
                  (row) => row?.scope === 'qualification.merge' && row.name === 'component'
                ).version
              );
            }
            const resetFiles = (await state(directory, componentRoot)).files;
            await command(
              directory,
              ['reset', fixture.id, '--head', '--force'],
              mode,
              32,
              mode === 'native' && options.diagnostics !== false,
              'resetHead'
            );
            scenarios[name].resetHead = await state(directory, componentRoot);
            const resetHeadBitmap = load('comment-json').parse(scenarios[name].resetHead.bitmap);
            assert.equal(
              Object.values(resetHeadBitmap).find(
                (row) => row?.scope === 'qualification.merge' && row.name === 'component'
              ).version,
              localVersions[0]
            );
            assert.deepEqual(scenarios[name].resetHead.files, resetFiles, 'reset retains current working file bytes');
            await command(
              directory,
              ['reset', fixture.id, '--force'],
              mode,
              33,
              mode === 'native' && options.diagnostics !== false,
              'resetAll'
            );
            scenarios[name].resetAll = await state(directory, componentRoot);
            const resetAllBitmap = load('comment-json').parse(scenarios[name].resetAll.bitmap);
            const originalBitmap = load('comment-json').parse(preReset.bitmap);
            const findRow = (bitmap) =>
              Object.values(bitmap).find((row) => row?.scope === 'qualification.merge' && row.name === 'component');
            assert.equal(findRow(resetAllBitmap).version, findRow(originalBitmap).version);
            assert.deepEqual(scenarios[name].resetAll.files, resetFiles);
            scenarios[name].resetStatus = await command(directory, ['status', '--json'], 'node', 34);
            scenarios[name].resetHistory = await command(directory, ['log', fixture.id, '--json'], 'node', 35);
          }
          assert.ok(result.stdout);
        }
    if (!baseline) baseline = scenarios;
    else assert.deepEqual(scenarios, baseline, `${mode} canonical exact states`);
    const retained = options.compactReport
      ? Object.fromEntries(
          Object.entries(scenarios).map(([name, value]) => [name, digest(Buffer.from(JSON.stringify(value)))])
        )
      : scenarios;
    runs.push({ ...entryOptions, scenarios: retained, measurements });
  }
  if (runs.some(({ mode }) => mode === 'native') && options.diagnostics !== false) {
    for (const kind of [
      'squashPolicy',
      'squashMessages',
      'historyRebase',
      'recoveryInitialize',
      'recoveryAdvance',
      'recoveryBitmap',
      'resetRefsPlan',
    ]) {
      assert.ok(
        diagnostics.some(({ trace }) => trace.mergeState[kind].completed > 0),
        `native ${kind} accepted`
      );
      for (const { trace } of diagnostics) assert.equal(trace.mergeState[kind].failed, 0);
    }
    for (const { trace } of diagnostics) assert.equal(trace.persistence.helpers, 1);
    const abortTraces = diagnostics.filter(({ step }) => step === 26);
    assert.equal(abortTraces.length, 2, 'native completed abort observes present and absent staged state');
    for (const { trace: abortTrace } of abortTraces) {
      for (const kind of ['initialize', 'transition', 'commit']) {
        assert.equal(abortTrace.mergeState[kind].completed, 1);
        assert.equal(abortTrace.mergeState[kind].failed, 0);
      }
      assert.ok(abortTrace.checkout.write.completed > 0, 'abort restores source files with same helper');
      assert.ok(abortTrace.mergeState.recoveryAdvance.stepsCompleted > 0, 'abort performs acknowledged recovery steps');
    }
    for (const { step, trace } of diagnostics.filter(({ step }) => step === 32 || step === 33))
      assert.equal(trace.mergeState.resetRefsPlan.completed, 1, `actual reset step ${step} accepted`);
    if (process.platform === 'linux')
      for (const { trace } of diagnostics)
        assert.equal(trace.mergeState.recoveryAdvance.dataFailed, 0, 'ordinary Linux recovery steps remain native');
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
    modes: process.env.BIT_LANE_RECOVERY_QUALIFICATION_NODE_ONLY === '1' ? ['node'] : undefined,
    report: process.env.BIT_LANE_RECOVERY_QUALIFICATION_REPORT,
    scratch: process.env.BIT_LANE_RECOVERY_QUALIFICATION_TMPDIR,
    rounds: process.env.BIT_LANE_RECOVERY_QUALIFICATION_ROUNDS,
    extraFiles: process.env.BIT_LANE_RECOVERY_QUALIFICATION_EXTRA_FILES,
    compactReport: process.env.BIT_LANE_RECOVERY_QUALIFICATION_COMPACT_REPORT === '1',
    measure: process.env.BIT_LANE_RECOVERY_QUALIFICATION_MEASURE === '1',
    diagnostics: process.env.BIT_LANE_RECOVERY_QUALIFICATION_DIAGNOSTICS !== '0',
  })
    .then((report) => console.log(JSON.stringify({ temporary: report.temporary, modes: report.runs.length })))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
