const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { source, installed } = require('./load-source.cjs');
const { writeComponents, mutate } = require('./workspace-inspection-fixture.cjs');
const { benchmarkGlobals } = require('../rust-dependency-analysis/command-workspace.cjs');

const readRustDiff =
  process.env.BIT_TEST_DIFF_COMPILED === '1'
    ? installed('@teambit/bit/dist/rust-diff.js').readRustDiff
    : source('scopes/harmony/bit/rust-diff.ts').readRustDiff;

test('cold diff owns ordinary workspaces with byte-exact canonical JSON and no fallback', async (t) => {
  for (const name of ['BIT_LEGACY_ROOT', 'BIT_TEST_OBJECT_IMPORT', 'BIT_TEST_WORKSPACE_ADDON'])
    assert.ok(process.env[name], `${name} is required`);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-full-diff-runtime-'));
  const directory = path.join(temporary, 'workspace');
  await fs.mkdir(directory);
  const globals = benchmarkGlobals(temporary);
  const saved = Object.fromEntries(
    ['BIT_RUST_CLIENT_VCS', 'BIT_RUST_OBJECT_IMPORT'].map((name) => [name, process.env[name]])
  );
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = process.env.BIT_TEST_OBJECT_IMPORT;
  t.after(async () => {
    await fs.rm(temporary, { recursive: true, force: true });
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  function command(args) {
    return execFileSync(process.execPath, [path.join(process.env.BIT_LEGACY_ROOT, 'bin/bit.js'), ...args], {
      cwd: directory,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, CI: '1', BIT_GLOBALS_DIR: globals, BIT_RUST_CLIENT_VCS: 'off' },
    });
  }
  command(['init', '--skip-interactive', '--default-scope', 'qualification.inspection']);
  const scopeFile = path.join(directory, '.bit/scope.json');
  const scope = JSON.parse(await fs.readFile(scopeFile, 'utf8'));
  scope.name = 'qualification.inspection';
  await fs.writeFile(scopeFile, JSON.stringify(scope));
  await fs.writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({ name: 'full-diff-runtime', private: true })
  );
  await writeComponents(directory);
  for (const name of ['alpha', 'beta']) command(['add', name, '--id', name, '--main', 'index.js']);
  command(['link']);
  command([
    'tag',
    '--ver',
    '1.0.0',
    '--message',
    'full diff baseline',
    '--soft',
    '--disable-tag-pipeline',
    '--ignore-issues',
    '*',
  ]);
  command(['tag', '--persist=skip-build', '--disable-tag-pipeline', '--ignore-issues', '*']);
  const compare = async (label, pattern) => {
    // Node warms its ordinary dependency cache. The native entrypoint must return
    // its own value, so parity cannot accidentally pass via canonical fallback.
    const expected = JSON.parse(command(['diff', ...(pattern ? [pattern] : []), '--json']));
    const bitmap = await fs.readFile(path.join(directory, '.bitmap'));
    const scope = await fs.readFile(scopeFile);
    const actual = await readRustDiff(directory, temporary, pattern);
    assert.ok(actual, `${label}: native diff must complete without fallback`);
    assert.deepEqual(actual, expected, label);
    assert.equal(JSON.stringify(actual), JSON.stringify(expected), `${label}: exact JSON property and row ordering`);
    assert.deepEqual(await fs.readFile(path.join(directory, '.bitmap')), bitmap, `${label}: bitmap unchanged`);
    assert.deepEqual(await fs.readFile(scopeFile), scope, `${label}: scope unchanged`);
    return actual;
  };
  assert.deepEqual(await compare('clean'), []);
  const selected = await compare('explicit short component includes unchanged result', 'alpha');
  assert.equal(selected.length, 1);
  assert.equal(selected[0].hasDiff, false);
  await compare('explicit full component identity', 'qualification.inspection/beta');
  await mutate(directory, 'eol');
  assert.deepEqual(await compare('BOM and CRLF normalization'), []);
  const binaryPath = path.join(directory, 'alpha/binary.bin');
  const binary = await fs.readFile(binaryPath);
  await fs.writeFile(binaryPath, Buffer.from([0, 254, 13, 10, 1]));
  const binaryOnly = await compare('binary-only selected component has no printable patch');
  assert.ok(binaryOnly.some((row) => row.id.endsWith('/alpha') && !row.hasDiff));
  await fs.writeFile(binaryPath, binary);
  await fs.writeFile(
    path.join(directory, 'beta/index.js'),
    "module.exports = () => 'text without trailing newline β🌱';"
  );
  await compare('text without trailing newline');
  await fs.writeFile(
    path.join(directory, 'beta/component.json'),
    JSON.stringify({
      componentId: { scope: 'qualification.inspection', name: 'beta', version: '1.0.0' },
      extensions: {},
    })
  );
  await compare('empty component configuration still receives default core aspects');
  await mutate(directory, 'config');
  const config = await compare('component dependency policy and aspect configuration');
  assert.ok(config.some((row) => row.fieldsDiff?.length));
  await mutate(directory, 'content');
  await compare('text and binary mutation');
  await mutate(directory, 'inventory');
  await compare('source additions and binary rename');
  await fs.writeFile(path.join(directory, 'alpha/empty.txt'), '');
  await fs.writeFile(path.join(directory, 'alpha/file with spaces.txt'), 'added path with spaces\n');
  await compare('empty and whitespace-named additions');
  for (const name of ['z-new', 'a-new']) {
    await fs.mkdir(path.join(directory, name));
    await fs.writeFile(path.join(directory, name, 'index.js'), name === 'a-new' ? '' : 'module.exports = 3;\n');
    command(['add', name, '--id', name, '--main', 'index.js']);
  }
  command(['link']);
  const added = await compare('new components precede modified with canonical insertion order');
  for (const name of ['z-new', 'a-new']) {
    const row = added.find((entry) => entry.id.endsWith(`/${name}`));
    assert.ok(row);
    assert.equal(Object.hasOwn(row, 'fieldsDiff'), false, 'new components omit fieldsDiff');
  }
  // Root directory resolution takes precedence over a matching component name.
  const bitmapFile = path.join(directory, '.bitmap');
  const originalBitmap = await fs.readFile(bitmapFile);
  const bitmap = installed('comment-json').parse(originalBitmap.toString());
  const newA = Object.values(bitmap).find((entry) => entry && entry.name === 'a-new');
  const newZ = Object.values(bitmap).find((entry) => entry && entry.name === 'z-new');
  [newA.rootDir, newZ.rootDir] = [newZ.rootDir, newA.rootDir];
  await fs.writeFile(bitmapFile, JSON.stringify(bitmap));
  const byRoot = await compare('root directory precedes conflicting component name', 'a-new');
  assert.equal(byRoot[0].id, 'qualification.inspection/z-new');
  await fs.writeFile(bitmapFile, originalBitmap);
  await fs.rm(path.join(directory, '.bit/cache/components/deps'), { recursive: true, force: true });
  const cold = await readRustDiff(directory, temporary);
  assert.ok(cold, 'missing dependency cache is derived natively');
  const expectedCold = JSON.parse(command(['diff', '--json']));
  assert.deepEqual(cold, expectedCold);
  assert.equal(JSON.stringify(cold), JSON.stringify(expectedCold));
  await compare('cache refresh');
  await fs.mkdir(path.join(directory, '.bitTmp'));
  assert.equal(await readRustDiff(directory, temporary), undefined, 'canonical lifecycle cleanup declines');
  await fs.rm(path.join(directory, '.bitTmp'), { recursive: true });
  const original = await fs.readFile(path.join(directory, 'workspace.jsonc'));
  const workspace = installed('comment-json').parse(original.toString());
  workspace['qualification.custom/runtime'] = {};
  await fs.writeFile(path.join(directory, 'workspace.jsonc'), JSON.stringify(workspace));
  assert.equal(await readRustDiff(directory, temporary), undefined, 'custom runtime declines');
});
