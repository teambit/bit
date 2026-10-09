#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const [rootArg, nativeArg, output] = process.argv.slice(2);
assert.ok(rootArg && nativeArg && output, 'usage: command-syntax-proof.cjs <owned-private-cli> <native> <output.json>');
const root = path.resolve(rootArg);
assert.ok([os.tmpdir(), '/tmp'].some((directory) => root.startsWith(directory + path.sep)));
assert.equal(fs.realpathSync(root), root);
assert.ok(fs.existsSync(path.join(root, '.bit-rust-private-build.json')));
const source = path.join(root, 'scopes/toolbox/string/capitalize/index.ts');
const cache = path.join(root, '.git/bit/cache/components/deps');
assert.equal(fs.realpathSync(path.dirname(cache)), path.dirname(cache));
if (fs.existsSync(cache)) assert.equal(fs.realpathSync(cache), cache);
const adapterSource = path.join(root, 'scopes/dependencies/dependencies/files-dependency-builder/precinct/index.ts');
const adapterCompiled = path.join(
  root,
  'node_modules/@teambit/dependencies/dist/files-dependency-builder/precinct/index.js'
);
assert.ok(
  fs.readFileSync(adapterCompiled, 'utf8').includes('enrichParseError'),
  'compile the diagnostic adapter before proof'
);
const bytes = fs.readFileSync(source);
const stat = fs.statSync(source);
const directoryStat = fs.statSync(path.dirname(source));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-syntax-proof-'));
const savedCache = path.join(temporary, 'cache');
const existed = fs.existsSync(cache);
if (existed) fs.cpSync(cache, savedCache, { recursive: true, preserveTimestamps: true });
const run = (native) => {
  fs.rmSync(cache, { recursive: true, force: true });
  const env = { ...process.env, NODE_COMPILE_CACHE: path.join(temporary, 'compile-cache') };
  delete env.BIT_RUST_DEPENDENCY_SCANNER;
  if (native) env.BIT_RUST_DEPENDENCY_SCANNER = path.resolve(nativeArg);
  const result = cp.spawnSync(process.execPath, [path.join(root, 'bin/bit.js'), 'status', '--json'], {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
try {
  fs.writeFileSync(source, 'const value: = invalid;\n');
  const legacy = run(false);
  const native = run(true);
  assert.deepEqual(native, legacy, 'complete CLI JSON must match without normalization');
  const raw = JSON.stringify(legacy);
  assert.ok(raw.includes('Type expected. (line: 1, column: 13)'), 'canonical message and location must reach CLI');
  const report = {
    comparison: 'complete CLI JSON, no normalization',
    diagnosticOverlay: {
      sourceSha256: createHash('sha256').update(fs.readFileSync(adapterSource)).digest('hex'),
      compiledSha256: createHash('sha256').update(fs.readFileSync(adapterCompiled)).digest('hex'),
    },
    nativeSha256: createHash('sha256').update(fs.readFileSync(nativeArg)).digest('hex'),
    syntax: 'const value: = invalid;',
    source: path.relative(root, source),
    completeJsonSha256: createHash('sha256').update(raw).digest('hex'),
    legacy,
    native,
  };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Exact syntax issue parity: ${report.completeJsonSha256}`);
} finally {
  fs.writeFileSync(source, bytes);
  fs.utimesSync(source, stat.atime, stat.mtime);
  fs.utimesSync(path.dirname(source), directoryStat.atime, directoryStat.mtime);
  fs.rmSync(cache, { recursive: true, force: true });
  if (existed) fs.cpSync(savedCache, cache, { recursive: true, preserveTimestamps: true });
  fs.rmSync(temporary, { recursive: true, force: true });
}
