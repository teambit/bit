const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { source, installed } = require('../rust-object-import/load-source.cjs');
const prefix = 'scopes/dependencies/dependencies/files-dependency-builder/rust-scanner/';
const { RustDependencyScannerSession } = process.env.BIT_TEST_SCANNER_COMPILED
  ? installed('@teambit/dependencies/dist/files-dependency-builder/rust-scanner/session.js')
  : source(prefix + 'session.ts');
const { resolveRustDependencyScannerRuntime } = source(prefix + 'runtime.ts');
const addon = process.env.BIT_TEST_WORKSPACE_ADDON;
assert.ok(addon && addon !== 'off', 'embedded scanner tests require the actual native addon');

function fixture(t, options = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-embedded-scanner-'));
  const session = new RustDependencyScannerSession({
    executable: path.join(cwd, 'must-not-spawn'),
    workspaceAddon: addon,
    cwd,
    ...options,
  });
  t.after(() => {
    session.dispose();
    fs.rmSync(cwd, { recursive: true, force: true });
  });
  return { session, cwd };
}

test('embedded batches preserve ordering, metadata and fresh graph snapshots without a helper process', async (t) => {
  const { session, cwd } = fixture(t, { maxBatchFiles: 2, threads: 2 });
  const names = ['a.ts', 'b.ts', 'c.ts'];
  for (const name of names) fs.writeFileSync(path.join(cwd, name), "import type { Value } from 'types';");
  await Promise.all([session.prefetch(names), session.prefetch(names)]);
  for (const name of names) {
    const value = session.get(name);
    assert.equal(value.status, 'ok');
    assert.equal(value.dependencies.types.isTypeImport, true);
    value.dependencies.types.isTypeImport = false;
    assert.equal(session.get(name).dependencies.types.isTypeImport, true);
  }
  assert.equal(session.child, undefined);
  assert.equal(session.clearCache(), true);
  fs.writeFileSync(path.join(cwd, 'a.ts'), "import 'changed';");
  await session.prefetch(['a.ts']);
  assert.deepEqual(Object.keys(session.get('a.ts').dependencies), ['changed']);
  assert.equal(session.unavailableReason, undefined);
});

test('embedded extraction retains unsupported, parse error and read error outcomes', async (t) => {
  const { session } = fixture(t);
  assert.equal((await session.scanSource('a.css', '@import "a";')).status, 'unsupported');
  assert.equal((await session.scanSource('a.ts', 'import {')).status, 'parse_error');
  await session.prefetch(['missing.ts']);
  assert.equal(session.get('missing.ts').status, 'read_error');
  assert.deepEqual(Object.keys((await session.scanSource('a.js', "require('one'); import('two');")).dependencies), [
    'one',
    'two',
  ]);
});

test('abort retires an active embedded request and never exposes late results', async (t) => {
  const controller = new AbortController();
  const { session } = fixture(t, { signal: controller.signal });
  const pending = session.scanSource('a.ts', "import 'one';\n".repeat(20000));
  await Promise.resolve();
  controller.abort();
  assert.equal(await pending, undefined);
  assert.match(session.unavailableReason, /cancelled/);
  assert.equal(await session.scanSource('b.ts', "import 'two';"), undefined);
});

test('missing addon and oversized response decline cleanly', async (t) => {
  const missing = fixture(t, { workspaceAddon: path.join(os.tmpdir(), 'missing-bit-addon.node') });
  assert.equal(await missing.session.scanSource('a.ts', "import 'one';"), undefined);
  assert.match(missing.session.unavailableReason, /transport failed/);
  const bounded = fixture(t, { maxResponseBytes: 8 });
  assert.equal(await bounded.session.scanSource('a.ts', "import 'one';"), undefined);
  assert.match(bounded.session.unavailableReason, /oversized/);
});

test('explicit scanner settings take precedence over the VCS backend', (t) => {
  const previous = { ...process.env };
  t.after(() => {
    process.env = previous;
  });
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_DEPENDENCY_SCANNER = 'off';
  assert.equal(resolveRustDependencyScannerRuntime(), undefined);
  const executable = path.join(os.tmpdir(), 'explicit-scanner');
  process.env.BIT_RUST_DEPENDENCY_SCANNER = executable;
  assert.deepEqual(resolveRustDependencyScannerRuntime(), { executable });
  delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  assert.equal(resolveRustDependencyScannerRuntime(), undefined);
});

test('VCS selection uses the actual addon for resolved graphs and preserves custom detector precedence', async (t) => {
  const previous = { ...process.env };
  t.after(() => {
    process.env = previous;
  });
  const { cwd } = fixture(t);
  const helper = path.join(cwd, process.platform === 'win32' ? 'bit-object-import.exe' : 'bit-object-import');
  fs.writeFileSync(helper, 'not executable: dependency parsing must use the addon');
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
  assert.deepEqual(resolveRustDependencyScannerRuntime(), {
    executable: path.toNamespacedPath(helper),
    workspaceAddon: addon,
  });
  fs.writeFileSync(path.join(cwd, 'a.ts'), "import { value } from './b'; export { value };");
  fs.writeFileSync(path.join(cwd, 'b.ts'), 'export const value = 1;');
  const generateTree = source(
    'scopes/dependencies/dependencies/files-dependency-builder/generate-tree-madge.ts'
  ).default;
  const { DetectorHook } = installed('@teambit/dependency-resolver');
  const hooks = DetectorHook.hooks;
  DetectorHook.hooks = [];
  t.after(() => {
    DetectorHook.hooks = hooks;
  });
  const config = { baseDir: cwd, envDetectors: [], detectiveOptions: {} };
  const sourceSession = source(prefix + 'session.ts').RustDependencyScannerSession;
  const get = sourceSession.prototype.get;
  const graph = sourceSession.prototype.dependencyGraph;
  let embeddedGraphs = 0;
  sourceSession.prototype.dependencyGraph = async function (...args) {
    const result = await graph.apply(this, args);
    if (this.workspace && result) embeddedGraphs++;
    return result;
  };
  let embeddedResults = 0;
  sourceSession.prototype.get = function (...args) {
    const result = get.apply(this, args);
    if (this.workspace && result?.status === 'ok') embeddedResults++;
    return result;
  };
  t.after(() => {
    sourceSession.prototype.get = get;
    sourceSession.prototype.dependencyGraph = graph;
  });
  const native = await generateTree([path.join(cwd, 'a.ts')], config);
  assert.equal(embeddedGraphs, 1, 'resolved graph must actually consume the whole embedded graph');
  assert.equal(embeddedResults, 0, 'whole graph avoids per-file embedded results');
  assert.deepEqual(native.madgeTree, { 'a.ts': ['b.ts'], 'b.ts': [] });
  process.env.BIT_RUST_DEPENDENCY_SCANNER = 'off';
  assert.deepEqual(await generateTree([path.join(cwd, 'a.ts')], config), native);
  delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
  let detections = 0;
  const detector = {
    type: 'custom',
    isSupported: () => true,
    detect: () => {
      detections++;
      return [];
    },
  };
  const custom = await generateTree([path.join(cwd, 'a.ts')], { ...config, envDetectors: [detector] });
  assert.ok(detections > 0);
  process.env.BIT_RUST_DEPENDENCY_SCANNER = 'off';
  assert.deepEqual(await generateTree([path.join(cwd, 'a.ts')], { ...config, envDetectors: [detector] }), custom);
});
