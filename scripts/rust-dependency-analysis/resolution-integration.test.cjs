const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { source, installed } = require('../rust-object-import/load-source.cjs');
const prefix = 'scopes/dependencies/dependencies/files-dependency-builder/';
const load = (name) =>
  process.env.BIT_TEST_SCANNER_COMPILED
    ? installed('@teambit/dependencies/dist/files-dependency-builder/' + name + '.js')
    : source(prefix + name + '.ts');
const generateTree = load('generate-tree-madge').default;
const cabinet = load('filing-cabinet/index');
const { RustDependencyScannerSession } = load('rust-scanner/session');
const { DetectorHook } = installed('@teambit/dependency-resolver');
assert.ok(process.env.BIT_TEST_WORKSPACE_ADDON && process.env.BIT_TEST_OBJECT_IMPORT, 'actual native runtime required');

function fixture(t) {
  const previous = { ...process.env };
  const hooks = DetectorHook.hooks;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-rust-resolved-graph-'));
  t.after(() => {
    process.env = previous;
    DetectorHook.hooks = hooks;
    fs.rmSync(root, { recursive: true, force: true });
  });
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = process.env.BIT_TEST_OBJECT_IMPORT;
  delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
  DetectorHook.hooks = [];
  const write = (name, content) => {
    const target = path.join(root, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    return target;
  };
  const file = write('src/entry.js', "require('./child'); require('package-a'); require('./missing');");
  write('src/child.ts', 'export const value = 1;');
  write('node_modules/package-a/package.json', '{"main":"index.js"}');
  write('node_modules/package-a/index.js', 'module.exports = 1;');
  const resolutions = [];
  const original = RustDependencyScannerSession.prototype.resolveDependencies;
  RustDependencyScannerSession.prototype.resolveDependencies = async function (...args) {
    const result = await original.apply(this, args);
    resolutions.push({ args, result });
    return result;
  };
  t.after(() => {
    RustDependencyScannerSession.prototype.resolveDependencies = original;
  });
  const config = () => ({ baseDir: root, envDetectors: [], detectiveOptions: {} });
  return { root, file, write, resolutions, config };
}

test('resolved graphs consume Rust paths, preserve missing imports and keep module search-path effects', async (t) => {
  const f = fixture(t);
  assert.ok(!require.main.paths.includes(path.join(f.root, 'src/node_modules')));
  const result = await generateTree([f.file], f.config());
  assert.ok(
    f.resolutions.some(({ result: row }) => row?.some(Boolean)),
    'native lookup must produce graph paths'
  );
  assert.ok(require.main.paths.includes(path.join(f.root, 'src/node_modules')));
  process.env.BIT_RUST_DEPENDENCY_SCANNER = 'off';
  assert.deepEqual(result, await generateTree([f.file], f.config()));
});

test('package main edits are observed by later graphs without reusing resolution snapshots', async (t) => {
  const f = fixture(t);
  await generateTree([f.file], f.config());
  f.write('node_modules/package-a/changed.js', 'module.exports = 2;');
  f.write('node_modules/package-a/package.json', '{"main":"changed.js"}');
  const changed = await generateTree([f.file], f.config());
  assert.ok(f.resolutions.some(({ result }) => result?.some((name) => name?.endsWith('changed.js'))));
  process.env.BIT_RUST_DEPENDENCY_SCANNER = 'off';
  assert.deepEqual(changed, await generateTree([f.file], f.config()));
});

test('environment lookup callbacks retain their invocation order and results', async (t) => {
  const f = fixture(t);
  const calls = [];
  const detector = {
    isSupported: ({ ext }) => ext === '.js',
    detect: () => ['./forced'],
    dependencyLookup: ({ dependency }) => {
      calls.push(dependency);
      return path.join(f.root, 'src/child.ts');
    },
  };
  const config = () => ({ ...f.config(), envDetectors: [detector] });
  const native = await generateTree([f.file], config());
  const nativeCalls = [...calls];
  calls.length = 0;
  process.env.BIT_RUST_DEPENDENCY_SCANNER = 'off';
  assert.deepEqual(native, await generateTree([f.file], config()));
  assert.deepEqual(nativeCalls, calls);
  assert.ok(!f.resolutions.some(({ result }) => result?.some(Boolean)));
});

test('TypeScript relative paths use native substitution without CommonJS module-path effects', async (t) => {
  const f = fixture(t);
  const file = f.write('typed/entry.ts', "import './value.js'; import './package';");
  f.write('typed/value.js', 'export const value = 0;');
  f.write('typed/value.ts', 'export const value = 1;');
  f.write('typed/package/package.json', '{"types":"declarations.d.ts"}');
  f.write('typed/package/declarations.d.ts', 'export declare const value: number;');
  assert.ok(!require.main.paths.includes(path.join(f.root, 'typed/node_modules')));
  const native = await generateTree([file], f.config());
  if (cabinet.rustDependencyResolutionMode(file) === 'typescript5.9') {
    assert.ok(f.resolutions.some(({ args, result }) => args[2] === 'typescript5.9' && result?.some(Boolean)));
  }
  assert.ok(!require.main.paths.includes(path.join(f.root, 'typed/node_modules')));
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  const legacy = await generateTree([file], f.config());
  assert.deepEqual(native, legacy);
  assert.ok(native.madgeTree['typed/entry.ts'].includes('typed/value.ts'));
});

test('TypeScript package type edits remain fresh across graphs and bare imports retain CommonJS behavior', async (t) => {
  const f = fixture(t);
  const file = f.write('mixed/entry.ts', "import './package'; import 'package-a';");
  f.write('mixed/package/package.json', '{"types":"first.d.ts"}');
  f.write('mixed/package/first.d.ts', 'export declare const first: number;');
  f.write('mixed/package/second.d.ts', 'export declare const second: number;');
  const first = await generateTree([file], f.config());
  assert.ok(first.madgeTree['mixed/entry.ts'].includes('mixed/package/first.d.ts'));
  assert.ok(require.main.paths.includes(path.join(f.root, 'mixed/node_modules')));
  f.write('mixed/package/package.json', '{"types":"second.d.ts"}');
  const second = await generateTree([file], f.config());
  assert.ok(second.madgeTree['mixed/entry.ts'].includes('mixed/package/second.d.ts'));
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  assert.deepEqual(second, await generateTree([file], f.config()));
});

test('registered lookup overrides keep canonical precedence', async (t) => {
  const f = fixture(t);
  const { lookupJavaScript } = installed('@teambit/typescript.deps-lookups.lookup-typescript');
  let calls = 0;
  cabinet.register('.js', () => {
    calls++;
    return path.join(f.root, 'src/child.ts');
  });
  t.after(() => cabinet.register('.js', lookupJavaScript));
  const native = await generateTree([f.file], f.config());
  assert.ok(calls > 0);
  assert.ok(!f.resolutions.some(({ result }) => result?.some(Boolean)));
  process.env.BIT_RUST_DEPENDENCY_SCANNER = 'off';
  assert.deepEqual(native, await generateTree([f.file], f.config()));
});

test('resolution refreshes source classification and a declined lookup leaves the scanner reusable', async (t) => {
  const f = fixture(t);
  const session = new RustDependencyScannerSession({
    executable: process.env.BIT_TEST_OBJECT_IMPORT,
    workspaceAddon: process.env.BIT_TEST_WORKSPACE_ADDON,
    cwd: f.root,
  });
  t.after(() => session.dispose());
  await session.prefetch([f.file]);
  f.write('src/entry.js', "define(['package-a'], function () {});");
  assert.equal(await session.resolveDependencies(f.file, ['package-a']), undefined);
  assert.equal(session.unavailableReason, undefined);
  f.write('src/entry.js', "require('package-a');");
  assert.deepEqual(await session.resolveDependencies(f.file, ['package-a']), [
    path.join(f.root, 'node_modules/package-a/index.js'),
  ]);
});

test('resolved path output respects the session byte budget and clears cached results on failure', async (t) => {
  const f = fixture(t);
  const main = Array.from({ length: 8 }, (_, i) => `segment-${i}-${'x'.repeat(60)}`).join('/') + '/index.js';
  f.write('node_modules/package-a/package.json', JSON.stringify({ main }));
  f.write('node_modules/package-a/' + main, 'module.exports = 1;');
  const session = new RustDependencyScannerSession({
    executable: process.env.BIT_TEST_OBJECT_IMPORT,
    workspaceAddon: process.env.BIT_TEST_WORKSPACE_ADDON,
    cwd: f.root,
    maxResponseBytes: 512,
  });
  t.after(() => session.dispose());
  await session.prefetch([f.file]);
  assert.equal(session.get(f.file).status, 'ok');
  assert.equal(await session.resolveDependencies(f.file, ['package-a']), undefined);
  assert.match(session.unavailableReason, /output limit/);
  assert.equal(session.get(f.file), undefined);
});
