const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const childProcess = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const installedRoot = process.env.BIT_LEGACY_ROOT || path.resolve(__dirname, '../..');
const installed = Module.createRequire(path.join(installedRoot, 'package.json'));
const ts = installed('typescript');
const root = process.env.BIT_SCANNER_INTEGRATION_ROOT || path.resolve(__dirname, '../..');
require.extensions['.ts'] = (target, filename) => {
  target.paths = [...Module._nodeModulePaths(installedRoot), ...target.paths];
  target._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        experimentalDecorators: true,
      },
      fileName: filename,
    }).outputText,
    filename
  );
};
const builder = path.join(root, 'scopes/dependencies/dependencies/files-dependency-builder');
const { RustDependencyScannerSession } = require(path.join(builder, 'rust-scanner/session.ts'));
const { withRustDependencyScannerScope, acquireRustDependencyScannerSession } = require(
  path.join(builder, 'rust-scanner/scope.ts')
);
const generateTree = require(path.join(builder, 'generate-tree-madge.ts')).default;
const { DetectorHook } = installed('@teambit/dependency-resolver');
const native = process.env.BIT_TEST_NATIVE_SCANNER;
if (process.env.CI && !native) {
  throw new Error('command-scope validation in CI requires BIT_TEST_NATIVE_SCANNER; native parity must not be skipped');
}

function workspace(context, files = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-rust-command-scope-'));
  for (const [name, source] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), source);
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, file: (name) => path.join(directory, name) };
}

async function enabled(executable, operation) {
  const old = process.env.BIT_RUST_DEPENDENCY_SCANNER;
  if (executable === undefined) delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
  else process.env.BIT_RUST_DEPENDENCY_SCANNER = executable;
  try {
    return await operation();
  } finally {
    if (old === undefined) delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
    else process.env.BIT_RUST_DEPENDENCY_SCANNER = old;
  }
}

function observe(context) {
  const children = [];
  const disposed = [];
  const spawn = childProcess.spawn;
  childProcess.spawn = (...args) => {
    const child = spawn(...args);
    const requests = [];
    const write = child.stdin.write;
    child.stdin.write = function (data, ...rest) {
      requests.push(JSON.parse(data.toString().trim()));
      return write.call(this, data, ...rest);
    };
    children.push({ executable: args[0], child, requests });
    return child;
  };
  const dispose = RustDependencyScannerSession.prototype.dispose;
  RustDependencyScannerSession.prototype.dispose = function () {
    disposed.push(this);
    return dispose.call(this);
  };
  context.after(() => {
    childProcess.spawn = spawn;
    RustDependencyScannerSession.prototype.dispose = dispose;
    for (const { child } of children) {
      try {
        child.kill('SIGKILL');
      } catch {}
    }
  });
  return { children, disposed };
}

function noHooks(context) {
  const old = DetectorHook.hooks;
  DetectorHook.hooks = [];
  context.after(() => {
    DetectorHook.hooks = old;
  });
}

function treeConfig(directory) {
  return { baseDir: directory, envDetectors: [], detectiveOptions: {} };
}

async function exited(child) {
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await delay(10);
  }
  assert.fail('operation helper did not exit after owner cleanup');
}
module.exports = {
  test,
  assert,
  fs,
  os,
  path,
  delay,
  installed,
  root,
  RustDependencyScannerSession,
  withRustDependencyScannerScope,
  acquireRustDependencyScannerSession,
  generateTree,
  DetectorHook,
  native,
  workspace,
  enabled,
  observe,
  noHooks,
  treeConfig,
  exited,
};
