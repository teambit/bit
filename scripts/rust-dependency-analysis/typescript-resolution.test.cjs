const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const installed = createRequire(path.join(process.env.BIT_LEGACY_ROOT || path.resolve(__dirname, '../..'), 'package.json'));
const lookup = createRequire(installed.resolve('@teambit/typescript.deps-lookups.lookup-typescript'));
const ts = lookup('typescript');
const helper = process.env.BIT_TEST_OBJECT_IMPORT;
assert.ok(helper, 'TypeScript resolution parity requires an actual helper');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-typescript-resolution-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, bytes = '') => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    return file;
  };
  return { root, write, filename: write('entry.ts', 'export {};') };
}
function native(filename, groups) {
  const input = groups.map((dependencies, id) => {
    const body = Buffer.from(JSON.stringify({ kind: 'dependencyResolve', mode: 'typescript5.9', filename, dependencies }));
    const header = Buffer.alloc(12);
    header.write('BWS1');
    header.writeUInt32BE(id, 4);
    header.writeUInt32BE(body.length, 8);
    return Buffer.concat([header, body]);
  });
  return execFileSync(helper, { input: Buffer.concat(input), encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    .trim().split('\n').map((line) => JSON.parse(line));
}
function canonical(filename, dependency) {
  const resolved = ts.resolveModuleName(dependency, filename, { module: ts.ModuleKind.CommonJS }, ts.createCompilerHost({}))
    .resolvedModule?.resolvedFileName;
  // Bit's lookupTypeScript normalizes the compiler's slash-separated path before returning it.
  return resolved ? path.resolve(resolved) : null;
}
function compare(filename, groups) {
  const results = native(filename, groups);
  results.forEach((result, index) => {
    assert.equal(result.failed, false, JSON.stringify(result));
    assert.deepEqual(result.data.resolved, groups[index].map((dependency) => canonical(filename, dependency)), groups[index].join(', '));
  });
}

test('TypeScript extension substitution matches the installed resolver across 2400 competing file cases', (t) => {
  if (ts.version !== '5.9.2') return t.skip('native relative lookup is gated to TypeScript 5.9.2');
  const f = fixture(t);
  const extensions = ['.ts', '.tsx', '.d.ts', '.js', '.jsx', '.mts', '.d.mts', '.mjs', '.cts', '.d.cts', '.cjs', '.json', '.css', '.d.css.ts'];
  const groups = [];
  for (let index = 0; index < 160; index++) {
    let state = index + 100;
    for (const extension of extensions) {
      state = (state * 1664525 + 1013904223) >>> 0;
      if (state % 3 === 0) f.write(`case-${index}/value${extension}`);
    }
    groups.push(['', ...extensions].map((extension) => `./case-${index}/value${extension}`));
  }
  compare(f.filename, groups);
});

test('TypeScript package entries, declaration precedence and directory rules match the installed resolver', (t) => {
  if (ts.version !== '5.9.2') return t.skip('native relative lookup is gated to TypeScript 5.9.2');
  const f = fixture(t);
  const dependencies = [];
  const cases = [
    { types: 'types.d.ts', typings: 'other.d.ts', main: 'main.js' },
    { types: 'types.d.ts', typings: 'missing.d.ts', main: 'main.js' },
    { types: 'types.d.ts', typings: '', main: 'main.js' },
    { types: 'types.d.ts', typings: true, main: 'main.js' },
    { types: 'missing.d.ts', main: 'main.js' },
    { main: 'main.js' }, { main: 'main' }, { main: 'lib' }, { main: '.' },
    { main: './' }, { main: '../external.js' }, { main: false }, {},
  ];
  for (const [index, pkg] of cases.entries()) {
    f.write(`package-${index}/package.json`, JSON.stringify(pkg));
    for (const name of ['types.ts', 'types.d.ts', 'other.d.ts', 'main.ts', 'main.js', 'index.ts', 'index.js', 'lib/index.ts']) {
      f.write(`package-${index}/${name}`);
    }
    f.write(`package-${index}/lib/package.json`, '{"types":"../other.d.ts"}');
    dependencies.push(`./package-${index}`, `./package-${index}/`, `./package-${index}/.`);
  }
  f.write('external.ts');
  for (const name of ['dir', 'space name', 'λ🌱', '.hidden']) {
    f.write(`${name}.ts`);
    f.write(`${name}/index.ts`);
    dependencies.push(`./${name}`, `./${name}/`, `./${name}/.`);
  }
  f.write('declaration/types.d.ts');
  f.write('declaration/types.ts');
  f.write('declaration/package.json', '{"types":"types.d.ts"}');
  dependencies.push('./declaration');
  f.write('js-only/main.js');
  f.write('js-only/package.json', '{"types":"missing.d.ts","main":"main.js"}');
  dependencies.push('./js-only');
  f.write('missing-main/index.jsx');
  f.write('missing-main/package.json', '{"main":"missing.js"}');
  dependencies.push('./missing-main');
  f.write('typed-folder.js');
  f.write('typed-folder/index.ts');
  f.write('node_modules/pkg/index.ts');
  dependencies.push('./typed-folder', './node_modules/pkg');
  try {
    fs.symlinkSync(path.join(f.root, 'declaration'), path.join(f.root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    dependencies.push('./linked', './linked/types.d.ts');
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
  }
  compare(f.filename, [dependencies]);
});

test('version mappings and malformed package JSON decline to canonical lookup', (t) => {
  const f = fixture(t);
  f.write('mapped/package.json', '{"typesVersions":{"*":{"*": ["types/*"]}}}');
  f.write('mapped/index.ts');
  f.write('bad/package.json', '{');
  f.write('bad/index.ts');
  f.write('node_modules/pkg/index.ts');
  for (const dependency of ['./mapped', './bad', '.hidden', './bad\\path']) {
    assert.equal(native(f.filename, [[dependency]])[0].failed, true, dependency);
  }
});
