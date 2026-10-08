#!/usr/bin/env node
// Final source-bound refresh of an already tar-extracted private Bit bundle.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
assert.equal(
  process.argv.length,
  7,
  'usage: packaged-final-proof.cjs <owned-extracted-cli> <owned-fixture> <fresh-helper-archive> <report.json> <precinct-adapter-commit>'
);
const [cli, workspace, archive, reportPath] = process.argv.slice(2, 6).map((arg) => path.resolve(arg));
const adapter = process.argv[6];
assert.match(adapter, /^[a-f0-9]{9,40}$/);
const root = path.resolve(__dirname, '../..');
for (const directory of [cli, workspace]) {
  assert.equal(fs.realpathSync(directory), directory);
  assert.ok(
    directory.startsWith(os.tmpdir() + path.sep + 'bit-packaged-cli-proof-'),
    'only an owned package-proof copy may be refreshed'
  );
}
const hash = (data) => createHash('sha256').update(data).digest('hex');
const precinctRelative = 'scopes/dependencies/dependencies/files-dependency-builder/precinct/index.ts';
const precinct = cp.execFileSync('git', ['show', adapter + ':' + precinctRelative], { cwd: root });
const report = {
  acceptance: false,
  node: process.version,
  runtimeRevision: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  adapterRevision: cp.execFileSync('git', ['rev-parse', adapter], { cwd: root, encoding: 'utf8' }).trim(),
  adapterSourceSha256: hash(precinct),
  archiveSha256: hash(fs.readFileSync(archive)),
  priorEvidence:
    'packaged-cli-proof-results.json: actual whole bundle tar/extraction; this refresh deliberately does not repeat tar creation',
  runs: [],
};
function command(args, cwd, extra = {}) {
  const result = cp.spawnSync(process.execPath, [path.join(cli, 'bin/bit.js'), ...args], {
    cwd,
    env: { ...process.env, BIT_RUST_DEPENDENCY_SCANNER: 'off', ...extra },
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(result.status, 0, (result.stderr || '').slice(-6000));
  return result.stdout;
}
try {
  fs.cpSync(path.join(root, 'scopes/dependencies/dependencies'), path.join(cli, 'scopes/dependencies/dependencies'), {
    recursive: true,
  });
  fs.writeFileSync(path.join(cli, precinctRelative), precinct);
  const compile = JSON.parse(command(['compile', 'dependencies', '--json', '--safe-mode'], cli));
  assert.equal(compile.length, 1);
  assert.deepEqual(compile[0].errors, []);
  report.compile = {
    component: compile[0].component,
    outputCount: compile[0].buildResults.length,
    errors: compile[0].errors,
  };
  cp.execFileSync(process.env.PYTHON || 'python3', [
    path.join(__dirname, 'artifacts/install-helper.py'),
    'assemble',
    '--distribution',
    cli,
    '--archive',
    archive,
    '--target',
    'x86_64-unknown-linux-gnu',
  ]);
  const moduleDirectory = path.join(
    cli,
    'node_modules/@teambit/dependencies/dist/files-dependency-builder/rust-scanner'
  );
  const selected = JSON.parse(fs.readFileSync(path.join(moduleDirectory, 'packaged/current.json')));
  const helper = path.join(
    moduleDirectory,
    'packaged',
    selected.version,
    selected.target,
    selected.revision,
    'bit-dependency-scanner'
  );
  report.packagedBuild = JSON.parse(fs.readFileSync(path.join(moduleDirectory, 'packaged-build.json')));
  report.helperSha256 = hash(fs.readFileSync(helper));
  report.manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(helper), 'manifest.json')));
  report.version = command(['--version'], cli).trim();
  const tracer = path.join(__dirname, 'packaged-cli-trace.cjs');
  for (const syntax of [false, true]) {
    const broken = path.join(workspace, 'source-0/broken.ts');
    if (syntax) fs.writeFileSync(broken, 'const value: = 1;\n');
    let reference;
    try {
      for (const mode of ['off', 'packaged']) {
        for (const cache of ['.bit/cache/components/deps', '.git/bit/cache/components/deps'])
          fs.rmSync(path.join(workspace, cache), { recursive: true, force: true });
        const tracePath = path.join(workspace, '.packaged-final-trace.json');
        fs.rmSync(tracePath, { force: true });
        const result = JSON.parse(
          command(['status', '--json'], workspace, {
            BIT_RUST_DEPENDENCY_SCANNER: mode,
            NODE_OPTIONS: '--require=' + tracer,
            BIT_PACKAGED_EXPECTED_EXECUTABLE: helper,
            BIT_PACKAGED_TRACE: tracePath,
            BIT_PACKAGED_TRACE_OWNER: undefined,
          })
        );
        const trace = JSON.parse(fs.readFileSync(tracePath));
        if (mode === 'off') {
          reference = result;
          assert.equal(trace.helperStarts, 0);
        } else {
          assert.deepEqual(result, reference);
          assert.ok(trace.helperStarts > 0);
          if (syntax) assert.ok(trace.outcomes.parse_error > 0);
        }
        report.runs.push({
          workload: syntax ? 'malformed-typescript' : 'valid-sources',
          mode,
          exactJsonParity: mode === 'packaged',
          fullJsonSha256: hash(Buffer.from(JSON.stringify(result))),
          trace,
        });
      }
    } finally {
      if (syntax) fs.rmSync(broken, { force: true });
    }
  }
  report.acceptance = true;
} finally {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ report: reportPath, acceptance: report.acceptance }));
}
