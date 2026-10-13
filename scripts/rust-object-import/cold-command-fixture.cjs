const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const { capture, readTree } = require('./checkout-transition-fixture.cjs');

async function rebaseLinks(directory, from, to) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await rebaseLinks(filename, from, to);
    else if (entry.isSymbolicLink()) {
      const target = await fs.readlink(filename);
      if (target.startsWith(from + path.sep)) {
        await fs.unlink(filename);
        await fs.symlink(path.join(to, path.relative(from, target)), filename);
      }
    }
  }
}

async function createFixture(cli, temporary) {
  const load = createRequire(path.join(cli, 'package.json'));
  const globals = benchmarkGlobals(temporary);
  const scopeName = 'qualification.command';
  const id = `${scopeName}/component`;
  const dependencyId = `${scopeName}/dependency`;
  const remote = path.join(temporary, 'remote');
  const author = path.join(temporary, 'author');
  const consumer = path.join(temporary, 'consumer');
  let ordinal = 0;
  function command(directory, args, options = {}) {
    const env = {
      ...process.env,
      CI: '',
      BIT_GLOBALS_DIR: globals,
      BIT_RUST_CLIENT_VCS: options.native ? 'on' : 'off',
      BIT_CHECKOUT_TRANSITION_QUALIFICATION_SEED: options.seed || `cold-command-${ordinal++}`,
      BIT_CHECKOUT_TRANSITION_QUALIFICATION_CLOCK: '1800000000000',
      BIT_CHECKOUT_TRANSITION_DISPLAY_DURATION: 'deterministic',
    };
    for (const key of [
      'BIT_IMPORT_TRACE',
      'BIT_IMPORT_TRACE_OWNER',
      'BIT_RUST_DEPENDENCY_SCANNER',
      'BIT_RUST_OBJECT_TAR',
      'BIT_RUST_OBJECT_IMPORT_OPERATION',
    ])
      delete env[key];
    if (options.helper) env.BIT_RUST_OBJECT_IMPORT = options.helper;
    if (options.trace) env.BIT_IMPORT_TRACE = options.trace;
    const nodeArgs = ['--require', path.join(__dirname, 'checkout-transition-determinism.cjs')];
    delete env.BIT_COLD_COMMAND_WRAPPER_BASELINE;
    if (options.wrapper) {
      env.BIT_COLD_COMMAND_WRAPPER_BASELINE = '1';
      nodeArgs.push('--require', path.join(__dirname, 'cold-command-wrapper-baseline.cjs'));
    }
    if (options.trace) nodeArgs.push('--require', path.join(__dirname, 'import-trace.cjs'));
    nodeArgs.push(path.join(cli, 'bin/bit.js'), ...args);
    if (options.measure) {
      assert.equal(options.systemTrace, undefined, 'measurement excludes system tracing');
      assert.equal(options.trace, undefined, 'measurement excludes diagnostic tracing');
      return require('./merge-history-measurement.cjs')
        .measuredCommand(nodeArgs, {
          cwd: directory,
          env,
          operation: args.join(' '),
          step: options.measure.step,
          cpuDirectory: temporary,
        })
        .then(({ result, measurement }) => {
          options.measure.record(measurement);
          return { code: 0, ...result };
        });
    }
    const observedArgs = options.systemTrace
      ? [
          '-f',
          '-yy',
          '-s',
          '32',
          '-e',
          'trace=execve,clone,clone3,prctl,read,pread64',
          '-o',
          options.systemTrace,
          process.execPath,
          ...nodeArgs,
        ]
      : nodeArgs;
    const result = spawnSync(options.systemTrace ? 'strace' : process.execPath, observedArgs, {
      cwd: directory,
      env,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    const output = { code: result.status, stdout: result.stdout, stderr: result.stderr };
    if (!options.allowFailure) assert.equal(output.code, 0, `${args.join(' ')}\n${output.stderr}\n${output.stdout}`);
    return output;
  }
  async function scopeConfig(directory, update) {
    const filename = path.join(directory, '.bit/scope.json');
    const value = JSON.parse(await fs.readFile(filename));
    await fs.writeFile(filename, JSON.stringify({ ...value, ...update }));
  }
  async function write(directory, relative, body) {
    const filename = path.join(directory, relative);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, body);
  }
  async function installNodeTypes(directory) {
    for (const [name, version] of [
      ['jest', '26.0.20'],
      ['node', '22.10.5'],
    ]) {
      await write(
        directory,
        `node_modules/@types/${name}/package.json`,
        JSON.stringify({ name: `@types/${name}`, version, types: 'index.d.ts' })
      );
      await write(directory, `node_modules/@types/${name}/index.d.ts`, 'export {};\n');
    }
  }
  function tag(directory, version, component) {
    command(directory, [
      'tag',
      ...(component ? [component] : []),
      '--ver',
      version,
      '--message',
      `version ${version}`,
      '--soft',
      '--skip-auto-tag',
      '--disable-tag-pipeline',
      '--ignore-issues',
      '*',
    ]);
    command(directory, [
      'tag',
      '--persist=skip-build',
      '--skip-auto-tag',
      '--disable-tag-pipeline',
      '--ignore-issues',
      '*',
    ]);
  }
  await fs.mkdir(author, { recursive: true });
  command(author, ['init', '--skip-interactive', '--default-scope', scopeName]);
  await scopeConfig(author, { name: scopeName });
  await installNodeTypes(author);
  await write(author, 'dependency/index.js', 'module.exports = "dependency";\n');
  await write(
    author,
    'component/index.js',
    "const dependency = require('@qualification/command.dependency');\nexports.first = 'one';\nexports.stable = 1;\nexports.last = 'one';\nexports.dependency = dependency;\n"
  );
  await write(author, 'component/stable.txt', 'first\nsecond\nthird\n');
  await write(author, 'component/removed.js', 'module.exports = "old";\n');
  for (const name of ['dependency', 'component']) command(author, ['add', name, '--id', name, '--main', 'index.js']);
  command(author, ['link']);
  tag(author, '1.0.0');
  const local = path.join(temporary, 'local');
  await fs.cp(author, local, { recursive: true, verbatimSymlinks: true });
  await rebaseLinks(local, author, local);
  const { Scope } = load('@teambit/legacy.scope');
  const bare = await Scope.ensure(remote, scopeName);
  await bare.ensureDir();
  Scope.scopeCache = {};
  await scopeConfig(author, { name: 'qualification.author', remotes: { [scopeName]: `file://${remote}` } });
  command(author, ['export', '--ignore-missing-artifacts']);
  const remoteOne = path.join(temporary, 'remote-one');
  await fs.cp(remote, remoteOne, { recursive: true });
  await fs.mkdir(consumer);
  command(consumer, ['init', '--skip-interactive', '--default-scope', scopeName]);
  await scopeConfig(consumer, { name: 'qualification.consumer', remotes: { [scopeName]: `file://${remote}` } });
  command(consumer, ['import', id, dependencyId, '--skip-dependency-installation']);
  command(consumer, ['link']);
  await installNodeTypes(consumer);
  await write(
    author,
    'component/index.js',
    "const dependency = require('@qualification/command.dependency');\nexports.first = 'two';\nexports.stable = 1;\nexports.last = 'one';\nexports.dependency = dependency;\n"
  );
  await fs.rm(path.join(author, 'component/removed.js'));
  await write(author, 'component/added.js', 'module.exports = "new";\n');
  tag(author, '1.0.1', 'component');
  command(author, ['export', '--ignore-missing-artifacts']);
  const remoteTwo = path.join(temporary, 'remote-two');
  await fs.cp(remote, remoteTwo, { recursive: true });
  const bitmap = load('comment-json').parse(await fs.readFile(path.join(consumer, '.bitmap'), 'utf8'));
  const roots = Object.entries(bitmap)
    .filter(([, entry]) => entry?.rootDir)
    .map(([, entry]) => entry.rootDir);
  async function state(directory) {
    const currentBitmap = load('comment-json').parse(await fs.readFile(path.join(directory, '.bitmap'), 'utf8'));
    const currentRoots = Object.values(currentBitmap)
      .filter((entry) => entry?.rootDir)
      .map((entry) => entry.rootDir);
    const result = await capture(directory, currentRoots);
    result.remoteRefs = await readTree(path.join(directory, '.bit/refs/remotes'));
    result.events = await readTree(path.join(directory, '.bit/events'));
    result.packageJson = (await fs.readFile(path.join(directory, 'package.json'))).toString('hex');
    result.generatedPackages = await readTree(path.join(directory, 'node_modules'));
    const cacache = createRequire(load.resolve('@teambit/workspace.modules.fs-cache'))('cacache');
    const cache = path.join(directory, '.bit/cache/components/deps');
    cacache.clearMemoized();
    result.dependenciesCache = {};
    for (const key of Object.keys(await cacache.ls(cache)).sort())
      result.dependenciesCache[key] = (await cacache.get(cache, key)).data.toString();
    const docs = path.join(directory, '.bit/cache/components/docs');
    result.docsCache = {};
    for (const key of Object.keys(await cacache.ls(docs)).sort())
      result.docsCache[key] = (await cacache.get(docs, key)).data.toString();
    const readOptional = async (name) =>
      fs.readFile(path.join(directory, '.bit', name), 'utf8').catch((error) => {
        if (error.code === 'ENOENT') return '';
        throw error;
      });
    result.commandHistory = (await readOptional('command-history')).replace(/^\S+ \d+ /gm, '');
    result.bitmapHistoryReasons = (await readOptional('bitmap-history-metadata.txt')).replace(/^\S+ /gm, '');
    result.bitmapHistory = [
      ...new Set(
        Object.values(await readTree(path.join(directory, '.bit/bitmap-history'))).map((value) => JSON.stringify(value))
      ),
    ].sort();
    return result;
  }
  return {
    cli,
    temporary,
    globals,
    author,
    consumer,
    local,
    remote,
    remoteOne,
    remoteTwo,
    scopeName,
    id,
    dependencyId,
    roots,
    command,
    state,
    tag,
    write,
  };
}

module.exports = { createFixture, rebaseLinks };
