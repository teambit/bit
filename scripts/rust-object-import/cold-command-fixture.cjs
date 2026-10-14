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

async function createFixture(cli, temporary, { extraFiles = 0 } = {}) {
  assert.ok(Number.isInteger(extraFiles) && extraFiles >= 0 && extraFiles <= 2048, 'extraFiles must be 0..2048');
  const load = createRequire(path.join(cli, 'package.json'));
  const globals = benchmarkGlobals(temporary);
  const scopeName = 'qualification.command';
  const id = `${scopeName}/component`;
  const dependencyId = `${scopeName}/dependency`;
  const peerId = `${scopeName}/peer`;
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
  await write(author, 'peer/index.js', 'module.exports = "peer-one";\n');
  await write(author, 'dependency/index.js', 'module.exports = "dependency";\n');
  await write(
    author,
    'component/index.js',
    "const dependency = require('@qualification/command.dependency');\nexports.first = 'one';\nexports.stable = 1;\nexports.last = 'one';\nexports.dependency = dependency;\n"
  );
  await write(author, 'component/stable.txt', 'first\nsecond\nthird\n');
  await write(author, 'component/removed.js', 'module.exports = "old";\n');
  const extraSources = Array.from({ length: extraFiles }, (_, index) => ({
    relative: `extra/group-${index % 16}/source-${String(index).padStart(4, '0')}.js`,
    body: `// Ordinary tracked source ${index}.\nmodule.exports = ${index};\n`,
  }));
  for (const source of extraSources) await write(author, `component/${source.relative}`, source.body);
  for (const name of ['dependency', 'component', 'peer'])
    command(author, ['add', name, '--id', name, '--main', 'index.js']);
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
  command(consumer, ['import', id, dependencyId, peerId, '--skip-dependency-installation']);
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
  await write(author, 'peer/index.js', 'module.exports = "peer-two";\n');
  tag(author, '1.0.1', 'peer');
  command(author, ['export', '--ignore-missing-artifacts']);
  const remoteTwo = path.join(temporary, 'remote-two');
  await fs.cp(remote, remoteTwo, { recursive: true });
  await write(author, 'peer/index.js', "module.exports = require('@qualification/command.dependency');\n");
  tag(author, '1.0.2', 'peer');
  command(author, ['export', '--ignore-missing-artifacts']);
  const remoteGraph = path.join(temporary, 'remote-graph');
  await fs.cp(remote, remoteGraph, { recursive: true });
  await write(
    author,
    'component/index.js',
    "const dependency = require('@qualification/command.dependency');\nexports.first = 'three';\nexports.stable = 1;\nexports.last = 'one';\nexports.dependency = dependency;\n"
  );
  tag(author, '1.0.2', 'component');
  command(author, ['export', '--ignore-missing-artifacts']);
  const remoteThree = path.join(temporary, 'remote-three');
  await fs.cp(remote, remoteThree, { recursive: true });
  // Canonically produced incoming graphs exercise post-merge detection against
  // retained added/deleted files, rather than the pre-merge workspace on disk.
  await write(author, 'component/support.js', 'exports.value = 7;\n');
  await write(author, 'component/support.ts', 'export const typed = 9;\n');
  await write(author, 'component/load-support.js', "module.exports = require('./support').value;\n");
  await write(
    author,
    'component/fresh.test.ts',
    "import dependency from '@qualification/command.dependency';\nexport const test = dependency;\n"
  );
  await write(author, 'component/fresh.spec.js', 'exports.test = 1;\n');
  await write(
    author,
    'component/index.js',
    "const dependency = require('@qualification/command.dependency');\nexports.first = 'four';\nexports.stable = 1;\nexports.last = 'one';\nexports.dependency = dependency;\n"
  );
  tag(author, '1.0.3', 'component');
  command(author, ['export', '--ignore-missing-artifacts']);
  const remoteAddedFiles = path.join(temporary, 'remote-added-files');
  await fs.cp(remote, remoteAddedFiles, { recursive: true });
  await fs.rm(path.join(author, 'component/fresh.spec.js'));
  await fs.rm(path.join(author, 'component/added.js'));
  await write(
    author,
    'component/index.js',
    "const dependency = require('./support').value;\nexports.first = 'five';\nexports.stable = 1;\nexports.last = 'one';\nexports.dependency = dependency;\n"
  );
  tag(author, '1.0.4', 'component');
  command(author, ['export', '--ignore-missing-artifacts']);
  const remoteDevDependency = path.join(temporary, 'remote-dev-dependency');
  await fs.cp(remote, remoteDevDependency, { recursive: true });
  await write(author, 'peer/unsupported.docs.js', 'module.exports = {};\n');
  tag(author, '1.0.3', 'peer');
  command(author, ['export', '--ignore-missing-artifacts']);
  const remoteUnsupportedCallbacks = path.join(temporary, 'remote-unsupported-callbacks');
  await fs.cp(remote, remoteUnsupportedCallbacks, { recursive: true });
  await write(
    author,
    'component/component.json',
    JSON.stringify({
      componentId: { scope: scopeName, name: 'component', version: '1.0.4' },
      extensions: {
        'teambit.dependencies/dependency-resolver': {
          policy: { devDependencies: [{ name: '@types/node', version: '^22.10.5', force: true }] },
        },
      },
    })
  );
  tag(author, '1.0.5', 'component');
  command(author, ['export', '--ignore-missing-artifacts']);
  const remotePolicy = path.join(temporary, 'remote-policy');
  await fs.cp(remote, remotePolicy, { recursive: true });
  const bitmap = load('comment-json').parse(await fs.readFile(path.join(consumer, '.bitmap'), 'utf8'));
  const roots = Object.entries(bitmap)
    .filter(([, entry]) => entry?.rootDir)
    .map(([, entry]) => entry.rootDir);
  const importedComponent = Object.entries(bitmap).find(([name]) => name === 'component' || name === id)?.[1];
  assert.ok(importedComponent?.rootDir, 'fixture imported component root');
  for (const source of extraSources)
    assert.equal(
      await fs.readFile(path.join(consumer, importedComponent.rootDir, source.relative), 'utf8'),
      source.body,
      'extra source must be tagged, exported and imported before qualification'
    );
  async function stageFastForward(directory, componentId, incomingVersion = '1.0.1') {
    // Import merges nondivergent local heads. Restore the prior local head using
    // canonical persistence to model an already-fetched, unapplied remote head.
    const { ComponentID } = load('@teambit/component-id');
    const scope = await Scope.load(path.join(directory, '.bit'), false);
    const { LaneId } = load('@teambit/lane-id');
    const model = await scope.getModelComponent(ComponentID.fromString(componentId));
    const current = model.versions['1.0.0'];
    const incoming = model.versions[incomingVersion];
    assert.ok(current && incoming && current.toString() !== incoming.toString());
    assert.equal(model.head.toString(), incoming.toString(), 'remote import installed advanced model head');
    const remoteHead = await scope.objects.remoteLanes.getRef(
      LaneId.from('main', scopeName),
      ComponentID.fromString(componentId)
    );
    assert.equal(remoteHead?.toString(), incoming.toString(), 'cached remote head is ahead');
    model.head = current;
    await scope.objects.writeObjectsToTheFS([model]);
    Scope.scopeCache = {};
  }
  async function stageHarmony1(directory, componentId) {
    // Stage historical compatibility metadata through canonical serialization;
    // schema/docs are outside Version.id(), so object identity must not change.
    const { ComponentID } = load('@teambit/component-id');
    const scope = await Scope.load(path.join(directory, '.bit'), false);
    const model = await scope.getModelComponent(ComponentID.fromString(componentId));
    const version = await model.loadVersion('2.0.0', scope.objects);
    const identity = version.id();
    assert.ok(version.flattenedEdgesRef || version.dependenciesGraphRef, 'real retained dependency graph');
    version.schema = '1.0.0';
    version.docs = undefined;
    assert.equal(version.id(), identity, 'compatibility metadata preserves Version identity');
    await scope.objects.writeObjectsToTheFS([version]);
    Scope.scopeCache = {};
  }
  async function seedUnrelatedCache(directory) {
    const cacache = createRequire(load.resolve('@teambit/workspace.modules.fs-cache'))('cacache');
    await new Promise((resolve) => setTimeout(resolve, 2));
    await cacache.put(path.join(directory, '.bit/cache/components/deps'), 'unrelated/stale@1.0.0', 'obsolete');
    const { FsCache, dependencyCacheNeedsInvalidation } = load('@teambit/workspace.modules.fs-cache');
    assert.equal(
      await dependencyCacheNeedsInvalidation(
        new FsCache(path.join(directory, '.bit')),
        directory,
        path.join(directory, 'workspace.jsonc')
      ),
      false,
      'unrelated entry is fresh before autosnap resets the cache'
    );
  }
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
    extraFiles,
    temporary,
    globals,
    author,
    consumer,
    local,
    remote,
    remoteOne,
    remoteTwo,
    remoteThree,
    remoteGraph,
    remoteAddedFiles,
    remoteDevDependency,
    remoteUnsupportedCallbacks,
    remotePolicy,
    scopeName,
    id,
    dependencyId,
    peerId,
    roots,
    command,
    state,
    stageFastForward,
    stageHarmony1,
    seedUnrelatedCache,
    tag,
    write,
  };
}

module.exports = { createFixture, rebaseLinks };
