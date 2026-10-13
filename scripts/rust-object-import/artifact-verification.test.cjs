const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { root, installed } = require('./load-source.cjs');
const ts = installed('typescript');
const posix = { skip: !process.getuid };
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-verification-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const module = path.join(directory, 'verify.cjs');
  fs.writeFileSync(
    module,
    ts.transpileModule(
      fs.readFileSync(path.join(root, 'scopes/scope/objects/objects/rust-artifact-verification.ts'), 'utf8'),
      {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      }
    ).outputText
  );
  const filename = path.join(directory, 'addon.node');
  const bytes = Buffer.from('verified native content');
  fs.writeFileSync(filename, bytes);
  const files = [
    { filename, sha256: createHash('sha256').update(bytes).digest('hex'), limit: 1024, bytes: bytes.length },
  ];
  const globals = path.join(directory, 'globals');
  const cache = path.join(globals, 'rust-artifact-verification-v1');
  const run = () => {
    const result = spawnSync(
      process.execPath,
      [
        '-e',
        `
      const fs = require('node:fs');
      const verify = require(process.argv[1]).verifyPackagedFiles;
      const files = JSON.parse(process.argv[2]);
      let reads = 0;
      const read = fs.readFileSync;
      fs.readFileSync = function(filename, ...args) {
        if (files.some(file => file.filename === filename)) reads++;
        return read.call(this, filename, ...args);
      };
      try { console.log(JSON.stringify({ matches: verify(files), reads })); }
      catch (error) { console.log(JSON.stringify({ matches: false, reads, error: error.message })); }
    `,
        module,
        JSON.stringify(files),
      ],
      { env: { ...process.env, BIT_GLOBALS_DIR: globals }, encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  return { directory, filename, files, globals, cache, run, bytes };
}

test('a fresh process reuses successful unchanged verification and rehashes restored content', posix, (t) => {
  const f = fixture(t);
  assert.deepEqual(f.run(), { matches: true, reads: 1 });
  assert.deepEqual(f.run(), { matches: true, reads: 0 });
  const stat = fs.statSync(f.filename);
  fs.writeFileSync(f.filename, Buffer.alloc(f.bytes.length, 120));
  fs.utimesSync(f.filename, stat.atime, stat.mtime);
  assert.equal(f.run().matches, false, 'restoring mtime cannot hide content changes');
  fs.writeFileSync(f.filename, f.bytes);
  assert.deepEqual(f.run(), { matches: true, reads: 1 });
  assert.deepEqual(f.run(), { matches: true, reads: 0 });
});

test('replacement, digest changes, size mismatches and redirects invalidate verification', posix, (t) => {
  const f = fixture(t);
  assert.equal(f.run().matches, true);
  const replacement = path.join(f.directory, 'replacement');
  fs.writeFileSync(replacement, f.bytes);
  fs.renameSync(replacement, f.filename);
  assert.deepEqual(f.run(), { matches: true, reads: 1 });
  f.files[0].sha256 = 'a'.repeat(64);
  assert.equal(f.run().matches, false);
  f.files[0].sha256 = createHash('sha256').update(f.bytes).digest('hex');
  f.files[0].bytes++;
  assert.equal(f.run().matches, false);
  f.files[0].bytes--;
  fs.renameSync(f.filename, replacement);
  fs.symlinkSync(replacement, f.filename);
  assert.equal(f.run().matches, false);
});

for (const change of [
  'corrupt',
  'delete',
  'file permissions',
  'directory permissions',
  'directory symlink',
  'unavailable',
]) {
  test(`a ${change} cache falls back to content verification`, posix, (t) => {
    const f = fixture(t);
    assert.equal(f.run().matches, true);
    const entry = path.join(f.cache, fs.readdirSync(f.cache)[0]);
    if (change === 'corrupt') fs.writeFileSync(entry, 'a'.repeat(64));
    if (change === 'delete') fs.unlinkSync(entry);
    if (change === 'file permissions') fs.chmodSync(entry, 0o666);
    if (change === 'directory permissions') fs.chmodSync(f.cache, 0o777);
    if (change === 'directory symlink') {
      fs.renameSync(f.cache, `${f.cache}-moved`);
      fs.symlinkSync(`${f.cache}-moved`, f.cache);
    }
    if (change === 'unavailable') {
      fs.rmSync(f.globals, { recursive: true });
      fs.writeFileSync(f.globals, 'not a directory');
    }
    assert.deepEqual(f.run(), { matches: true, reads: 1 });
    fs.writeFileSync(f.filename, Buffer.alloc(f.bytes.length, 120));
    assert.equal(f.run().matches, false);
  });
}

test('files changed while being hashed are never remembered', (t) => {
  const f = fixture(t);
  const { verifyPackagedFiles } = require(path.join(f.directory, 'verify.cjs'));
  const original = fs.readFileSync;
  fs.readFileSync = function (filename, ...args) {
    const value = original.call(this, filename, ...args);
    if (filename === f.filename) fs.writeFileSync(filename, Buffer.alloc(f.bytes.length, 120));
    return value;
  };
  const previous = process.env.BIT_GLOBALS_DIR;
  process.env.BIT_GLOBALS_DIR = f.globals;
  try {
    assert.equal(verifyPackagedFiles(f.files), false);
  } finally {
    fs.readFileSync = original;
    if (previous === undefined) delete process.env.BIT_GLOBALS_DIR;
    else process.env.BIT_GLOBALS_DIR = previous;
  }
  assert.equal(f.run().matches, false);
});
