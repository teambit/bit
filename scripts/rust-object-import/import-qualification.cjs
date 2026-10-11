// Actual compiled `bit import --objects`; all destinations, globals and evidence are disposable.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const { createFixture, seedDestination, verify } = require('./scope-fixture.cjs');
const { createProcessTreeMemorySampler } = require('../rust-dependency-analysis/process-tree-memory.cjs');
const { createBenchmarkProcessControl } = require('../rust-dependency-analysis/process-tree-memory-control.cjs');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');
const cliRoot = path.resolve(process.argv[2] || '');
const helper = path.resolve(process.argv[3] || '');
const baselineCli = process.env.BIT_IMPORT_QUALIFICATION_BASELINE_CLI
  ? path.resolve(process.env.BIT_IMPORT_QUALIFICATION_BASELINE_CLI)
  : undefined;
const baselineHelper = process.env.BIT_IMPORT_QUALIFICATION_BASELINE_HELPER
  ? path.resolve(process.env.BIT_IMPORT_QUALIFICATION_BASELINE_HELPER)
  : helper;
const rounds = Number(process.env.BIT_IMPORT_QUALIFICATION_ROUNDS || 9);
const smoke = process.env.BIT_IMPORT_QUALIFICATION_SMOKE === '1';
const packaged = process.env.BIT_IMPORT_QUALIFICATION_PACKAGED === '1';
const transport = process.env.BIT_IMPORT_QUALIFICATION_TRANSPORT || 'file';
const commandKind = process.env.BIT_IMPORT_QUALIFICATION_COMMAND || 'objects';
assert.ok(['objects', 'checkout', 'install'].includes(commandKind));
assert.ok(['file', 'http'].includes(transport));
const cpuProfileDirectory = process.env.BIT_IMPORT_QUALIFICATION_CPU_PROFILE_DIR
  ? path.resolve(process.env.BIT_IMPORT_QUALIFICATION_CPU_PROFILE_DIR)
  : undefined;
