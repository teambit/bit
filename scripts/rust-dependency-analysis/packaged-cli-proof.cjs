#!/usr/bin/env node
// Physical private copy, standard compilation, whole bundle tar/extraction and actual command parity.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
assert.equal(
  process.argv.length,
  8,
  'usage: packaged-cli-proof.cjs <trusted-private-cli> <trusted-helper-archive> <fixture> <report.json> <precinct-overlay-commit> <second-real-helper-archive>'
);
const [source, archive, fixture, reportPath] = process.argv.slice(2, 6).map((arg) => path.resolve(arg));
const overlay = process.argv[6];
const secondArchive = path.resolve(process.argv[7]);
assert.match(overlay, /^[a-f0-9]{9,40}$/);
const root = path.resolve(__dirname, '../..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fileHash(filename) {
  const digest = createHash('sha256');
  const descriptor = fs.openSync(filename, 'r');
  const buffer = Buffer.alloc(1024 * 1024);
  try {
    let size;
    while ((size = fs.readSync(descriptor, buffer)) > 0) digest.update(buffer.subarray(0, size));
  } finally {
    fs.closeSync(descriptor);
  }
  return digest.digest('hex');
}
for (const directory of [source, fixture]) {
  assert.ok(
    [os.tmpdir(), '/tmp'].some((temporary) => directory.startsWith(temporary + path.sep)),
    'input must be private tmp copy'
  );
  assert.equal(fs.realpathSync(directory), directory);
}
const provenance = JSON.parse(fs.readFileSync(path.join(source, '.bit-rust-private-build.json')));
for (const entry of provenance.compiledModules)
  assert.equal(hash(fs.readFileSync(path.join(source, 'node_modules/@teambit', entry.path))), entry.sha256);
