const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const installed = createRequire(
  path.join(process.env.BIT_LEGACY_ROOT || path.resolve(__dirname, '../..'), 'package.json')
);
const lookupRoot = path.dirname(installed.resolve('@teambit/typescript.deps-lookups.lookup-typescript'));
const { commonJSLookup } = require(path.join(lookupRoot, 'lookup-typescript.js'));
const helper = process.env.BIT_TEST_OBJECT_IMPORT;
assert.ok(helper, 'default resolution parity requires the actual Rust helper');

function frame(id, request) {
  const body = Buffer.from(JSON.stringify(request));
  const header = Buffer.alloc(12);
  header.write('BWS1');
  header.writeUInt32BE(id, 4);
  header.writeUInt32BE(body.length, 8);
  return Buffer.concat([header, body]);
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-native-resolution-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, source = '') => {
    const filename = path.join(root, name);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, source);
    return filename;
  };
  write('package.json', '{}');
  const filename = write('src/entry.js', "require('fixture'); module.exports = 1;");
  return { root, filename, write };
}
function native(filename, dependencies) {
  return JSON.parse(
    execFileSync(helper, {
      input: frame(19, { kind: 'dependencyResolve', mode: 'commonjs', filename, dependencies, home: os.homedir() }),
      encoding: 'utf8',
    })
  );
}

test('native CommonJS lookup matches exact files, extension priority, directory entries and package search', (t) => {
  const { root, filename, write } = fixture(t);
  const dependencies = [];
  const extensions = [
    '.js',
    '.json',
    '.cjs',
    '.mjs',
    '.jsx',
    '.ts',
    '.tsx',
    '.cts',
    '.mts',
    '.d.ts',
    '.css',
    '.scss',
    '.sass',
    '.styl',
    '.less',
  ];
  for (let i = 0; i < extensions.length; i++) {
    for (const extension of extensions.slice(i)) write(`src/priority-${i}${extension}`);
    dependencies.push(`./priority-${i}`, `./priority-${i}${extensions[i]}`);
    write(`src/dir-${i}/index${extensions[i]}`);
    dependencies.push(`./dir-${i}`);
  }
  for (const [name, main] of Object.entries({
    direct: 'target.js',
    directory: 'lib',
    dotted: '.',
    empty: '',
    bool: false,
    nil: null,
    zero: 0,
    absent: undefined,
    missing: 'missing.js',
    escape: '../outside.js',
  })) {
    write(`node_modules/${name}/package.json`, JSON.stringify({ name, main }));
    write(`node_modules/${name}/target.js`);
    write(`node_modules/${name}/lib/index.ts`);
    write(`node_modules/${name}/index.js`);
    dependencies.push(name, `${name}/target`);
  }
  write('node_modules/outside.js');
  write('node_modules/@scope/pkg/package.json', '{"main":"./entry.cjs"}');
  write('node_modules/@scope/pkg/entry.cjs');
  dependencies.push('@scope/pkg');
  write('src/node_modules/shadow/index.ts');
  write('node_modules/shadow/index.js');
  dependencies.push('shadow');
  for (const name of ['space name', 'λ🌱', 'Case', 'exact.txt']) {
    write(`src/${name}`);
    dependencies.push(`./${name}`);
  }
  dependencies.push(
    './missing',
    './dir-0/../priority-0',
    './priority-0/',
    '../node_modules/direct/target.js',
    'certainly-missing-bit-resolution-fixture'
  );
  try {
    fs.symlinkSync(
      path.join(root, 'node_modules/direct'),
      path.join(root, 'node_modules/linked'),
      process.platform === 'win32' ? 'junction' : 'dir'
    );
    dependencies.push('linked', 'linked/target');
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
  }
  const expected = dependencies.map((dependency) => commonJSLookup({ dependency, filename }) || null);
  const actual = native(filename, dependencies);
  assert.equal(actual.failed, false, JSON.stringify(actual));
  assert.equal(actual.completed, dependencies.length);
  assert.deepEqual(actual.data.resolved, expected);
});

test('unsupported package shapes and bounded recursive entries decline for canonical fallback', (t) => {
  const { filename, write } = fixture(t);
  write('node_modules/invalid/package.json', '{"main":true}');
  write('node_modules/invalid/index.js');
  assert.equal(native(filename, ['invalid']).failed, true);
  write('node_modules/cycle/package.json', '{"main":"../cycle"}');
  assert.equal(native(filename, ['cycle']).failed, true);
  write('node_modules/large/package.json', JSON.stringify({ main: 'index.js', padding: 'x'.repeat(1024 * 1024) }));
  assert.equal(native(filename, ['large']).failed, true);
  assert.equal(native(filename, ['invalid\\spelling']).failed, true);
  for (const [name, bytes] of [
    ['bad-json', Buffer.from('{')],
    ['huge-number', Buffer.from('{"main":"target.js","unused":1e400}')],
    ['surrogate', Buffer.from('{"main":"target.js","unused":"\\ud800"}')],
    [
      'invalid-utf8',
      Buffer.concat([Buffer.from('{"main":"target.js","unused":"'), Buffer.from([255]), Buffer.from('"}')]),
    ],
  ]) {
    write(`node_modules/${name}/package.json`, bytes);
    write(`node_modules/${name}/target.js`);
    write(`node_modules/${name}/index.js`);
    assert.equal(native(filename, [name]).failed, true, name);
    assert.ok(commonJSLookup({ filename, dependency: name }), 'canonical fallback still resolves the package');
  }
});