if (cpuProfileDirectory) {
  const repository = path.resolve(__dirname, '../..');
  assert.ok(
    cpuProfileDirectory !== repository && !cpuProfileDirectory.startsWith(repository + path.sep),
    'profiles must stay outside Git'
  );
}
const selectedCases = process.env.BIT_IMPORT_QUALIFICATION_CASES?.split(',');
const modes = process.env.BIT_IMPORT_QUALIFICATION_MODES?.split(',') || [
  'legacy',
  'control',
  'validate',
  'store',
  'native',
];
assert.ok(
  modes.length &&
    modes.every((mode) =>
      [
        'legacy',
        'control',
        'validate',
        'store',
        'native',
        'tar-operation',
        'workspace-node',
        'workspace-native',
        'tar',
        'tar-staged',
        'tar-baseline',
        'tar-node-metadata',
        'tar-node-mutable',
        'mutable-control',
        'packaged-fallback',
      ].includes(mode)
    )
);
assert.ok(
  !modes.some(
    (mode) =>
      mode === 'tar-operation' ||
      mode === 'tar' ||
      mode === 'tar-staged' ||
      mode === 'tar-baseline' ||
      mode === 'tar-node-metadata' ||
      mode === 'tar-node-mutable'
  ) || transport === 'http',
  'tar qualification requires actual HTTP'
);
assert.ok(!modes.includes('tar-baseline') || baselineCli, 'tar-baseline requires a separate compiled baseline CLI');
async function command(directory, ids, requestedMode, allHistory, traceFile, cpuProfileFile) {
  const commandRoot = requestedMode === 'tar-baseline' ? baselineCli : cliRoot;
  const mode = ['tar-baseline', 'tar-operation', 'workspace-node', 'workspace-native'].includes(requestedMode)
    ? 'tar'
    : requestedMode;
  const commandHelper = requestedMode === 'tar-baseline' ? baselineHelper : helper;
  const cpuFile = path.join(directory, 'cpu.txt');
  const args = [
    path.join(commandRoot, 'bin/bit.js'),
    'import',
    ...ids,
    ...(commandKind === 'objects' ? ['--objects'] : ['--override']),
    ...(commandKind !== 'install' ? ['--skip-dependency-installation'] : []),
    '--json',
    '--safe-mode',
  ];
  if (allHistory) args.push('--all-history');
  if (cpuProfileFile) args.unshift('--require', path.join(__dirname, 'import-cpu-profile.cjs'));
  if (traceFile) args.unshift('--require', path.join(__dirname, 'import-trace.cjs'));
  const env = {
    ...process.env,
    BIT_RUST_WORKSPACE_MATERIALIZATION: requestedMode === 'workspace-native' ? 'on' : 'off',
    BIT_RUST_OBJECT_IMPORT:
      mode === 'native' ||
      mode === 'tar' ||
      mode === 'tar-staged' ||
      mode === 'tar-node-metadata' ||
      mode === 'tar-node-mutable' ||
      mode === 'validate' ||
      mode === 'store' ||
      mode === 'mutable-control'
        ? packaged
          ? 'packaged'
          : commandHelper
        : mode === 'packaged-fallback'
          ? 'packaged'
          : mode === 'control'
            ? 'control'
            : mode === 'missing'
              ? path.join(directory, 'nonexistent-helper')
              : mode === 'crash'
                ? path.join(directory, 'crashing-helper')
                : 'off',
    BIT_RUST_OBJECT_TAR:
      mode === 'tar' ||
      mode === 'tar-staged' ||
      mode === 'tar-baseline' ||
      mode === 'tar-node-metadata' ||
      mode === 'tar-node-mutable'
        ? 'on'
        : 'off',
    BIT_RUST_OBJECT_TAR_PROGRESSIVE: mode === 'tar-staged' ? 'off' : 'on',
    BIT_RUST_OBJECT_IMPORT_METADATA: mode === 'store' || mode === 'tar-node-metadata' ? 'off' : 'on',
    BIT_RUST_OBJECT_IMPORT_MODE: mode === 'validate' ? 'validate' : 'store',
    BIT_RUST_OBJECT_IMPORT_MUTABLE:
      mode === 'store' || mode === 'mutable-control' || mode === 'tar-node-mutable' ? 'off' : 'on',
    BIT_RUST_OBJECT_IMPORT_OPERATION: requestedMode === 'tar-operation' ? 'on' : 'off',
    BIT_RUST_OBJECT_IMPORT_SEQUENTIAL: requestedMode === 'tar-operation' ? 'on' : 'off',
    BIT_RUST_OBJECT_IMPORT_MISSING: requestedMode === 'tar-operation' ? 'on' : 'off',
    CI: '1',
  };
  delete env.BIT_IMPORT_CPU_PROFILE;
  delete env.BIT_IMPORT_CPU_PROFILE_OWNER;
  if (cpuProfileFile) env.BIT_IMPORT_CPU_PROFILE = cpuProfileFile;
  delete env.BIT_IMPORT_TRACE;
  delete env.BIT_IMPORT_TRACE_OWNER;
  if (traceFile) env.BIT_IMPORT_TRACE = traceFile;
  if (mode === 'crash')
    await fs.writeFile(
      path.join(directory, 'crashing-helper'),
      '#!/usr/bin/env node\nprocess.stdin.resume();process.stdin.once("data",()=>process.exit(7));\n',
      { mode: 0o755 }
    );
  const started = performance.now();
  const child = cp.spawn('/usr/bin/time', ['-f', '%U %S', '-o', cpuFile, process.execPath, ...args], {
    cwd: directory,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const control = createBenchmarkProcessControl(child, { timeoutMs: 120000 });
  const sampler = createProcessTreeMemorySampler(child.pid, { intervalMs: 10 });
  sampler.start();
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  const elapsedMs = performance.now() - started;
  const memory = sampler.stop();
  if (control.failure) throw control.failure;
  assert.equal(code, 0, stderr || stdout);
  const result = JSON.parse(stdout);
  assert.equal(result.missingIds?.length || 0, 0);
  assert.equal(result.importDetails.length, ids.length);
  const [user, system] = (await fs.readFile(cpuFile, 'utf8')).trim().split(/\s+/).map(Number);
  return {
    mode: requestedMode,
    elapsedMs,
    cpuSeconds: user + system,
    memory,
    result,
    trace: traceFile ? JSON.parse(await fs.readFile(traceFile, 'utf8')) : undefined,
  };
}
async function verifyWorkspace(directory, manifest) {
  if (commandKind === 'objects') return undefined;
  const load = require('node:module').createRequire(path.join(cliRoot, 'package.json'));
  const bitmap = load('comment-json').parse(await fs.readFile(path.join(directory, '.bitmap'), 'utf8'));
  const contents = [];
  for (const [id, expected] of Object.entries(manifest.components)) {
    // Bitmap keys may omit the scope when names are unique in the workspace.
    const entry = Object.values(bitmap).find((value) => value && `${value.scope}/${value.name}` === id);
    assert.ok(entry?.rootDir && entry.mainFile === 'index.js', `missing checkout entry ${id}`);
    for (const file of expected.files) {
      const filename = path.join(directory, entry.rootDir, file.relativePath);
      const digest = createHash('sha256')
        .update(await fs.readFile(filename))
        .digest('hex');
      assert.equal(digest, file.contentSha256, `checkout bytes ${id}/${file.relativePath}`);
      contents.push([id, file.relativePath, digest]);
    }
    if (commandKind === 'install') {
      const [prefix, ...scopeParts] = entry.scope.split('.');
      const packageName = '@' + prefix + '/' + [...scopeParts, entry.name.replaceAll('/', '.')].join('.');
      const packageDirectory = path.join(directory, 'node_modules', packageName);
      const pkg = JSON.parse(await fs.readFile(path.join(packageDirectory, 'package.json'), 'utf8'));
      assert.equal(pkg.name, packageName);
      assert.equal(pkg.version, entry.version);
      for (const file of expected.files)
        assert.equal(
          await fs.realpath(path.join(packageDirectory, file.relativePath)),
          await fs.realpath(path.join(directory, entry.rootDir, file.relativePath)),
          `installed source link ${id}/${file.relativePath}`
        );
    }
  }
  return {
    files: contents.length,
    sha256: createHash('sha256').update(JSON.stringify(contents)).digest('hex'),
    dependencies: 'fixture has no external dependencies',
  };
}
async function workspace(directory, manifest) {
  await fs.mkdir(directory);
  cp.execFileSync(
    process.execPath,
    [
      path.join(cliRoot, 'bin/bit.js'),
      'init',
      ...(commandKind === 'objects' ? ['--standalone'] : []),
      '--skip-interactive',
      '--default-scope',
      'qualification.destination',
    ],
    { cwd: directory, env: { ...process.env, CI: '1' }, stdio: 'ignore' }
  );
  const file = path.join(directory, '.bit/scope.json');
  const json = JSON.parse(await fs.readFile(file, 'utf8'));
  json.remotes = manifest.remotes;
  await fs.writeFile(file, JSON.stringify(json, null, 2));
  await seedDestination(cliRoot, path.join(directory, '.bit'), manifest);
  if (commandKind !== 'objects')
    await fs.writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: 'qualification-workspace', private: true, type: 'module' })
    );
}
(async () => {
  assert.equal(process.platform, 'linux', 'GNU time and process-tree measurements require Linux');
  assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 100);
  const provenance = JSON.parse(await fs.readFile(path.join(cliRoot, '.bit-object-import-build.json'), 'utf8'));
  const baselineProvenance = baselineCli
    ? JSON.parse(await fs.readFile(path.join(baselineCli, '.bit-object-import-build.json'), 'utf8'))
    : undefined;
  async function verifyCompiledSnapshots() {
    for (const [root, snapshot] of [
      [cliRoot, provenance],
      ...(baselineCli ? [[baselineCli, baselineProvenance]] : []),
    ]) {
      for (const file of snapshot.compiledModules)
        assert.equal(
          createHash('sha256')
            .update(await fs.readFile(path.join(root, 'node_modules/@teambit', file.path)))
            .digest('hex'),
          file.sha256,
          'compiled code changed during qualification'
        );
    }
  }
  await verifyCompiledSnapshots();
  const scratch = path.resolve(process.env.BIT_IMPORT_QUALIFICATION_TMPDIR || os.tmpdir());
  const repository = path.resolve(__dirname, '../..');
  assert.ok(
    scratch !== repository && !scratch.startsWith(repository + path.sep),
    'fixtures must stay outside the repository'
  );
  await fs.mkdir(scratch, { recursive: true });
  const temporary = await fs.mkdtemp(path.join(scratch, 'bit-real-import-'));
  process.env.BIT_GLOBALS_DIR = benchmarkGlobals(temporary);
  process.env.BIT_RUST_OBJECT_IMPORT = 'off';
  process.env.BIT_RUST_OBJECT_TAR = 'off';
  const report = {
    schemaVersion: 1,
    temporary,
    filesystemType: (await fs.statfs(temporary)).type,
    node: process.version,
    cliProvenance: provenance,
    baselineCliProvenance: baselineProvenance,
    helperSha256: createHash('sha256')
      .update(await fs.readFile(helper))
      .digest('hex'),
    baselineHelperSha256: createHash('sha256')
      .update(await fs.readFile(baselineHelper))
      .digest('hex'),
    rounds,
    smoke,
    transport,
    controlledHttpDelayMs: Number(process.env.BIT_IMPORT_QUALIFICATION_HTTP_DELAY_MS || 0),
    packaged,
    cpuProfileDirectory,
    serverCpuAndMemoryIncluded: false,
    harnessSha256: Object.fromEntries(
      [
        'import-qualification.cjs',
        'import-trace.cjs',
        'import-cpu-profile.cjs',
        'http-fixture.cjs',
        'scope-fixture.cjs',
      ].map((name) => [
        name,
        createHash('sha256')
          .update(require('node:fs').readFileSync(path.join(__dirname, name)))
          .digest('hex'),
      ])
    ),
    commandKind,
    command: `bit import <ids> ${commandKind === 'objects' ? '--objects' : '--override'} ${commandKind === 'install' ? '' : '--skip-dependency-installation'} --json --safe-mode [--all-history for cold]`,
    cases: {},
  };
  const cases = smoke
    ? [['smoke', { components: 2, files: 2, bytes: 1024, versions: 3, remotes: 2 }]]
    : [
        ['many-small', { components: 100, files: 25, bytes: 1024, versions: 2 }],
        ['large-compressible', { components: 16, files: 2, bytes: 8 * 1024 * 1024, versions: 2 }],
        ['large-binary', { components: 16, files: 2, bytes: 4 * 1024 * 1024, versions: 2, binary: true }],
        ['mutable-heavy', { components: 400, files: 1, bytes: 1024, versions: 8 }],
        ['multi-remote', { components: 8, files: 2, bytes: 8 * 1024 * 1024, versions: 2, remotes: 2 }],
        ['concurrent-mutable', { components: 100, files: 1, bytes: 1024, versions: 8, remotes: 4 }],
      ];
  if (selectedCases) {
    if (selectedCases.includes('command-workspace'))
      cases.push(['command-workspace', { components: 8, files: 2, bytes: 16 * 1024, versions: 4, remotes: 2 }]);
    for (const versions of [32, 512]) {
      const name = `history-overlap-${versions}`;
      if (selectedCases.includes(name))
        cases.push([
          name,
          { components: 4, files: 1, bytes: 1024, versions, localVersions: versions, remotes: 1, overlap: 'local' },
        ]);
    }
    for (const overlap of ['origin', 'local']) {
      const name = `overlap-${overlap}`;
      if (selectedCases.includes(name))
        cases.push([name, { components: 64, files: 1, bytes: 1024, versions: 8, remotes: 2, overlap }]);
    }
  }
  for (const [name, options] of cases) {
    if (selectedCases && !selectedCases.includes(name)) continue;
    const directory = path.join(temporary, name);
    await fs.mkdir(directory);
    const manifest = await createFixture(cliRoot, path.join(directory, 'remotes'), {
      ...options,
      harmony: commandKind !== 'objects',
    });
    let server;
    if (transport === 'http') {
      server = cp.fork(path.join(__dirname, 'http-fixture.cjs'), [cliRoot, JSON.stringify(manifest.remotes)], {
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      });
      const ready = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          server.kill();
          reject(new Error('HTTP fixture startup timed out'));
        }, 10000);
        server.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        server.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`HTTP fixture exited ${code}`));
        });
        server.once('message', (message) => {
          clearTimeout(timer);
          resolve(message);
        });
      });
      manifest.remotes = ready.remotes;
    }
    try {
      const data = (report.cases[name] = {
        options,
        sourceBytes: manifest.sourceBytes,
        expectedObjects: Object.keys({ ...manifest.hashes, ...manifest.localHashes }).length,
        historySerializedBytes: options.localVersions
          ? Object.values(manifest.components).map((component) => component.history.serializedBytes)
          : undefined,
        runs: [],
        diagnostics: [],
        profiles: [],
      });
      let expectedModels;
      function checkModels(verification) {
        expectedModels ||= verification.modelsSha256;
        assert.equal(
          verification.modelsSha256,
          expectedModels,
          'model data must match across modes and repeated commands'
        );
      }
      for (let round = -1; round < rounds; round++) {
        for (let offset = 0; offset < modes.length; offset++) {
          const mode = modes[(offset + Math.max(round, 0)) % modes.length];
          const destination = path.join(directory, `${round}-${mode}`);
          await workspace(destination, manifest);
          const cold = await command(destination, manifest.ids, mode, true);
          cold.verification = await verify(cliRoot, path.join(destination, '.bit'), manifest);
          cold.workspaceVerification = await verifyWorkspace(destination, manifest);
          checkModels(cold.verification);
          const warm = await command(destination, manifest.ids, mode, false);
          warm.verification = await verify(cliRoot, path.join(destination, '.bit'), manifest);
          warm.workspaceVerification = await verifyWorkspace(destination, manifest);
          checkModels(warm.verification);
          await new Promise((resolve) => setImmediate(resolve));
          global.gc?.();
          if (round >= 0) data.runs.push({ round, cold, warm });
          console.log(JSON.stringify({ name, round, mode, coldMs: cold.elapsedMs, warmMs: warm.elapsedMs }));
          await fs.rm(destination, { recursive: true, force: true });
        }
      }
      if (cpuProfileDirectory) {
        for (const mode of modes) {
          const destination = path.join(directory, `profile-${mode}`);
          await workspace(destination, manifest);
          const coldFile = path.join(cpuProfileDirectory, `${name}-${mode}-cold.cpuprofile`);
          const warmFile = path.join(cpuProfileDirectory, `${name}-${mode}-warm.cpuprofile`);
          const cold = await command(destination, manifest.ids, mode, true, undefined, coldFile);
          cold.verification = await verify(cliRoot, path.join(destination, '.bit'), manifest);
          cold.workspaceVerification = await verifyWorkspace(destination, manifest);
          checkModels(cold.verification);
          const warm = await command(destination, manifest.ids, mode, false, undefined, warmFile);
          warm.verification = await verify(cliRoot, path.join(destination, '.bit'), manifest);
          warm.workspaceVerification = await verifyWorkspace(destination, manifest);
          checkModels(warm.verification);
          for (const filename of [coldFile, warmFile]) {
            const profile = JSON.parse(await fs.readFile(filename, 'utf8'));
            assert.ok(profile.nodes?.length && profile.samples?.length, 'owning command must produce a CPU profile');
          }
          data.profiles.push({ coldFile, warmFile, cold, warm });
          await fs.rm(destination, { recursive: true, force: true });
          global.gc?.();
        }
      }
      for (const mode of [...modes, ...(smoke ? ['missing', 'crash'] : [])]) {
        const destination = path.join(directory, `diagnostic-${mode}`);
        await workspace(destination, manifest);
        const cold = await command(destination, manifest.ids, mode, true, path.join(destination, 'cold-trace.json'));
        cold.verification = await verify(cliRoot, path.join(destination, '.bit'), manifest);
        cold.workspaceVerification = await verifyWorkspace(destination, manifest);
        checkModels(cold.verification);
        const warm = await command(destination, manifest.ids, mode, false, path.join(destination, 'warm-trace.json'));
        warm.verification = await verify(cliRoot, path.join(destination, '.bit'), manifest);
        warm.workspaceVerification = await verifyWorkspace(destination, manifest);
        checkModels(warm.verification);
        await new Promise((resolve) => setImmediate(resolve));
        global.gc?.();
        if (mode === 'tar-operation') {
          assert.ok(cold.trace.operation.spoolBytes > 0, 'native archive transfer must actually run');
          assert.equal(cold.trace.operation.spoolFallbacks, 0);
          assert.ok(
            cold.trace.operation.kinds.persist > 0 && cold.trace.operation.kinds.index > 0,
            'native model persistence and index planning must run'
          );
          const { persist: backpressure = 0, ...fallbacks } = cold.trace.operation.fallbackKinds;
          assert.deepEqual(fallbacks, {}, 'ordinary fixture must not hide native operation failure');
          const modelRequests = cold.trace.operation.kinds.persist + backpressure;
          const components = options.components * (options.remotes || 1);
          assert.ok(
            modelRequests >= 1 && modelRequests <= components + (options.remotes || 1),
            'bounded native model requests include eligible component and per-scope metadata'
          );
          assert.ok(
            backpressure <= Math.max(0, modelRequests - 64),
            'only model requests exceeding the bounded outstanding queue may fall back'
          );
          if (options.overlap)
            assert.ok(
              cold.trace.operation.kinds.component > 0 && cold.trace.operation.kinds.versionHistory > 0,
              'overlapping imports require native merge coverage'
            );
        }
        if (mode === 'workspace-native') {
          assert.ok(commandKind !== 'objects', 'workspace qualification must materialize files');
          assert.ok(cold.trace.materialization.files > 0, 'actual workspace files must reach Rust');
          assert.equal(cold.trace.materialization.completed, cold.trace.materialization.files);
          assert.equal(cold.trace.materialization.failed, 0, 'ordinary fixture must not hide write fallback');
          assert.ok(cold.trace.materialization.completed >= cold.workspaceVerification.files);
        }
        if (mode === 'workspace-node') assert.equal(cold.trace.materialization.files, 0);
        const incomingVersions = Object.values(manifest.hashes).filter((object) => object.type === 'Version').length;
        if (incomingVersions) {
          assert.ok(cold.trace.stages.versionParseOther?.calls >= incomingVersions, 'Version parsing must be traced');
          assert.ok(
            cold.trace.stages.versionSerialization?.calls >= incomingVersions,
            'Version serialization must be traced'
          );
          assert.ok(
            cold.trace.stages.versionParseForPersistence?.calls >= incomingVersions,
            'serialized Version validation must remain active'
          );
        }
        const mutableFrames = Object.entries(cold.trace.mutableFrames.counts);
        assert.equal(
          mutableFrames.reduce((sum, [count, frames]) => sum + Number(count) * frames, 0),
          cold.trace.native.mutableSubmitted
        );
        assert.equal(
          mutableFrames.reduce((sum, [, frames]) => sum + frames, 0),
          cold.trace.native.mutableBatches
        );
        if (
          mode === 'tar-operation' ||
          mode === 'tar' ||
          mode === 'tar-staged' ||
          mode === 'tar-baseline' ||
          mode === 'tar-node-metadata' ||
          mode === 'tar-node-mutable'
        ) {
          const sources = Object.values(manifest.hashes).filter((object) => object.type === 'Source').length;
          assert.equal(cold.trace.tar.nativeSources, sources, 'actual HTTP Source coverage must be native');
          assert.equal(cold.trace.tar.fallbacks, 0, 'successful fixture must not silently fall back');
          assert.ok(cold.trace.tar.operations, 'production stream operation must actually run');
          assert.ok(cold.trace.tar.batches, 'production tar protocol must actually run');
          assert.equal(cold.trace.incomingObjectTypes.Source || 0, 0, 'Source bodies must not be hydrated in Node');
          if (
            mode === 'tar-operation' ||
            mode === 'tar' ||
            mode === 'tar-staged' ||
            mode === 'tar-baseline' ||
            mode === 'tar-node-mutable'
          ) {
            assert.equal(cold.trace.inflation.incoming, 0, 'eligible incoming metadata must not inflate in Node');
            assert.ok(
              cold.trace.stages.nativeMetadataHydration?.calls >= Object.keys(manifest.hashes).length - sources,
              'eligible metadata must use canonical hydration of Rust-inflated bytes'
            );
          }
          assert.equal(cold.trace.stages.nativeAtomicPersistence?.calls || 0, 0, 'no per-Source Node atomic writes');
          assert.equal(warm.trace.tar.nativeSources, 0);
          assert.ok(cold.trace.stages.componentMergeAndIndex?.calls, 'genuine component merge/index required');
          if (mode === 'tar-node-mutable') {
            assert.equal(cold.trace.native.mutableSubmitted, 0);
            assert.equal(warm.trace.native.mutableSubmitted, 0);
          }
        }
        if (mode === 'native' || mode === 'validate' || mode === 'store' || mode === 'mutable-control') {
          const expectedSources = Object.values(manifest.hashes).filter((obj) => obj.type === 'Source').length;
          assert.equal(cold.trace.native.sources, expectedSources, 'native cold Source coverage must be real');
          if (mode !== 'validate') {
            assert.equal(cold.trace.native.persisted, expectedSources, 'Sources must be committed by Rust');
            assert.equal(cold.trace.stages.nativeAtomicPersistence?.calls || 0, 0, 'no per-Source Node atomic writes');
            assert.equal(cold.trace.native.writeFallbacks, 0);
            if (mode === 'native') assert.ok(cold.trace.native.metadata, 'metadata must be inflated natively');
            if (mode === 'native') {
              const mutableObjects = Object.values(manifest.hashes).filter((obj) =>
                ['Version', 'VersionHistory', 'LaneHistory'].includes(obj.type)
              ).length;
              assert.equal(
                cold.trace.native.mutablePersisted,
                mutableObjects,
                'mutable native writes must actually execute'
              );
              assert.equal(cold.trace.native.mutableFallbacks, 0);
            }
            if (mode === 'mutable-control') assert.equal(cold.trace.native.mutablePersisted, 0);
          }
          assert.equal(warm.trace.native.sources, 0, 'ordinary repeated import should not reprocess Sources');
          assert.ok(cold.trace.stages.componentMergeAndIndex?.calls, 'actual mutable component merge required');
        }
        if (mode === 'missing' || mode === 'crash' || mode === 'packaged-fallback')
          assert.equal(cold.trace.native.sources, 0);
        if (options.overlap) {
          assert.ok(
            cold.trace.stages.modelComponentMergePolicy?.calls >= options.components * options.remotes,
            'seeded model merge policy must actually run'
          );
          assert.ok(
            (cold.trace.stages.versionHistoryMergePolicy?.calls || 0) +
              (cold.trace.stages.versionHistoryNativeApply?.calls || 0) >=
              options.components * (options.remotes || 1),
            'seeded history merge policy must actually run'
          );
          if (options.localVersions && mode === 'tar') {
            const eligibleHistories = data.historySerializedBytes.filter((bytes) => bytes <= 16 * 1024).length;
            assert.equal(eligibleHistories, options.versions === 32 ? options.components : 0);
            const mutableCount = options.components * options.versions + eligibleHistories;
            assert.equal(cold.trace.native.mutableSubmitted, mutableCount);
            assert.equal(cold.trace.native.mutablePersisted, mutableCount);
            assert.equal(cold.trace.native.mutableFallbacks, 0);
            assert.equal(warm.trace.native.mutableSubmitted, 0);
          }
        }
        data.diagnostics.push({ mode, cold, warm });
        await fs.rm(destination, { recursive: true, force: true });
      }
      await fs.writeFile(path.join(temporary, 'results.json'), JSON.stringify(report, null, 2));
      if (process.env.BIT_IMPORT_QUALIFICATION_REPORT) {
        const saved = path.resolve(process.env.BIT_IMPORT_QUALIFICATION_REPORT);
        const repository = path.resolve(__dirname, '../..');
        assert.ok(
          saved !== repository && !saved.startsWith(repository + path.sep),
          'raw evidence must stay outside the repository'
        );
        await fs.mkdir(path.dirname(saved), { recursive: true });
        await fs.writeFile(saved, JSON.stringify(report, null, 2));
      }
      console.log(JSON.stringify({ name, retainedRuns: data.runs.length, verifiedObjects: data.expectedObjects }));
    } finally {
      if (server) {
        server.disconnect();
        server.kill();
      }
    }
  }
  await verifyCompiledSnapshots();
  assert.equal(
    createHash('sha256')
      .update(await fs.readFile(helper))
      .digest('hex'),
    report.helperSha256,
    'helper changed during qualification'
  );
  assert.equal(
    createHash('sha256')
      .update(await fs.readFile(baselineHelper))
      .digest('hex'),
    report.baselineHelperSha256,
    'baseline helper changed during qualification'
  );
  console.log(`Evidence: ${path.join(temporary, 'results.json')}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