const resume = process.env.BIT_PACKAGED_PROOF_RESUME;
const temporary = resume ? fs.realpathSync(resume) : fs.mkdtempSync(path.join(os.tmpdir(), 'bit-packaged-cli-proof-'));
assert.ok(temporary.startsWith(os.tmpdir() + path.sep + 'bit-packaged-cli-proof-'));
if (resume) {
  const prior = JSON.parse(fs.readFileSync(reportPath));
  assert.equal(prior.sourceProvenance.revision, provenance.revision);
  assert.ok(prior.bundleSha256 && prior.version === provenance.version);
}
const build = path.join(temporary, 'Bit bundle');
const extractedRoot = path.join(temporary, 'extracted');
const extracted = path.join(extractedRoot, 'Bit bundle');
const workspace = path.join(temporary, 'workspace');
const python = process.env.PYTHON || 'python3';
const installer = path.join(__dirname, 'artifacts/install-helper.py');
const tracer = path.join(__dirname, 'packaged-cli-trace.cjs');
const report = {
  schemaVersion: 1,
  acceptance: false,
  node: process.version,
  sourceProvenance: provenance,
  packagingRevision: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  precinctOverlayRevision: cp.execFileSync('git', ['rev-parse', overlay], { cwd: root, encoding: 'utf8' }).trim(),
  helperArchiveSha256: hash(fs.readFileSync(archive)),
  runs: [],
};
function clone(from, to, dependencyRoot) {
  fs.mkdirSync(to);
  cp.execFileSync('cp', ['-a', '--reflink=auto', from + path.sep + '.', to]);
  return portable(to, from, dependencyRoot);
}
function portable(directory, previous, dependencyRoot) {
  let links = 0;
  const paths = [];
  function visit(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const filename = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) {
        const link = fs.readlinkSync(filename);
        const target = path.resolve(path.dirname(filename), link);
        const mapped = target.startsWith(previous + path.sep)
          ? directory + target.slice(previous.length)
          : dependencyRoot && target.startsWith(source + path.sep)
            ? dependencyRoot + target.slice(source.length)
            : target;
        if (
          !mapped.startsWith(directory + path.sep) &&
          !(dependencyRoot && mapped.startsWith(dependencyRoot + path.sep))
        ) {
          if (!fs.existsSync(filename)) {
            fs.unlinkSync(filename);
            continue;
          }
          throw new Error('live external symlink refused: ' + filename);
        }
        fs.unlinkSync(filename);
        fs.symlinkSync(path.relative(path.dirname(filename), mapped), filename);
        paths.push(filename);
        links++;
      } else if (entry.isDirectory()) visit(filename);
    }
  }
  visit(directory);
  for (const filename of paths) {
    try {
      const resolved = fs.realpathSync(filename);
      assert.ok(
        resolved.startsWith(directory + path.sep) || (dependencyRoot && resolved.startsWith(dependencyRoot + path.sep)),
        'resolved external link'
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return links;
}
function command(cli, args, destination, cwd, extra = {}) {
  const result = cp.spawnSync(process.execPath, [path.join(cli, 'bin/bit.js'), ...args], {
    cwd,
    env: { ...process.env, BIT_RUST_DEPENDENCY_SCANNER: 'off', ...extra },
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (destination) fs.writeFileSync(destination, result.stdout || '');
  assert.equal(result.status, 0, `command ${args.join(' ')} failed: ${(result.stderr || '').slice(-6000)}`);
  return result.stdout;
}
try {
  if (!resume) {
    report.portableBuildLinks = clone(source, build);
    const relative = 'scopes/dependencies/dependencies';
    fs.cpSync(path.join(root, relative), path.join(build, relative), { recursive: true });
    const precinct = relative + '/files-dependency-builder/precinct/index.ts';
    fs.writeFileSync(
      path.join(build, precinct),
      cp.execFileSync('git', ['show', overlay + ':' + precinct], { cwd: root })
    );
    const compile = JSON.parse(
      command(build, ['compile', 'dependencies', '--json', '--safe-mode'], path.join(temporary, 'compile.json'), build)
    );
    assert.equal(compile.length, 1);
    assert.deepEqual(compile[0].errors, []);
    report.compile = {
      component: compile[0].component,
      errors: compile[0].errors,
      outputCount: compile[0].buildResults.length,
      resultSha256: hash(Buffer.from(JSON.stringify(compile))),
    };
    cp.execFileSync(
      python,
      [installer, 'assemble', '--distribution', build, '--archive', archive, '--target', 'x86_64-unknown-linux-gnu'],
      { stdio: 'pipe' }
    );
    // Compilation links newly discovered source files; make those links portable before archiving.
    report.portableCompiledLinks = portable(build, build);
    const bundle = path.join(temporary, 'Bit-distribution.tar');
    cp.execFileSync('tar', ['-cf', bundle, '-C', temporary, path.basename(build)]);
    fs.mkdirSync(extractedRoot);
    cp.execFileSync('tar', ['-xf', bundle, '-C', extractedRoot]);
    report.bundleSha256 = fileHash(bundle);
    report.portableExtractedLinks = portable(extracted, extracted);
    report.version = command(extracted, ['--version'], undefined, extracted).trim();
    assert.equal(report.version, provenance.version);
  } else {
    Object.assign(report, JSON.parse(fs.readFileSync(reportPath)));
    report.setupResumed = true;
    report.runs = [];
    assert.equal(fileHash(path.join(temporary, 'Bit-distribution.tar')), report.bundleSha256);
    assert.equal(command(extracted, ['--version'], undefined, extracted).trim(), provenance.version);
  }
  fs.rmSync(workspace, { recursive: true, force: true });
  report.fixtureLinks = clone(fixture, workspace, extracted);
  const moduleDirectory = path.join(
    extracted,
    'node_modules/@teambit/dependencies/dist/files-dependency-builder/rust-scanner'
  );
  const contract = JSON.parse(fs.readFileSync(path.join(moduleDirectory, 'packaged-build.json')));
  const selection = JSON.parse(fs.readFileSync(path.join(moduleDirectory, 'packaged/current.json')));
  const installed = path.join(moduleDirectory, 'packaged', selection.version, selection.target, selection.revision);
  const executable = path.join(installed, 'bit-dependency-scanner');
  report.packagedBuild = contract;
  report.helperSha256 = hash(fs.readFileSync(executable));
  const references = new Map();
  function execute(mode, args) {
    // Clear only the disposable fixture's dependency cache; no user/shared cache is touched.
    fs.rmSync(path.join(workspace, '.bit/cache/components/deps'), { recursive: true, force: true });
    fs.rmSync(path.join(workspace, '.git/bit/cache/components/deps'), { recursive: true, force: true });
    const tracePath = path.join(temporary, 'trace.json');
    fs.rmSync(tracePath, { force: true });
    const raw = command(extracted, args, undefined, workspace, {
      BIT_RUST_DEPENDENCY_SCANNER: mode === 'off' ? 'off' : 'packaged',
      NODE_OPTIONS: `--require=${tracer}`,
      BIT_PACKAGED_EXPECTED_EXECUTABLE: executable,
      BIT_PACKAGED_TRACE: tracePath,
      BIT_PACKAGED_TRACE_OWNER: undefined,
    });
    const result = JSON.parse(raw);
    const trace = JSON.parse(fs.readFileSync(tracePath));
    const key = args.join(' ');
    if (mode === 'off') references.set(key, result);
    else assert.deepEqual(result, references.get(key), `${mode} full JSON differs for ${key}`);
    if (mode === 'packaged' || mode === 'rollback') {
      assert.ok(trace.helperStarts > 0);
      assert.ok(trace.submittedFiles > 0);
    } else assert.equal(trace.helperStarts, 0);
    report.runs.push({
      mode,
      command: args,
      fullJsonSha256: hash(Buffer.from(JSON.stringify(result))),
      exactJsonParity: mode !== 'off',
      trace,
    });
  }
  const commands = [
    ['status', '--json'],
    ['graph', '--json'],
  ];
  for (const args of commands) {
    execute('off', args);
    execute('packaged', args);
  }
  const binary = fs.readFileSync(executable);
  fs.appendFileSync(executable, 'corrupt');
  for (const args of commands) execute('corrupt', args);
  fs.writeFileSync(executable, binary);
  const moved = installed + '-missing';
  fs.renameSync(installed, moved);
  for (const args of commands) execute('missing', args);
  fs.renameSync(moved, installed);
  // Two real packages from distinct commits with the same scanner source permit validated rollback.
  const rolledRevision = selection.revision;
  cp.execFileSync(python, [installer, 'install', '--module-directory', moduleDirectory, '--archive', secondArchive]);
  const activatedRevision = JSON.parse(fs.readFileSync(path.join(moduleDirectory, 'packaged/current.json'))).revision;
  assert.notEqual(activatedRevision, rolledRevision, 'rollback requires two distinct real packaged revisions');
  report.secondHelperArchiveSha256 = fileHash(secondArchive);
  report.rollbackRevisions = { activated: activatedRevision, restored: rolledRevision };
  cp.execFileSync(python, [installer, 'rollback', '--module-directory', moduleDirectory]);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(moduleDirectory, 'packaged/current.json'))).revision,
    rolledRevision
  );
  for (const args of commands) execute('rollback', args);
  report.acceptance = true;
  report.limitations = [
    'Linux x64 GNU real Bit bundle smoke; other targets covered by separate real native archive CI.',
    'One correctness run per command/mode; these are not timing or memory measurements.',
    'Diagnostic adapter overlay is explicit and recorded; production default stays legacy.',
  ];
} finally {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  // Preserve the disposable extracted bundle and command evidence for review; caller may remove this directory afterwards.
  console.log(
    JSON.stringify({ report: reportPath, privateEvidenceDirectory: temporary, acceptance: report.acceptance })
  );
}
