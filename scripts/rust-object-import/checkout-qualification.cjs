// Actual checkout/reset/revert against distinct production Source and Version objects.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { createBenchmarkProcessControl } = require('../rust-dependency-analysis/process-tree-memory-control.cjs');
const { createProcessTreeMemorySampler } = require('../rust-dependency-analysis/process-tree-memory.cjs');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function createCheckoutFixture(cliRoot, directory, options = {}) {
  const extraFiles = Number(options.extraFiles || 0);
  assert.ok(Number.isInteger(extraFiles) && extraFiles >= 0 && extraFiles <= 4092);
  const load = createRequire(path.join(cliRoot, 'package.json'));
  const { Scope } = load('@teambit/legacy.scope');
  const { Source, Version, ModelComponent, VersionHistory } = load('@teambit/objects');
  const scopeName = 'qualification.checkout';
  const scope = await Scope.ensure(directory, scopeName);
  await scope.ensureDir();
  const definitions = [
    {
      'index.js': Buffer.from('export default "one";\n'),
      'removed.js': Buffer.from('export const removed = 1;\n'),
      'Case.js': Buffer.from('export default "upper";\n'),
      'binary.bin': Buffer.from([0, 255, 13, 10, 128]),
    },
    {
      'index.js': Buffer.from('export default "two";\n'),
      'added.js': Buffer.from('export const added = 2;\n'),
      'case.js': Buffer.from('export default "lower";\n'),
      'binary.bin': Buffer.from([0, 254, 13, 10, 129]),
    },
  ];
  for (let index = 0; index < extraFiles; index++) {
    for (let version = 0; version < definitions.length; version++) {
      // Half the additional files are unchanged; the rest change independently per version.
      const contents = Buffer.alloc(4096, 97);
      contents.write(`/* extra ${index} version ${index % 2 ? version : 0} `);
      contents.write(' */\nexport default 1;\n', contents.length - 22);
      definitions[version][`extra-${String(index).padStart(4, '0')}.js`] = contents;
    }
  }
  const objects = [];
  const versions = [];
  const sourceRefs = {};
  for (const [index, files] of definitions.entries()) {
    const models = Object.entries(files).map(([relativePath, contents]) => {
      const source = Source.from(contents);
      objects.push(source);
      sourceRefs[`${index}/${relativePath}`] = source.hash().toString();
      return { name: path.basename(relativePath), relativePath, test: false, file: source.hash() };
    });
    const version = new Version({
      schema: '1.0.0',
      mainFile: 'index.js',
      bindingPrefix: '@qualification',
      devPackageDependencies: { '@types/jest': '26.0.20', '@types/node': '22.10.5' },
      overrides: { devDependencies: { '@types/jest': '26.0.20', '@types/node': '22.10.5' } },
      files: models,
      log: {
        message: `checkout fixture ${index}`,
        date: String(1700000000000 + index),
        username: 'fixture',
        email: 'fixture@example.invalid',
      },
      parents: index ? [versions[index - 1].hash()] : [],
    });
    version._hash = version.calculateHash().toString();
    version.validate();
    versions.push(version);
  }
  const component = ModelComponent.from({
    name: 'component',
    scope: scopeName,
    versions: { '1.0.0': versions[0].hash(), '1.0.1': versions[1].hash() },
    head: versions[1].hash(),
  });
  const history = new VersionHistory({
    name: 'component',
    scope: scopeName,
    versions: versions.map((v) => ({ hash: v.hash(), parents: v.parents })),
    graphCompleteRefs: versions.map((v) => v.hash().toString()),
  });
  await scope.objects.writeObjectsToTheFS([...objects, ...versions, history, component]);
  Scope.scopeCache = {};
  return {
    id: `${scopeName}/component`,
    remotes: { [scopeName]: `file://${directory}` },
    definitions,
    sourceRefs,
    versionRefs: versions.map((v) => v.hash().toString()),
  };
}
async function runQualification(cliRoot, helper, options = {}) {
  cliRoot = path.resolve(cliRoot);
  helper = path.resolve(helper);
  const helperSha256 = digest(await fs.readFile(helper));
  const harnessSha256 = digest(await fs.readFile(__filename));
  const provenance = JSON.parse(await fs.readFile(path.join(cliRoot, '.bit-object-import-build.json'), 'utf8'));
  const repository = path.resolve(__dirname, '../..');
  for (const [filename, expected] of Object.entries(provenance.sourceSha256)) {
    assert.equal(digest(await fs.readFile(path.join(repository, filename))), expected, `source provenance ${filename}`);
  }
  for (const module of provenance.compiledModules)
    assert.equal(
      digest(await fs.readFile(path.join(cliRoot, 'node_modules/@teambit', module.path))),
      module.sha256,
      `compiled provenance ${module.path}`
    );
  const temporary = await fs.mkdtemp(path.join(options.scratch || os.tmpdir(), 'bit-real-checkout-'));
  const globals = benchmarkGlobals(temporary);
  const fixture = await createCheckoutFixture(cliRoot, path.join(temporary, 'remote'), {
    extraFiles: options.extraFiles,
  });
  const load = createRequire(path.join(cliRoot, 'package.json'));
  const eol = load('@teambit/toolbox.string.eol');
  const baseEnv = {
    ...process.env,
    BIT_GLOBALS_DIR: globals,
    CI: '1',
    BIT_RUST_OBJECT_IMPORT: helper,
    BIT_RUST_OBJECT_TAR: 'off',
    BIT_RUST_OBJECT_IMPORT_OPERATION: 'off',
    BIT_RUST_WORKSPACE_MATERIALIZATION: 'off',
    BIT_RUST_WORKSPACE_PERSISTENCE: 'off',
    BIT_RUST_CLIENT_VCS: 'off',
  };
  let commandOrdinal = 0;
  const measureTree = process.platform === 'linux';
  async function command(cwd, args, native, executable = helper, traceFile) {
    const cpuFile = path.join(cwd, `cpu-${commandOrdinal++}.txt`);
    const started = performance.now();
    const result = await new Promise((resolve, reject) => {
      const commandArgs = [path.join(cliRoot, 'bin/bit.js'), ...args];
      if (traceFile) commandArgs.unshift('--require', path.join(__dirname, 'import-trace.cjs'));
      const env = { ...baseEnv, BIT_RUST_OBJECT_IMPORT: executable, BIT_RUST_CLIENT_VCS: native ? 'on' : 'off' };
      delete env.BIT_IMPORT_TRACE;
      delete env.BIT_IMPORT_TRACE_OWNER;
      if (traceFile) env.BIT_IMPORT_TRACE = traceFile;
      const child = cp.spawn(
        measureTree ? '/usr/bin/time' : process.execPath,
        measureTree ? ['-f', '%U %S', '-o', cpuFile, process.execPath, ...commandArgs] : commandArgs,
        {
          cwd,
          env,
          detached: measureTree,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );
      const sampler = measureTree ? createProcessTreeMemorySampler(child.pid, { intervalMs: 10 }) : undefined;
      sampler?.start();
      let stdout = '',
        stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      const control = measureTree ? createBenchmarkProcessControl(child, { timeoutMs: 120000 }) : undefined;
      const timer = measureTree ? undefined : setTimeout(() => child.kill('SIGKILL'), 120000);
      child.once('error', (error) => {
        sampler?.stop();
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (control?.failure) {
          sampler?.stop();
          reject(control.failure);
          return;
        }
        resolve({ code, stdout, stderr, wallMs: performance.now() - started, processTree: sampler?.stop() });
      });
    });
    assert.equal(result.code, 0, `${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
    if (measureTree) {
      const [user, system] = (await fs.readFile(cpuFile, 'utf8')).trim().split(/\s+/).map(Number);
      result.cpuSeconds = { user, system, total: user + system };
    }
    return result;
  }
  async function bitmap(directory) {
    const map = load('comment-json').parse(await fs.readFile(path.join(directory, '.bitmap'), 'utf8'));
    const entry = Object.values(map).find((value) => value && `${value.scope}/${value.name}` === fixture.id);
    assert.ok(entry?.rootDir, 'fixture bitmap entry');
    return entry;
  }
  async function verify(directory, version, bitmapVersion) {
    const entry = await bitmap(directory);
    assert.equal(entry.version, bitmapVersion);
    const root = path.join(directory, entry.rootDir);
    const files = fixture.definitions[version];
    for (const [filename, bytes] of Object.entries(files))
      assert.deepEqual(await fs.readFile(path.join(root, filename)), eol.auto(bytes), filename);
    const actual = (await fs.readdir(root)).filter((name) => name !== 'package.json').sort();
    assert.deepEqual(actual, Object.keys(files).sort(), 'tracked files after checkout');
    return {
      bitmapVersion,
      files: Object.fromEntries(
        await Promise.all(
          Object.keys(files)
            .sort()
            .map(async (filename) => [filename, digest(await fs.readFile(path.join(root, filename)))])
        )
      ),
    };
  }
  const runs = [];
  const rounds = Number(options.rounds || 1);
  assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 100);
  const schedule = [];
  if (rounds > 1) for (const mode of ['node', 'native']) schedule.push({ mode, round: -1, warmup: true });
  for (let round = 0; round < rounds; round++)
    for (const mode of round % 2 ? ['native', 'node'] : ['node', 'native'])
      schedule.push({ mode, round, warmup: false });
  for (const mode of ['missing-helper', 'crashed-helper'])
    schedule.push({ mode, round: 0, warmup: false, fallback: true });
  for (const { mode, round, warmup, fallback } of schedule) {
    const directory = path.join(temporary, `${mode}-${warmup ? 'warmup' : round}`);
    await fs.mkdir(directory);
    await command(directory, ['init', '--skip-interactive', '--default-scope', 'qualification.destination'], false);
    const scopeFile = path.join(directory, '.bit/scope.json');
    const scopeJson = JSON.parse(await fs.readFile(scopeFile, 'utf8'));
    scopeJson.remotes = fixture.remotes;
    await fs.writeFile(scopeFile, JSON.stringify(scopeJson));
    await fs.writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: 'checkout-qualification', private: true, type: 'module' })
    );
    await command(
      directory,
      ['import', `${fixture.id}@1.0.1`, '--all-history', '--skip-dependency-installation', '--override', '--safe-mode'],
      false
    );
    await verify(directory, 1, '1.0.1');
    const selectedHelper =
      mode === 'missing-helper'
        ? path.join(directory, 'missing-helper')
        : mode === 'crashed-helper'
          ? process.execPath
          : helper;
    const checkout = await command(
      directory,
      ['checkout', '1.0.0', fixture.id, '--skip-dependency-installation'],
      mode !== 'node',
      selectedHelper
    );
    const checkoutState = await verify(directory, 0, '1.0.0');
    const entry = await bitmap(directory);
    const root = path.join(directory, entry.rootDir);
    await fs.writeFile(path.join(root, 'index.js'), 'local edits\n');
    await fs.rm(path.join(root, 'removed.js'));
    const reset = await command(
      directory,
      ['checkout', 'reset', fixture.id, '--skip-dependency-installation'],
      mode !== 'node',
      selectedHelper
    );
    const resetState = await verify(directory, 0, '1.0.0');
    const revert = await command(
      directory,
      ['revert', fixture.id, '1.0.1', '--skip-dependency-installation'],
      mode !== 'node',
      selectedHelper
    );
    const revertState = await verify(directory, 1, '1.0.0');
    let diagnostic;
    if (mode === 'native' && round === 0 && !warmup) {
      // Diagnostic commands are excluded from the measured operations above.
      await command(directory, ['checkout', 'reset', fixture.id, '--skip-dependency-installation'], true);
      const traceFile = path.join(directory, 'checkout-trace.json');
      await command(
        directory,
        ['checkout', '1.0.1', fixture.id, '--skip-dependency-installation'],
        true,
        helper,
        traceFile
      );
      const trace = JSON.parse(await fs.readFile(traceFile, 'utf8'));
      const writes = trace.checkout.write;
      assert.ok(writes.files > 0, 'actual checkout must write preflighted sources through BWC1');
      assert.equal(writes.completed, writes.files);
      assert.equal(writes.failed, 0);
      assert.ok(trace.checkout.plan.files > 0, 'actual checkout must use the BCK1 native plan');
      assert.equal(trace.checkout.plan.completed, trace.checkout.plan.files);
      assert.equal(trace.checkout.plan.failed, 0);
      assert.equal(trace.persistence.helpers, 1, 'checkout planning, removals and source writes must reuse one helper');
      diagnostic = { trace, state: await verify(directory, 1, '1.0.1') };
    }
    runs.push({
      mode,
      round,
      warmup,
      fallback: Boolean(fallback),
      checkout,
      reset,
      revert,
      checkoutState,
      resetState,
      revertState,
      diagnostic,
    });
  }
  for (const operation of ['checkoutState', 'resetState', 'revertState'])
    for (const run of runs.slice(1))
      assert.deepEqual(run[operation], runs[0][operation], `${run.mode} ${operation} parity`);
  for (const [filename, expected] of Object.entries(provenance.sourceSha256))
    assert.equal(
      digest(await fs.readFile(path.join(repository, filename))),
      expected,
      `source changed during qualification ${filename}`
    );
  for (const module of provenance.compiledModules)
    assert.equal(
      digest(await fs.readFile(path.join(cliRoot, 'node_modules/@teambit', module.path))),
      module.sha256,
      `compiled module changed during qualification ${module.path}`
    );
  assert.equal(digest(await fs.readFile(helper)), helperSha256, 'helper changed during qualification');
  assert.equal(digest(await fs.readFile(__filename)), harnessSha256, 'harness changed during qualification');
  const report = {
    schemaVersion: 1,
    temporary,
    node: process.version,
    helperSha256,
    cliProvenance: provenance,
    harnessSha256,
    rounds,
    workload: {
      components: 1,
      versions: fixture.definitions.length,
      filesPerVersion: Object.keys(fixture.definitions[0]).length,
      extraFiles: Object.keys(fixture.definitions[0]).length - 4,
      sourceBytesPerVersion: fixture.definitions.map((files) =>
        Object.values(files).reduce((sum, bytes) => sum + bytes.length, 0)
      ),
    },
    measurement: measureTree
      ? 'GNU time command CPU; 10ms simultaneous process-tree RSS including helpers; setup, warmups and trace diagnostics excluded from retained runs'
      : 'wall time only',
    runs,
  };
  if (options.report) await fs.writeFile(options.report, JSON.stringify(report, null, 2));
  return report;
}
module.exports = { createCheckoutFixture, runQualification };
if (require.main === module)
  runQualification(process.argv[2], process.argv[3], {
    scratch: process.env.BIT_CHECKOUT_QUALIFICATION_TMPDIR,
    report: process.env.BIT_CHECKOUT_QUALIFICATION_REPORT,
    rounds: process.env.BIT_CHECKOUT_QUALIFICATION_ROUNDS,
    extraFiles: process.env.BIT_CHECKOUT_QUALIFICATION_EXTRA_FILES,
  })
    .then((report) => console.log(JSON.stringify({ temporary: report.temporary, runs: report.runs.length })))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
