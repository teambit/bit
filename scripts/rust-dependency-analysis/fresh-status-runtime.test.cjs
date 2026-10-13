const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const { source, installed } = require('../rust-object-import/load-source.cjs');
const { benchmarkGlobals } = require('./command-workspace.cjs');
const cacache = createRequire(installed.resolve('@teambit/workspace.modules.fs-cache'))('cacache');
const readRustStatus =
  process.env.BIT_TEST_STATUS_COMPILED === '1'
    ? installed('@teambit/bit/dist/rust-status.js').readRustStatus
    : source('scopes/harmony/bit/rust-status.ts').readRustStatus;

const readRustDiff =
  process.env.BIT_TEST_STATUS_COMPILED === '1'
    ? installed('@teambit/bit/dist/rust-diff.js').readRustDiff
    : source('scopes/harmony/bit/rust-diff.ts').readRustDiff;

test('cold native status derives canonical raw dependency caches for packages, dev files and linked components', async (t) => {
  for (const key of ['BIT_LEGACY_ROOT', 'BIT_TEST_OBJECT_IMPORT', 'BIT_TEST_WORKSPACE_ADDON'])
    assert.ok(process.env[key], key);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-fresh-status-runtime-'));
  const directory = path.join(temporary, 'workspace');
  await fs.mkdir(directory);
  const globals = benchmarkGlobals(temporary);
  const previous = { ...process.env };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = process.env.BIT_TEST_OBJECT_IMPORT;
  delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
  t.after(async () => {
    process.env = previous;
    installed('@teambit/harmony.modules.feature-toggle').reloadFeatureToggle();
    cacache.clearMemoized();
    await fs.rm(temporary, { recursive: true, force: true });
  });
  function command(args) {
    return execFileSync(process.execPath, [path.join(process.env.BIT_LEGACY_ROOT, 'bin/bit.js'), ...args], {
      cwd: directory,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, CI: '1', BIT_GLOBALS_DIR: globals, BIT_RUST_CLIENT_VCS: 'off' },
    });
  }
  async function write(file, body) {
    const target = path.join(directory, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
  }
  async function packageFixture(name, version) {
    await write(
      `node_modules/${name}/package.json`,
      JSON.stringify({ name, version, main: 'index.js', types: 'index.d.ts' })
    );
    await write(`node_modules/${name}/index.js`, 'module.exports = 1;');
    await write(`node_modules/${name}/index.d.ts`, 'export declare const value: number;');
  }
  command(['init', '--skip-interactive', '--default-scope', 'qualification.fresh']);
  const scopeFile = path.join(directory, '.bit/scope.json');
  const scope = JSON.parse(await fs.readFile(scopeFile, 'utf8'));
  await fs.writeFile(scopeFile, JSON.stringify({ ...scope, name: 'qualification.fresh' }));
  await write(
    'package.json',
    JSON.stringify({
      name: 'fresh-native-status',
      private: true,
      dependencies: { 'runtime-pkg': '^1.2.0' },
      devDependencies: { 'test-pkg': '~2.3.0' },
    })
  );
  await packageFixture('runtime-pkg', '1.2.3');
  await packageFixture('test-pkg', '2.3.4');
  await packageFixture('later-pkg', '4.5.6');
  await packageFixture('@types/runtime-pkg', '3.1.5');
  const workspaceFile = path.join(directory, 'workspace.jsonc');
  const workspaceConfig = installed('comment-json').parse(await fs.readFile(workspaceFile, 'utf8'));
  workspaceConfig['teambit.dependencies/dependency-resolver'] ??= {};
  workspaceConfig['teambit.dependencies/dependency-resolver'].policy = {
    dependencies: { '@types/runtime-pkg': '^3.1.0' },
  };
  await fs.writeFile(workspaceFile, JSON.stringify(workspaceConfig));
  await write(
    'alpha/index.js',
    "require('runtime-pkg'); require('@qualification/fresh.beta'); require('./typed'); module.exports = 1;\n"
  );
  await write('alpha/typed.ts', "import 'runtime-pkg'; export const value: number = 1;\n");
  await write('alpha/aaa.spec.js', "require('runtime-pkg'); require('@qualification/fresh.beta');\n");
  await write('alpha/index.spec.js', "require('test-pkg'); require('./index');\n");
  await write('beta/index.js', 'module.exports = 2;\n');
  for (const name of ['alpha', 'beta']) command(['add', name, '--id', name, '--main', 'index.js']);
  command(['link']);
  command([
    'tag',
    '--ver',
    '1.0.0',
    '--message',
    'fresh dependency baseline',
    '--soft',
    '--disable-tag-pipeline',
    '--ignore-issues',
    '*',
  ]);
  command(['tag', '--persist=skip-build', '--disable-tag-pipeline', '--ignore-issues', '*']);
  const cache = path.join(directory, '.bit/cache/components/deps');
  async function cached() {
    cacache.clearMemoized();
    const entries = await cacache.ls(cache);
    const result = {};
    for (const key of Object.keys(entries).sort()) {
      const entry = await cacache.get(cache, key);
      result[key] = { data: entry.data.toString(), timestamp: entry.metadata?.timestamp };
    }
    return result;
  }
  async function compare(label, stale = false) {
    const backup = path.join(temporary, 'prior-cache');
    await fs.rm(backup, { recursive: true, force: true });
    if (stale) await fs.cp(cache, backup, { recursive: true });
    else await fs.rm(cache, { recursive: true, force: true });
    const expected = JSON.parse(command(['status', '--json']));
    const expectedCache = await cached();
    assert.ok(Object.keys(expectedCache).length >= 2, `${label}: canonical AutoDetectDeps raw cache captured`);
    await fs.rm(cache, { recursive: true, force: true });
    if (stale) await fs.cp(backup, cache, { recursive: true });
    const before = Date.now();
    const actual = await readRustStatus(directory, temporary);
    assert.ok(actual, `${label}: native fresh status must complete without fallback`);
    assert.deepEqual(actual, expected, label);
    assert.equal(JSON.stringify(actual), JSON.stringify(expected), `${label}: exact status JSON`);
    const actualCache = await cached();
    assert.deepEqual(Object.keys(actualCache), Object.keys(expectedCache), `${label}: cache keys`);
    for (const [key, entry] of Object.entries(actualCache)) {
      assert.equal(entry.data, expectedCache[key].data, `${label}: actual AutoDetectDeps serialized raw data ${key}`);
      assert.ok(Number.isFinite(entry.timestamp) && entry.timestamp <= Date.now());
      if (!stale) assert.ok(entry.timestamp >= before, `${label}: canonical fresh cache timestamp`);
    }
    return actualCache;
  }
  async function compareDiff(label, pattern, stale = false) {
    const backup = path.join(temporary, 'prior-diff-cache');
    await fs.rm(backup, { recursive: true, force: true });
    if (stale) await fs.cp(cache, backup, { recursive: true });
    else await fs.rm(cache, { recursive: true, force: true });
    const expected = JSON.parse(command(['diff', ...(pattern ? [pattern] : []), '--json']));
    const expectedCache = await cached();
    await fs.rm(cache, { recursive: true, force: true });
    if (stale) await fs.cp(backup, cache, { recursive: true });
    const actual = await readRustDiff(directory, temporary, pattern);
    assert.ok(actual, `${label}: cold diff must derive dependencies without fallback`);
    assert.deepEqual(actual, expected);
    assert.equal(JSON.stringify(actual), JSON.stringify(expected));
    const actualCache = await cached();
    const data = (entries) => Object.fromEntries(Object.entries(entries).map(([key, row]) => [key, row.data]));
    assert.deepEqual(data(actualCache), data(expectedCache), `${label}: cold diff commits canonical raw caches`);
    return actualCache;
  }
  const initial = await compare('missing cache');
  const alpha = JSON.parse(Object.entries(initial).find(([key]) => key.includes('/alpha@'))[1].data);
  assert.ok(alpha.allDependencies.dependencies.some((row) => row.id.name === 'beta'));
  assert.equal(alpha.allPackagesDependencies.packageDependencies['runtime-pkg'], '1.2.3');
  assert.equal(alpha.allPackagesDependencies.devPackageDependencies['test-pkg'], '2.3.4');
  await compareDiff('missing cache');
  await cacache.put(cache, 'qualification.fresh/obsolete@1.0.0', JSON.stringify(alpha), {
    metadata: { timestamp: Date.now() + 60000 },
  });
  workspaceConfig['teambit.dependencies/dependency-resolver'].policy.dependencies['@types/runtime-pkg'] = '^4.2.0';
  await fs.writeFile(workspaceFile, JSON.stringify(workspaceConfig));
  const changedTypes = await compare('workspace types policy overrides model', true);
  const changedAlpha = JSON.parse(Object.entries(changedTypes).find(([key]) => key.includes('/alpha@'))[1].data);
  assert.equal(changedAlpha.allPackagesDependencies.devPackageDependencies['@types/runtime-pkg'], '^4.2.0');
  delete workspaceConfig['teambit.dependencies/dependency-resolver'].policy.dependencies['@types/runtime-pkg'];
  await fs.writeFile(workspaceFile, JSON.stringify(workspaceConfig));
  const modelTypes = await compare('model types policy fallback', true);
  const modelAlpha = JSON.parse(Object.entries(modelTypes).find(([key]) => key.includes('/alpha@'))[1].data);
  assert.equal(modelAlpha.allPackagesDependencies.devPackageDependencies['@types/runtime-pkg'], '^3.1.0');
  await cacache.put(cache, 'qualification.fresh/obsolete@1.0.0', JSON.stringify(alpha), {
    metadata: { timestamp: Date.now() + 60000 },
  });
  await fs.writeFile(workspaceFile, JSON.stringify(workspaceConfig));
  const selectedCache = await compareDiff('single-target global cache invalidation', 'alpha', true);
  assert.deepEqual(Object.keys(selectedCache), ['qualification.fresh/alpha@1.0.0']);
  await write('alpha/typed.ts', "import { value } from 'later-pkg'; export { value };\n");
  await compare('fresh TypeScript source and package version', true);
  await packageFixture('later-pkg', '4.5.7');
  await write('alpha/typed.ts', "import { value } from 'later-pkg'; export const updated = value;\n");
  await compare('mutated installed package', true);
  const cachedBeforeDisabled = await cached();
  const features = process.env.BIT_FEATURES;
  process.env.BIT_FEATURES = 'no-fs-cache';
  installed('@teambit/harmony.modules.feature-toggle').reloadFeatureToggle();
  assert.equal(
    await readRustStatus(directory, temporary),
    undefined,
    'disabled filesystem cache retains canonical dispatch'
  );
  assert.deepEqual(await cached(), cachedBeforeDisabled, 'disabled cache must not write');
  if (features === undefined) delete process.env.BIT_FEATURES;
  else process.env.BIT_FEATURES = features;
  installed('@teambit/harmony.modules.feature-toggle').reloadFeatureToggle();
  const alphaKey = Object.keys(cachedBeforeDisabled).find((key) => key.includes('/alpha@'));
  const info = await cacache.get.info(cache, alphaKey);
  await fs.writeFile(info.path, 'corrupt raw dependency data');
  assert.equal(
    await readRustStatus(directory, temporary),
    undefined,
    'integrity failure is not an ordinary fresh cache miss'
  );
  assert.equal(
    await fs.readFile(info.path, 'utf8'),
    'corrupt raw dependency data',
    'native decline leaves canonical cleanup responsible'
  );
  command(['status', '--json']);
  assert.ok(await readRustStatus(directory, temporary), 'canonical cleanup allows a later native read');
  await write('beta/index.js', "require('./missing'); module.exports = 1;\n");
  await fs.writeFile(workspaceFile, JSON.stringify(workspaceConfig));
  const beforeResetDecline = await cached();
  assert.equal(
    await readRustStatus(directory, temporary),
    undefined,
    'late unsupported component declines global reset'
  );
  assert.deepEqual(await cached(), beforeResetDecline, 'decline must not purge or rewrite existing raw caches');
  await fs.rm(cache, { recursive: true, force: true });
  const beforeUnsupported = await cached();
  assert.equal(await readRustStatus(directory, temporary), undefined, 'unresolved graphs must decline');
  assert.deepEqual(await cached(), beforeUnsupported, 'decline must not partially write sibling raw caches');
});
