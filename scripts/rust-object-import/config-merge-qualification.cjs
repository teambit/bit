const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const { createConfigMergeFixture, resolverId } = require('./config-merge-fixture.cjs');
const { pairedEntries, measuredCommand } = require('./merge-history-measurement.cjs');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function runQualification(cliRoot, helper, options = {}) {
  cliRoot = path.resolve(cliRoot);
  assert.ok(cliRoot.startsWith(os.tmpdir() + path.sep), 'private CLI required');
  const repository = path.resolve(__dirname, '../..');
  const marker = JSON.parse(await fs.readFile(path.join(cliRoot, '.bit-object-import-build.json'), 'utf8'));
  const helperSha256 = helper ? digest(await fs.readFile(helper)) : undefined;
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
    if (helper) assert.equal(digest(await fs.readFile(helper)), helperSha256);
  }
  await verify();
  const temporary = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-real-config-merge-'));
  const load = createRequire(path.join(cliRoot, 'package.json'));
  const globals = benchmarkGlobals(temporary);
  const diagnostics = [],
    runs = [];
  const bindings = {};
  for (const name of [
    'config-merge-qualification.cjs',
    'config-merge-fixture.cjs',
    'config-merge-determinism.cjs',
    'merge-state-determinism.cjs',
    'import-trace.cjs',
    'merge-history-measurement.cjs',
    'config-merge-differential.cjs',
  ])
    bindings[name] = digest(await fs.readFile(path.join(__dirname, name)));
  let measurements;
  async function command(directory, args, mode, step, traced = false, operation) {
    const traceFile = path.join(directory, `config-trace-${step}.json`);
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
      BIT_SNAPSHOT_QUALIFICATION_SEED: `config:${step}`,
      BIT_SNAPSHOT_QUALIFICATION_CLOCK: String(1800000000000 + step * 1000),
      BIT_RUST_OBJECT_TAR: 'off',
      BIT_RUST_OBJECT_IMPORT_OPERATION: 'off',
      BIT_RUST_WORKSPACE_MATERIALIZATION: 'off',
      BIT_RUST_WORKSPACE_PERSISTENCE: 'off',
    };
    delete env.BIT_IMPORT_TRACE;
    delete env.BIT_IMPORT_TRACE_OWNER;
    const argsNode = ['--require', path.join(__dirname, 'config-merge-determinism.cjs')];
    if (traced) {
      env.BIT_IMPORT_TRACE = traceFile;
      argsNode.push('--require', path.join(__dirname, 'import-trace.cjs'));
    }
    argsNode.push(path.join(cliRoot, 'bin/bit.js'), ...args);
    const measured =
      options.measure && !traced && operation
        ? await measuredCommand(argsNode, { cwd: directory, env, step, operation })
        : undefined;
    if (measured) measurements.push(measured.measurement);
    const result = measured
      ? { code: 0, ...measured.result }
      : await new Promise((resolve, reject) => {
          const child = cp.spawn(process.execPath, argsNode, {
            cwd: directory,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          let stdout = '',
            stderr = '';
          const timer = setTimeout(() => child.kill('SIGKILL'), 120000);
          child.stdout.on('data', (b) => (stdout += b));
          child.stderr.on('data', (b) => (stderr += b));
          child.once('error', reject);
          child.once('close', (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr });
          });
        });
    if (traced) diagnostics.push({ mode, step, args, trace: JSON.parse(await fs.readFile(traceFile, 'utf8')) });
    return result;
  }
  async function success(directory, args, mode, step, traced = false, operation) {
    const result = await command(directory, args, mode, step, traced, operation);
    assert.equal(result.code, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    return result;
  }
  async function capture(directory, roots) {
    const files = {},
      objects = {},
      artifacts = {};
    async function tree(base, prefix, target) {
      for (const entry of (await fs.readdir(base, { withFileTypes: true })).sort((a, b) =>
        a.name < b.name ? -1 : 1
      )) {
        const filename = path.join(base, entry.name),
          relative = path.posix.join(prefix, entry.name);
        if (entry.isDirectory()) await tree(filename, relative, target);
        else target[relative] = (await fs.readFile(filename)).toString('hex');
      }
    }
    for (const [id, root] of Object.entries(roots)) await tree(root, id, files);
    const store = path.join(directory, '.bit/objects');
    for (const shard of (await fs.readdir(store)).sort())
      if (/^[0-9a-f]{2}$/.test(shard))
        for (const suffix of (await fs.readdir(path.join(store, shard))).sort())
          if (/^[0-9a-f]{38}$/.test(suffix))
            objects[shard + suffix] = zlib
              .inflateSync(await fs.readFile(path.join(store, shard, suffix)))
              .toString('hex');
    for (const filename of [
      '.bitmap',
      '.bit/index.json',
      '.bit/unmerged.json',
      'merge-conflict',
      'workspace.jsonc',
      '.bit/workspace-config-history/metadata.txt',
    ]) {
      artifacts[filename] = await fs
        .readFile(path.join(directory, filename))
        .then((b) => b.toString('hex'))
        .catch((e) => {
          if (e.code === 'ENOENT') return null;
          throw e;
        });
    }
    const backups = {};
    await tree(path.join(directory, '.bit/workspace-config-history/files'), '', backups).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
    return { files, objects, artifacts, backups };
  }
  let baseline;
  const entries = pairedEntries(Number(options.rounds || 1), options.modes).filter(
    (entry) => !(options.measure && options.diagnostics === false && entry.fallback)
  );
  for (const [runIndex, entry] of entries.entries()) {
    const { mode } = entry;
    measurements = [];
    const scenarios = {};
    for (const boundary of options.boundaries || ['lane', 'import'])
      for (const scenario of options.scenarios || ['clean', 'conflict']) {
        const name = `${boundary}-${scenario}`,
          directory = path.join(temporary, `${mode}-${runIndex}-${name}`);
        await fs.mkdir(directory);
        const fixture = await createConfigMergeFixture(cliRoot, `${directory}-remote`, {
          scenario,
          extraDependencies: options.extraDependencies,
          extraFiles: options.extraFiles,
        });
        await success(
          directory,
          ['init', '--skip-interactive', '--default-scope', 'qualification.destination'],
          'node',
          0
        );
        const scopeFile = path.join(directory, '.bit/scope.json'),
          scope = JSON.parse(await fs.readFile(scopeFile, 'utf8'));
        scope.name = 'qualification.destination';
        scope.remotes = fixture.remotes;
        await fs.writeFile(scopeFile, JSON.stringify(scope));
        await fs.writeFile(
          path.join(directory, 'package.json'),
          JSON.stringify({ name: 'config-qualification', private: true })
        );
        await success(
          directory,
          [
            'import',
            ...fixture.ids.map((id) => `${id}@1.0.0`),
            '--all-history',
            '--skip-dependency-installation',
            '--override',
            '--safe-mode',
          ],
          'node',
          1
        );
        const bitmap = load('comment-json').parse(await fs.readFile(path.join(directory, '.bitmap'), 'utf8'));
        const roots = Object.fromEntries(
          fixture.ids.map((id) => [
            id,
            path.join(
              directory,
              Object.values(bitmap).find((v) => v?.scope === 'qualification.config' && v.name === id.split('/').pop())
                .rootDir
            ),
          ])
        );
        await fixture.installPackageStubs(directory);
        if (boundary === 'lane') {
          await fixture.installCurrent(directory, roots);
          await success(directory, ['lane', 'create', 'destination', '--scope', 'qualification.config'], 'node', 3);
        }
        const configPath = path.join(directory, 'workspace.jsonc');
        const config = load('comment-json').parse(await fs.readFile(configPath, 'utf8'));
        config['teambit.workspace/workspace'].name = 'config-qualification';
        config[resolverId] = { ...(config[resolverId] || {}), policy: fixture.workspacePolicy };
        await fs.writeFile(
          configPath,
          '// qualification preserves this comment\n' + load('comment-json').stringify(config, null, 2) + '\n'
        );
        await fixture.publishOther();
        if (boundary === 'lane') {
          await success(
            directory,
            [
              'import',
              ...fixture.ids.map((id) => `${id}@1.0.1`),
              '--objects',
              '--all-history',
              '--skip-dependency-installation',
            ],
            'node',
            2
          );
          await fixture.seedIncomingLane(directory);
        }
        const before = await capture(directory, roots);
        const args =
          boundary === 'lane'
            ? [
                'lane',
                'merge',
                'incoming',
                '--manual',
                '--ignore-config-changes',
                '--no-auto-snap',
                '--no-squash',
                '--skip-fetch',
                '--skip-dependency-installation',
              ]
            : ['import', ...fixture.ids.map((id) => `${id}@1.0.1`), '--override', '--skip-dependency-installation'];
        const result = await success(
          directory,
          args,
          mode,
          10,
          mode === 'native' && options.diagnostics !== false,
          `${boundary}-${scenario}`
        );
        const after = await capture(directory, roots);
        const rawConfig = Buffer.from(after.artifacts['workspace.jsonc'], 'hex').toString();
        assert.ok(rawConfig.includes('qualification preserves this comment'));
        if (scenario === 'conflict') {
          assert.ok(
            rawConfig.includes('<<<<<<<') && rawConfig.includes('>>>>>>>'),
            'workspace Git conflict markers persisted'
          );
          assert.ok(Object.keys(after.backups).length > 0, 'conflict backup exists');
          assert.ok(
            Buffer.from(after.artifacts['.bit/workspace-config-history/metadata.txt'], 'hex')
              .toString()
              .includes('before writing conflicts')
          );
        } else if (boundary === 'import') {
          assert.equal(
            load('comment-json').parse(rawConfig)[resolverId].policy.dependencies['qualification-auto-a'],
            '^1.1.0'
          );
          assert.ok(Object.keys(after.backups).length > 0, 'root policy update backed up original bytes');
        }
        if (boundary === 'lane') {
          const entries = JSON.parse(Buffer.from(after.artifacts['.bit/unmerged.json'], 'hex').toString());
          assert.equal(entries.length, 2);
          for (const entry of entries) {
            const dependencies = entry.mergedConfig[resolverId].policy.dependencies;
            assert.ok(
              dependencies.some(
                (dep) => dep.name === 'qualification-force' && dep.version === '^2.0.0' && dep.force === true
              ),
              'unchanged forced policy rescued'
            );
            assert.ok(
              !dependencies.some((dep) => dep.name === 'qualification-delete'),
              'other-side policy deletion applied'
            );
          }
        }
        assert.notDeepEqual(
          after,
          before,
          `actual operation must change persisted state: ${result.stdout} ${result.stderr}`
        );
        const status = await command(directory, ['status', '--json'], 'node', 11);
        const history = [];
        for (const id of fixture.ids) history.push(await command(directory, ['log', id, '--json'], 'node', 12));
        const normalize = (result) => ({
          code: result.code,
          stdout: result.stdout.split(directory).join('<workspace>'),
          stderr: result.stderr.split(directory).join('<workspace>'),
        });
        scenarios[name] = { before, after, status: normalize(status), history: history.map(normalize) };
      }
    if (!baseline) baseline = scenarios;
    else assert.deepEqual(scenarios, baseline, `${mode} exact public state parity`);
    runs.push({
      ...entry,
      scenarios: options.compactReport
        ? Object.fromEntries(Object.entries(scenarios).map(([name, state]) => [name, digest(JSON.stringify(state))]))
        : scenarios,
      measurements,
    });
  }
  for (const [name, sha] of Object.entries(bindings))
    assert.equal(digest(await fs.readFile(path.join(__dirname, name))), sha, name);
  if (options.diagnostics !== false && (options.modes === undefined || options.modes.includes('native'))) {
    for (const kind of [
      'configComponent',
      'configWorkspaceUpdates',
      'configWorkspaceMerge',
      'configWorkspaceConflictPlan',
      'configWorkspaceConflictCommit',
      'configScopePolicy',
    ]) {
      if (process.platform === 'win32' && kind === 'configWorkspaceConflictCommit') continue;
      assert.ok(
        diagnostics.some((entry) => entry.trace.mergeState[kind].completed > 0),
        `${kind} must complete in an actual public command`
      );
    }
  }
  await verify();
  return {
    temporary,
    cliRoot,
    helper,
    helperSha256,
    workload: {
      sourceFiles: 8 + Number(options.extraFiles || 0),
      autoDependenciesPerComponent: 1 + Number(options.extraDependencies || 0),
    },
    sourceSha256: marker.sourceSha256,
    compiledModules: marker.compiledModules,
    bindings,
    runs,
    diagnostics,
  };
}
module.exports = { runQualification };
if (require.main === module)
  runQualification(process.argv[2], process.argv[3], {
    modes: process.env.BIT_CONFIG_QUALIFICATION_MODES?.split(','),
    boundaries: process.env.BIT_CONFIG_QUALIFICATION_BOUNDARIES?.split(','),
    scenarios: process.env.BIT_CONFIG_QUALIFICATION_SCENARIOS?.split(','),
  })
    .then(async (report) => {
      await fs.writeFile(process.argv[4], JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ temporary: report.temporary, modes: report.runs.length }));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
