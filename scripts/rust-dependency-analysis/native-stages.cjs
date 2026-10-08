const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const [binary, fixture, output] = process.argv.slice(2);
assert.ok(binary && fixture && output, 'usage: native-stages.cjs BINARY FIXTURE REPORT');
const manifest = JSON.parse(fs.readFileSync(path.join(fixture, '.rust-install-fixture.json')));
const files = Object.keys(manifest.sources || manifest.files || {}).sort();
assert.ok(files.length, 'fixture must contain source hashes');
const records = files.map((name) => {
  const source = fs.readFileSync(path.join(fixture, name), 'utf8');
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'), (manifest.sources || manifest.files)[name]);
  return { path: path.join(fixture, name), source };
});
const input =
  [
    { version: 1, id: 'disk', files: records.map(({ path }) => ({ path })) },
    { version: 1, id: 'inline', files: records },
  ]
    .map((request) => JSON.stringify(request))
    .join('\n') + '\n';
function run(args) {
  const result = cp.spawnSync(binary, args, { input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return result;
}
const ordinary = run(['--threads', '2']);
const profiled = run(['--threads', '2', '--timings']);
assert.equal(ordinary.stderr, '');
assert.equal(profiled.stdout, ordinary.stdout);
const batches = profiled.stdout.trim().split('\n').map(JSON.parse);
for (const batch of batches) {
  assert.equal(batch.files.length, records.length);
  assert.ok(batch.files.every((result) => result.status === 'ok'));
}
const diagnostics = profiled.stderr.trim().split('\n').map(JSON.parse);
assert.equal(diagnostics.length, 2);
for (const diagnostic of diagnostics) {
  assert.equal(diagnostic.event, 'dependency_scanner_timings');
  assert.equal(diagnostic.files.requested, records.length);
  assert.ok(Object.values(diagnostic.durations).every((ns) => Number.isSafeInteger(ns) && ns >= 0));
}
fs.writeFileSync(
  output,
  JSON.stringify(
    {
      schemaVersion: 1,
      helperSha256: crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex'),
      fixture: manifest,
      threads: 2,
      exactStdoutBytes: true,
      defaultDiagnosticsEmpty: true,
      diagnostics,
      caveat:
        'Single diagnostic sample; summed parallel file durations are not batch critical-path time. Profiling adds overhead and is not a speed benchmark.',
    },
    null,
    2
  ) + '\n'
);
