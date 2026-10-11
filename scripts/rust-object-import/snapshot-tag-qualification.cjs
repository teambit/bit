// Real snap/tag commands run solely in freshly created disposable workspaces and a private CLI.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const zlib = require('node:zlib');
const { performance } = require('node:perf_hooks');
const { createBenchmarkProcessControl } = require('../rust-dependency-analysis/process-tree-memory-control.cjs');
const { createProcessTreeMemorySampler } = require('../rust-dependency-analysis/process-tree-memory.cjs');
const { createHash } = require('node:crypto');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function runQualification(cliRoot, helper, options = {}) {
  cliRoot = path.resolve(cliRoot);
  assert.ok(cliRoot.startsWith(os.tmpdir() + path.sep) || cliRoot.startsWith('/tmp/'), 'private CLI required');
  const temporary = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-real-snapshot-tag-'));
  const globals = benchmarkGlobals(temporary);
  const deterministic = path.join(__dirname, 'snapshot-tag-determinism.cjs');
  const repository = path.resolve(__dirname, '../..');
  const provenance = JSON.parse(await fs.readFile(path.join(cliRoot, '.bit-object-import-build.json'), 'utf8'));
  const helperSha256 = helper ? digest(await fs.readFile(helper)) : undefined;
  const harnessSha256 = digest(await fs.readFile(__filename));
  const deterministicSha256 = digest(await fs.readFile(deterministic));
  async function verifyProvenance() {
    if (options.verifySources !== false) {
      for (const [filename, hash] of Object.entries(provenance.sourceSha256))
        assert.equal(digest(await fs.readFile(path.join(repository, filename))), hash, `source ${filename}`);
    }
    for (const file of provenance.compiledModules)
      assert.equal(
        digest(await fs.readFile(path.join(cliRoot, 'node_modules/@teambit', file.path))),
        file.sha256,
        `compiled ${file.path}`
      );
    if (helper) assert.equal(digest(await fs.readFile(helper)), helperSha256, 'helper changed');
    assert.equal(digest(await fs.readFile(__filename)), harnessSha256, 'qualification changed');
    assert.equal(digest(await fs.readFile(deterministic)), deterministicSha256, 'deterministic preload changed');
  }
  await verifyProvenance();
  const rounds = Number(options.rounds || 1);
  const extraFiles = Number(options.extraFiles || 0);
  assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 20);
  assert.ok(Number.isInteger(extraFiles) && extraFiles >= 0 && extraFiles <= 1000);
  const entries = [];
  if (rounds > 1) for (const mode of ['node', 'native']) entries.push({ mode, round: -1, warmup: true });
  for (let round = 0; round < rounds; round++)
    for (const mode of options.modes || (round % 2 ? ['native', 'node'] : ['node', 'native']))
      entries.push({ mode, round, warmup: false });
  if (!options.modes)
    for (const mode of ['missing-helper', 'crashed-helper'])
      entries.push({ mode, round: 0, warmup: false, fallback: true });
  const modes = entries.map(({ mode }) => mode);
  let measurements;

  const runs = [];
  const diagnostics = [];
  const traceHarness = path.join(__dirname, 'import-trace.cjs');
  const traceSha256 = digest(await fs.readFile(traceHarness));
  async function command(directory, args, mode, step) {
    assert.ok(directory.startsWith(temporary + path.sep), 'commands must stay in the disposable fixture');
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
      BIT_SNAPSHOT_QUALIFICATION_SEED: `snapshot-tag:${step}`,
      BIT_SNAPSHOT_QUALIFICATION_CLOCK: String(1800000000000 + step * 1000),
      BIT_RUST_OBJECT_TAR: 'off',
      BIT_RUST_OBJECT_IMPORT_OPERATION: 'off',
      BIT_RUST_WORKSPACE_MATERIALIZATION: 'off',
      BIT_RUST_WORKSPACE_PERSISTENCE: 'off',
    };
    delete env.BIT_IMPORT_TRACE;
    delete env.BIT_IMPORT_TRACE_OWNER;
    const traced =
      options.diagnostics !== false &&
      mode === 'native' &&
      (args[0] === 'snap' || (args[0] === 'tag' && args.some((arg) => arg.startsWith('--persist'))));
    const traceFile = path.join(directory, `snapshot-trace-${step}.json`);
    if (traced) env.BIT_IMPORT_TRACE = traceFile;
    const nodeArgs = ['--require', deterministic];
    if (traced) nodeArgs.push('--require', traceHarness);
    nodeArgs.push(path.join(cliRoot, 'bin/bit.js'), ...args);
    const measured = Boolean(
      options.measure &&
        !traced &&
        ['snap', 'tag'].includes(args[0]) &&
        (args[0] === 'snap' || args.some((arg) => arg.startsWith('--persist')))
    );
    const cpuFile = path.join(directory, `snapshot-cpu-${step}.txt`);
    const linux = measured && process.platform === 'linux';
    const started = performance.now();
    let tree;
    const result = await new Promise((resolve, reject) => {
      const child = cp.spawn(
        linux ? '/usr/bin/time' : process.execPath,
        linux ? ['-f', '%U %S', '-o', cpuFile, process.execPath, ...nodeArgs] : nodeArgs,
        { cwd: directory, env, detached: linux, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      const control = linux ? createBenchmarkProcessControl(child) : undefined;
      const sampler = linux ? createProcessTreeMemorySampler(child.pid, { intervalMs: 10 }) : undefined;
      sampler?.start();
      const timer = linux ? undefined : setTimeout(() => child.kill('SIGKILL'), 120000);
      let stdout = '',
        stderr = '';
      child.stdout.on('data', (bytes) => {
        stdout += bytes;
      });
      child.stderr.on('data', (bytes) => {
        stderr += bytes;
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        sampler?.stop();
        control?.dispose();
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        tree = sampler?.stop();
        control?.dispose();
        if (control?.failure) return reject(control.failure);
        if (code !== 0) reject(new Error(`${args.join(' ')} (${code})\n${stdout}\n${stderr}`));
        else resolve(args.includes('--json') ? JSON.parse(stdout) : { stdout, stderr });
      });
    });
    if (measured) {
      const measurement = {
        step,
        operation: step === 3 ? 'initialTag' : step === 5 ? 'snap' : 'finalTag',
        wallMs: performance.now() - started,
        processTree: tree,
      };
      if (linux) {
        const [user, system] = (await fs.readFile(cpuFile, 'utf8')).trim().split(/\s+/).map(Number);
        measurement.cpuSeconds = { user, system, total: user + system };
      }
      measurements.push(measurement);
    }
    if (traced) {
      const trace = JSON.parse(await fs.readFile(traceFile, 'utf8'));
      diagnostics.push({ mode, step, args, trace });
      assert.equal(trace.persistence.helpers, 1, 'snapshot operations must share one helper');
      for (const kind of ['commit', 'plan']) {
        assert.ok(trace.snapshot[kind].frames > 0, `actual ${args[0]} must use BSS1 ${kind}`);
        assert.ok(trace.snapshot[kind].files > 0);
        assert.equal(trace.snapshot[kind].completed, trace.snapshot[kind].files);
        assert.equal(trace.snapshot[kind].failed, 0);
      }
      assert.ok(trace.snapshot.commit.workspaceSources > 0, 'actual snapshot must retain workspace Source provenance');
    }
    return result;
  }
  async function snapshot(directory) {
    const objects = {};
    const objectsDirectory = path.join(directory, '.bit/objects');
    for (const shard of (await fs.readdir(objectsDirectory)).sort()) {
      if (!/^[0-9a-f]{2}$/.test(shard)) continue;
      for (const suffix of (await fs.readdir(path.join(objectsDirectory, shard))).sort()) {
        if (!/^[0-9a-f]{38}$/.test(suffix)) continue;
        const bytes = zlib.inflateSync(await fs.readFile(path.join(objectsDirectory, shard, suffix)));
        objects[shard + suffix] = bytes.toString('hex');
      }
    }
    const bitmap = await fs.readFile(path.join(directory, '.bitmap'), 'utf8');
    const index = await fs.readFile(path.join(directory, '.bit/index.json'), 'utf8');
    const models = Object.entries(objects).map(([hash, hex]) => {
      const bytes = Buffer.from(hex, 'hex');
      const end = bytes.indexOf(0);
      const [type, headerHash, length] = bytes.subarray(0, end).toString().split(' ');
      assert.equal(headerHash, hash);
      assert.equal(bytes.length - end - 1, Number(length));
      return { hash, type, body: bytes.subarray(end + 1) };
    });
    const component = JSON.parse(models.find((model) => model.type === 'Component').body);
    const versions = models
      .filter((model) => model.type === 'Version')
      .map((model) => ({ hash: model.hash, ...JSON.parse(model.body) }));
    const byHash = new Map(versions.map((version) => [version.hash, version]));
    assert.ok(component.versions['1.0.0']);
    assert.ok(byHash.has(component.head));
    for (const version of versions) {
      assert.equal(version.files.length, 3 + extraFiles);
      for (const file of version.files) assert.ok(objects[file.file], `Source exists: ${file.relativePath}`);
      for (const parent of version.parents || []) assert.ok(byHash.has(parent), 'Version parent must exist');
    }
    return { objects, bitmap, index, component, versions };
  }
  for (const entry of entries) {
    const { mode } = entry;
    measurements = [];
    const directory = path.join(temporary, `${mode}-${entry.round}`);
    await fs.mkdir(directory);
    await command(directory, ['init', '--skip-interactive', '--default-scope', 'qualification.snapshot'], 'node', 0);
    const scopeFile = path.join(directory, '.bit/scope.json');
    const scope = JSON.parse(await fs.readFile(scopeFile, 'utf8'));
    scope.name = 'qualification.snapshot';
    await fs.writeFile(scopeFile, JSON.stringify(scope));
    await fs.writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: 'snapshot-qualification', private: true })
    );
    const root = path.join(directory, 'component');
    await fs.mkdir(root);
    await fs.writeFile(path.join(root, 'index.js'), '\ufeffmodule.exports = "initial";\r\n');
    await fs.writeFile(path.join(root, 'second.js'), 'exports.value = 1;\r\n');
    await fs.writeFile(path.join(root, 'binary.bin'), Buffer.from([0, 255, 13, 10, 254]));
    async function writeExtras(stage) {
      await Promise.all(
        Array.from({ length: extraFiles }, (_, index) => {
          const version = index % 2 ? 0 : stage;
          const body = `file ${index} stage ${version}\n`.padEnd(4095, String(index % 10)) + '\n';
          return fs.writeFile(path.join(root, `extra-${String(index).padStart(4, '0')}.txt`), body);
        })
      );
    }
    await writeExtras(0);
    await command(directory, ['add', 'component', '--id', 'component', '--main', 'index.js'], 'node', 1);
    const stages = [];
    await command(
      directory,
      [
        'tag',
        'component',
        '--ver',
        '1.0.0',
        '--soft',
        '--message',
        'initial',
        '--ignore-issues',
        '*',
        '--skip-auto-tag',
      ],
      mode,
      2
    );
    await command(
      directory,
      ['tag', '--persist=skip-build', '--disable-tag-pipeline', '--ignore-issues', '*'],
      mode,
      3
    );
    stages.push({
      name: 'tag-1.0.0',
      state: await snapshot(directory),
      status: await command(directory, ['status', '--json'], 'node', 4),
      history: await command(directory, ['log', 'component', '--json'], 'node', 4),
    });
    await fs.writeFile(path.join(root, 'index.js'), 'module.exports = "snapped";\n');
    await fs.writeFile(path.join(root, 'second.js'), 'exports.value = 2;\n');
    await writeExtras(1);
    await command(
      directory,
      [
        'snap',
        'component',
        '--message',
        'middle',
        '--skip-auto-snap',
        '--disable-snap-pipeline',
        '--ignore-issues',
        '*',
      ],
      mode,
      5
    );
    stages.push({
      name: 'snap',
      state: await snapshot(directory),
      status: await command(directory, ['status', '--json'], 'node', 6),
      history: await command(directory, ['log', 'component', '--json'], 'node', 6),
    });
    await fs.writeFile(path.join(root, 'index.js'), 'module.exports = "final";\r\n');
    await fs.writeFile(path.join(root, 'second.js'), 'exports.value = 3;\n');
    await writeExtras(2);
    await command(
      directory,
      ['tag', 'component', '--ver', '1.0.1', '--soft', '--message', 'final', '--ignore-issues', '*', '--skip-auto-tag'],
      mode,
      7
    );
    await command(
      directory,
      ['tag', '--persist=skip-build', '--disable-tag-pipeline', '--ignore-issues', '*'],
      mode,
      8
    );
    stages.push({
      name: 'tag-1.0.1',
      state: await snapshot(directory),
      status: await command(directory, ['status', '--json'], 'node', 9),
      history: await command(directory, ['log', 'component', '--json'], 'node', 9),
    });
    assert.equal(stages[0].state.versions.length, 1);
    assert.equal(stages[1].state.versions.length, 2);
    assert.equal(stages[2].state.versions.length, 3);
    assert.deepEqual(Object.keys(stages[2].state.component.versions).sort(), ['1.0.0', '1.0.1']);
    const first = stages[0].state.component.head;
    const snapped = stages[1].state.component.head;
    const final = stages[2].state.component.head;
    assert.deepEqual(stages[1].state.versions.find((version) => version.hash === snapped).parents, [first]);
    assert.deepEqual(stages[2].state.versions.find((version) => version.hash === final).parents, [snapped]);
    for (const [ordinal, stage] of stages.entries()) {
      assert.deepEqual(stage.status.modifiedComponents, []);
      const current = stage.state.versions.find((version) => version.hash === stage.state.component.head);
      const expectedSources = {
        'index.js': Buffer.from(`module.exports = "${['initial', 'snapped', 'final'][ordinal]}";\n`),
        'second.js': Buffer.from(`exports.value = ${ordinal + 1};\n`),
        'binary.bin': Buffer.from([0, 255, 13, 10, 254]),
      };
      for (const file of current.files) {
        const bytes = Buffer.from(stage.state.objects[file.file], 'hex');
        const expected =
          expectedSources[file.relativePath] ||
          Buffer.from(
            `file ${Number(file.relativePath.match(/extra-(\d+)/)[1])} stage ${Number(file.relativePath.match(/extra-(\d+)/)[1]) % 2 ? 0 : ordinal}\n`.padEnd(
              4095,
              String(Number(file.relativePath.match(/extra-(\d+)/)[1]) % 10)
            ) + '\n'
          );
        assert.deepEqual(
          bytes.subarray(bytes.indexOf(0) + 1),
          expected,
          'stored Source preserves canonical BOM/EOL/binary semantics'
        );
      }
    }
    runs.push({ ...entry, stages, measurements });
    if (runs.length > 1)
      assert.deepEqual(stages, runs[0].stages, `${mode} stored objects, index, bitmap and status parity`);
  }
  await verifyProvenance();
  assert.equal(digest(await fs.readFile(traceHarness)), traceSha256, 'trace harness changed');
  if (modes.includes('native') && options.diagnostics !== false) {
    assert.equal(diagnostics.length, 3);
    assert.ok(
      diagnostics.some(({ trace }) => trace.snapshot.index.frames > 0),
      'actual snapshots must plan the object index'
    );
    assert.ok(
      diagnostics.some(({ trace }) => trace.snapshot.indexWrite.frames > 0),
      'actual snapshots must persist the object index'
    );
    for (const { trace } of diagnostics)
      for (const kind of ['index', 'indexWrite']) {
        assert.equal(trace.snapshot[kind].completed, trace.snapshot[kind].files);
        assert.equal(trace.snapshot[kind].failed, 0);
      }
  }
  const report = {
    schemaVersion: 1,
    cliProvenance: provenance,
    temporary,
    cliRoot,
    helperSha256,
    harnessSha256,
    deterministicSha256,
    traceSha256,
    diagnostics,
    rounds,
    workload: { components: 1, versions: 3, filesPerVersion: 3 + extraFiles },
    measurement:
      'GNU time complete command CPU and 10ms sampled simultaneous process-tree RSS on Linux; setup, warmups and traced diagnostics excluded',
    runs,
  };
  if (options.report) await fs.writeFile(options.report, JSON.stringify(report, null, 2) + '\n');
  return report;
}
module.exports = { runQualification };
if (require.main === module)
  runQualification(process.argv[2], process.argv[3], {
    rounds: process.env.BIT_SNAPSHOT_QUALIFICATION_ROUNDS,
    extraFiles: process.env.BIT_SNAPSHOT_QUALIFICATION_EXTRA_FILES,
    measure: process.env.BIT_SNAPSHOT_QUALIFICATION_MEASURE === '1',
    diagnostics: process.env.BIT_SNAPSHOT_QUALIFICATION_MEASURE !== '1',
    modes: process.env.BIT_SNAPSHOT_QUALIFICATION_NODE_ONLY === '1' ? ['node'] : undefined,
    scratch: process.env.BIT_SNAPSHOT_QUALIFICATION_TMPDIR,
    report: process.env.BIT_SNAPSHOT_QUALIFICATION_REPORT,
  })
    .then((report) => console.log(JSON.stringify({ temporary: report.temporary, modes: report.runs.length })))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
