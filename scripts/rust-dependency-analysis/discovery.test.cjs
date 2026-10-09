const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const cp = require('node:child_process');
const installedRoot = process.env.BIT_LEGACY_ROOT || path.resolve(__dirname, '../..');
const ts = Module.createRequire(path.join(installedRoot, 'package.json'))('typescript');
const archive = process.env.BIT_TEST_PACKAGED_ARCHIVE;
if (process.env.CI && !archive) throw new Error('packaged install validation requires BIT_TEST_PACKAGED_ARCHIVE');
const sourceRoot = path.resolve(
  __dirname,
  '../../scopes/dependencies/dependencies/files-dependency-builder/rust-scanner'
);
function runtime(context) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit packaged тест '));
  const sessions = [];
  context.after(async () => {
    for (const session of sessions) session.dispose();
    await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  for (const name of ['discovery', 'types', 'protocol', 'session']) {
    fs.writeFileSync(
      path.join(directory, name + '.js'),
      ts.transpileModule(fs.readFileSync(path.join(sourceRoot, name + '.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      }).outputText
    );
  }
  const loader = new Module(path.join(directory, 'discovery.js'), module);
  loader.filename = path.join(directory, 'discovery.js');
  loader.paths = Module._nodeModulePaths(installedRoot);
  loader._compile(fs.readFileSync(loader.filename, 'utf8'), loader.filename);
  const original = process.env.BIT_RUST_DEPENDENCY_SCANNER;
  context.after(() => {
    if (original === undefined) delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
    else process.env.BIT_RUST_DEPENDENCY_SCANNER = original;
  });
  return {
    directory,
    ownSession(session) {
      sessions.push(session);
      return session;
    },
    ...loader.exports,
  };
}
function install(directory) {
  cp.execFileSync(
    process.env.PYTHON || 'python3',
    [
      path.join(__dirname, 'artifacts/install-helper.py'),
      'install',
      '--module-directory',
      directory,
      '--archive',
      archive,
    ],
    { stdio: 'pipe' }
  );
}
test('default, off and absolute override preserve explicit activation contract', (context) => {
  const r = runtime(context);
  delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
  assert.equal(r.resolveRustDependencyScannerExecutable(), undefined);
  process.env.BIT_RUST_DEPENDENCY_SCANNER = 'off';
  assert.equal(r.resolveRustDependencyScannerExecutable(), undefined);
  process.env.BIT_RUST_DEPENDENCY_SCANNER = process.execPath;
  assert.equal(r.resolveRustDependencyScannerExecutable(), process.execPath);
  process.env.BIT_RUST_DEPENDENCY_SCANNER = 'relative-file';
  assert.equal(r.resolveRustDependencyScannerExecutable(), undefined);
});
test('packaged opt-in never searches workspace or PATH when adjacent artifact is absent', (context) => {
  const r = runtime(context);
  process.env.BIT_RUST_DEPENDENCY_SCANNER = 'packaged';
  assert.equal(r.resolveRustDependencyScannerExecutable(), undefined);
});
test(
  'actual archive installs and discovered installed helper parses source and errors',
  { skip: !archive },
  async (context) => {
    const r = runtime(context);
    install(r.directory);
    process.env.BIT_RUST_DEPENDENCY_SCANNER = 'packaged';
    const executable = r.resolveRustDependencyScannerExecutable();
    assert.ok(executable);
    assert.ok(
      path
        .toNamespacedPath(fs.realpathSync.native(executable))
        .startsWith(path.toNamespacedPath(fs.realpathSync.native(r.directory)) + path.sep)
    );
    const { RustDependencyScannerSession } = require(path.join(r.directory, 'session.js'));
    const session = r.ownSession(new RustDependencyScannerSession({ executable, cwd: r.directory }));
    const result = await session.scanSource('fixture.ts', "import type {Thing} from './dependency';");
    assert.ok(result, session.unavailableReason);
    assert.equal(result.status, 'ok');
    assert.equal(result.dependencies['./dependency'].isTypeImport, true);
    assert.equal((await session.scanSource('bad.ts', 'const value: = 1;')).status, 'parse_error');
  }
);
for (const field of ['version', 'target', 'protocolVersion', 'artifactFormat'])
  test(`installed wrong ${field} falls back without executing`, { skip: !archive }, (context) => {
    const r = runtime(context);
    install(r.directory);
    process.env.BIT_RUST_DEPENDENCY_SCANNER = 'packaged';
    const executable = r.resolveRustDependencyScannerExecutable();
    assert.ok(executable);
    const filename = path.join(path.dirname(executable), 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(filename));
    manifest[field] = 'wrong';
    fs.writeFileSync(filename, JSON.stringify(manifest));
    assert.equal(r.resolveRustDependencyScannerExecutable(), undefined);
  });
for (const name of ['binary', 'LICENSE', 'THIRD-PARTY-NOTICES.txt'])
  test(`corrupt installed ${name} falls back`, { skip: !archive }, (context) => {
    const r = runtime(context);
    install(r.directory);
    process.env.BIT_RUST_DEPENDENCY_SCANNER = 'packaged';
    const executable = r.resolveRustDependencyScannerExecutable();
    assert.ok(executable);
    fs.appendFileSync(name === 'binary' ? executable : path.join(path.dirname(executable), name), 'corrupt');
    assert.equal(r.resolveRustDependencyScannerExecutable(), undefined);
  });
test('runtime rejects redirected package subtree', { skip: !archive || process.platform === 'win32' }, (context) => {
  const r = runtime(context);
  install(r.directory);
  process.env.BIT_RUST_DEPENDENCY_SCANNER = 'packaged';
  const executable = r.resolveRustDependencyScannerExecutable();
  const directory = path.dirname(executable);
  const moved = directory + '-moved';
  fs.renameSync(directory, moved);
  fs.symlinkSync(moved, directory, 'dir');
  assert.equal(r.resolveRustDependencyScannerExecutable(), undefined);
});

test(
  'GNU artifact requiring newer libc explicitly falls back',
  { skip: !archive || process.platform !== 'linux' },
  (context) => {
    const r = runtime(context);
    install(r.directory);
    process.env.BIT_RUST_DEPENDENCY_SCANNER = 'packaged';
    assert.ok(r.resolveRustDependencyScannerExecutable());
    const original = process.report.getReport;
    const report = original.call(process.report);
    if (!report.header.glibcVersionRuntime) return;
    context.after(() => {
      process.report.getReport = original;
    });
    process.report.getReport = () => ({ ...report, header: { ...report.header, glibcVersionRuntime: '2.0' } });
    assert.equal(r.resolveRustDependencyScannerExecutable(), undefined);
  }
);

test(
  'real distribution assembler survives relocation and runs the installed archive',
  { skip: !archive },
  async (context) => {
    const r = runtime(context);
    const distribution = path.join(r.directory, 'Bit distribution');
    const moduleRelative = path.join(
      'node_modules',
      '@teambit',
      'dependencies',
      'dist',
      'files-dependency-builder',
      'rust-scanner'
    );
    const moduleDirectory = path.join(distribution, moduleRelative);
    fs.mkdirSync(moduleDirectory, { recursive: true });
    for (const name of ['discovery', 'types', 'protocol', 'session'])
      fs.copyFileSync(path.join(r.directory, name + '.js'), path.join(moduleDirectory, name + '.js'));
    cp.execFileSync(
      process.env.PYTHON || 'python3',
      [
        path.join(__dirname, 'artifacts/install-helper.py'),
        'assemble',
        '--distribution',
        distribution,
        '--archive',
        archive,
        '--target',
        r.packagedScannerTarget(),
      ],
      { stdio: 'pipe' }
    );
    const relocated = path.join(r.directory, 'relocated λ distribution');
    fs.renameSync(distribution, relocated);
    const filename = path.join(relocated, moduleRelative, 'discovery.js');
    const loader = new Module(filename, module);
    loader.filename = filename;
    loader.paths = Module._nodeModulePaths(installedRoot);
    loader._compile(fs.readFileSync(filename, 'utf8'), filename);
    process.env.BIT_RUST_DEPENDENCY_SCANNER = 'packaged';
    const executable = loader.exports.resolveRustDependencyScannerExecutable();
    assert.ok(executable);
    assert.ok(
      path
        .toNamespacedPath(fs.realpathSync.native(executable))
        .startsWith(path.toNamespacedPath(fs.realpathSync.native(relocated)) + path.sep)
    );
    const { RustDependencyScannerSession } = require(path.join(relocated, moduleRelative, 'session.js'));
    const session = r.ownSession(new RustDependencyScannerSession({ executable, cwd: r.directory }));
    const result = await session.scanSource('file.ts', "import value from './real-package';");
    assert.ok(result, session.unavailableReason);
    assert.equal(result.status, 'ok');
    assert.ok(result.dependencies['./real-package']);
  }
);

test('runtime module mutation invalidates its trusted packaged build binding', { skip: !archive }, (context) => {
  const r = runtime(context);
  install(r.directory);
  process.env.BIT_RUST_DEPENDENCY_SCANNER = 'packaged';
  assert.ok(r.resolveRustDependencyScannerExecutable());
  fs.appendFileSync(path.join(r.directory, 'protocol.js'), '\n// modified runtime\n');
  assert.equal(r.resolveRustDependencyScannerExecutable(), undefined);
});
test(
  'missing trusted runtime build descriptor falls back despite valid same-version artifact',
  { skip: !archive },
  (context) => {
    const r = runtime(context);
    install(r.directory);
    process.env.BIT_RUST_DEPENDENCY_SCANNER = 'packaged';
    assert.ok(r.resolveRustDependencyScannerExecutable());
    fs.unlinkSync(path.join(r.directory, 'packaged-build.json'));
    assert.equal(r.resolveRustDependencyScannerExecutable(), undefined);
  }
);

test(
  'repeated component discovery reuses bounded binary and runtime hash validation',
  { skip: !archive },
  (context) => {
    const r = runtime(context);
    install(r.directory);
    process.env.BIT_RUST_DEPENDENCY_SCANNER = 'packaged';
    const original = fs.readFileSync;
    const hashedReads = [];
    fs.readFileSync = function (filename, ...args) {
      if (
        typeof filename === 'string' &&
        (filename.endsWith('.js') || path.basename(filename).startsWith('bit-dependency-scanner'))
      )
        hashedReads.push(filename);
      return original.call(this, filename, ...args);
    };
    try {
      const executable = r.resolveRustDependencyScannerExecutable();
      assert.ok(executable);
      assert.ok(
        hashedReads.some(
          (filename) =>
            path.toNamespacedPath(fs.realpathSync.native(filename)) ===
            path.toNamespacedPath(fs.realpathSync.native(executable))
        )
      );
      assert.ok(hashedReads.includes(path.join(r.directory, 'session.js')));
      hashedReads.length = 0;
      for (let index = 0; index < 334; index++) assert.equal(r.resolveRustDependencyScannerExecutable(), executable);
      assert.deepEqual(hashedReads, []);
    } finally {
      fs.readFileSync = original;
    }
  }
);
