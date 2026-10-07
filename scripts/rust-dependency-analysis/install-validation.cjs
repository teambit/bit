#!/usr/bin/env node
// Linux-only, real CLI install validation in a kernel-isolated network namespace.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
assert.equal(
  [5, 7].includes(process.argv.length),
  true,
  'usage: install-validation.cjs <trusted-private-cli> <native-executable> <report.json> [--legacy-umbrella /existing/package]'
);
assert.equal(process.platform, 'linux', 'network namespace validation requires Linux');
const source = path.resolve(process.argv[2]);
const native = path.resolve(process.argv[3]);
const destination = path.resolve(process.argv[4]);
if (process.argv.length === 7) assert.equal(process.argv[5], '--legacy-umbrella');
const legacyUmbrella = process.argv[6] ? fs.realpathSync(process.argv[6]) : undefined;
const marker = '.bit-rust-private-build.json';
assert.ok(
  [os.tmpdir(), '/tmp'].some((root) => source.startsWith(root + path.sep)),
  'trusted CLI must be a private tmp build'
);
assert.equal(fs.realpathSync(source), source, 'CLI cannot alias a user checkout');
const provenance = JSON.parse(fs.readFileSync(path.join(source, marker)));
const hash = (data) => createHash('sha256').update(data).digest('hex');
for (const module of provenance.compiledModules)
  assert.equal(hash(fs.readFileSync(path.join(source, 'node_modules/@teambit', module.path))), module.sha256);
const probe = cp.spawnSync('unshare', ['-Urn', 'true'], { encoding: 'utf8' });
assert.equal(probe.status, 0, 'host must support unshare -Urn; no weaker offline substitution is accepted');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-install-validation-'));
const baseline = path.join(temporary, 'baseline');
const workspace = path.join(temporary, 'workspace');
const compileCache = path.join(temporary, 'node-compile-cache');
const tracer = path.join(__dirname, 'install-trace.cjs');
const command = ['install', '--lockfile-only', '--skip-import', '--skip-compile', '--skip-write-config-files'];
const report = {
  provenance,
  nativeSha256: hash(fs.readFileSync(native)),
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  networkIsolation: 'unshare -Urn: child and descendants have no external network interface',
  command,
  sourceChange:
    'append identical nonfunctional comment to scopes/dependencies/dependencies/files-dependency-builder/generate-tree-madge.ts to attempt invalidating model dependency reuse',
  startingState: 'each variant receives a physical/reflink copy of the same baseline with cold dependency cache',
  legacyUmbrella: legacyUmbrella
    ? {
        // Reports are committed: never record the host's home directory.
        source: legacyUmbrella.replace(os.homedir(), '~'),
        version: JSON.parse(fs.readFileSync(path.join(legacyUmbrella, 'package.json'))).version,
        files: {},
      }
    : undefined,
  runs: [],
  acceptance: false,
};

function clone(from, to) {
  fs.mkdirSync(to);
  cp.execFileSync('cp', ['-a', '--reflink=auto', `${from}${path.sep}.`, to]);
  const links = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        links.push(filename);
        const link = fs.readlinkSync(filename);
        if (link.startsWith(from + path.sep)) {
          fs.unlinkSync(filename);
          fs.symlinkSync(to + link.slice(from.length), filename);
        }
      } else if (entry.isDirectory()) visit(filename);
    }
  }
  visit(to);
  for (const filename of links) {
    let resolved;
    try {
      resolved = fs.realpathSync(filename);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const target = path.resolve(path.dirname(filename), fs.readlinkSync(filename));
      if (!target.startsWith(to + path.sep)) fs.unlinkSync(filename);
      continue;
    }
    assert.ok(resolved.startsWith(to + path.sep), `live external symlink: ${filename}`);
  }
}

async function cacheResults() {
  const load = createRequire(path.join(workspace, 'package.json'));
  const cacache = load('cacache');
  const cache = path.join(workspace, '.git/bit/cache/components/deps');
  const entries = await cacache.ls(cache);
  const results = {};
  for (const key of Object.keys(entries).sort())
    results[key] = JSON.parse((await cacache.get(cache, key)).data.toString());
  return results;
}

async function execute(variant) {
  fs.rmSync(workspace, { recursive: true, force: true });
  clone(baseline, workspace);
  fs.appendFileSync(
    path.join(workspace, '.npmrc'),
    `\nstore-dir=${path.join(workspace, '.install-validation-store')}\ncache-dir=${path.join(workspace, '.install-validation-cache')}\nenable-global-virtual-store=false\nfetch-retries=0\nfetch-timeout=3000\n`
  );
  fs.appendFileSync(
    path.join(workspace, 'pnpm-workspace.yaml'),
    `\nstoreDir: ${JSON.stringify(path.join(workspace, '.install-validation-store'))}\ncacheDir: ${JSON.stringify(path.join(workspace, '.install-validation-cache'))}\nenableGlobalVirtualStore: false\nfetchRetries: 0\nfetchTimeout: 3000\n`
  );
  const editedSource = path.join(
    workspace,
    'scopes/dependencies/dependencies/files-dependency-builder/generate-tree-madge.ts'
  );
  fs.appendFileSync(editedSource, '\n// Isolated install validation: change source bytes without changing imports.\n');
  fs.rmSync(path.join(workspace, '.git/bit/cache/components/deps'), { recursive: true, force: true });
  assert.equal(Object.keys(await cacheResults()).length, 0, 'owned dependency cache must be cold');
  const trace = path.join(temporary, `${variant}-helper.json`);
  const installTrace = path.join(temporary, `${variant}-install.json`);
  const env = {
    ...process.env,
    NODE_COMPILE_CACHE: compileCache,
    BIT_ENABLE_GLOBAL_VIRTUAL_STORE: 'false',
    BIT_COMMAND_BENCH_TRACE: trace,
    BIT_INSTALL_VALIDATION_TRACE: installTrace,
    npm_config_store_dir: path.join(workspace, '.install-validation-store'),
    npm_config_cache_dir: path.join(workspace, '.install-validation-cache'),
    BIT_INSTALL_VALIDATION_ROOT: workspace,
    npm_config_fetch_retries: '0',
    npm_config_fetch_timeout: '3000',
  };
  if (variant === 'native') env.BIT_RUST_DEPENDENCY_SCANNER = native;
  else delete env.BIT_RUST_DEPENDENCY_SCANNER;
  const run = cp.spawnSync(
    'unshare',
    ['-Urn', process.execPath, '--require', tracer, path.join(workspace, 'bin/bit.js'), ...command],
    {
      cwd: workspace,
      env,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 32 * 1024 * 1024,
    }
  );
  const helper = fs.existsSync(trace) ? JSON.parse(fs.readFileSync(trace)) : undefined;
  const observed = fs.existsSync(installTrace)
    ? JSON.parse(fs.readFileSync(installTrace))
    : { calls: [], treeCalls: 0 };
  const packageManagerCalls = observed.calls;
  const dependencies = await cacheResults();
  const lockfile = path.join(workspace, 'pnpm-lock.yaml');
  return {
    variant,
    cacheEntriesBefore: 0,
    status: run.status,
    signal: run.signal,
    timedOut: run.error?.code === 'ETIMEDOUT',
    helper,
    treeCalls: observed.treeCalls,
    packageManagerCalls,
    dependencies,
    lockfileSha256: fs.existsSync(lockfile) ? hash(fs.readFileSync(lockfile)) : undefined,
    failureOutput: run.status === 0 ? undefined : `${run.stderr || ''}\n${run.stdout || ''}`.slice(0, 64 * 1024),
  };
}

(async () => {
  try {
    clone(source, baseline);
    if (legacyUmbrella) {
      const installed = path.join(baseline, 'node_modules/@teambit/legacy');
      fs.rmSync(installed, { recursive: true, force: true });
      clone(legacyUmbrella, installed);
      function record(directory) {
        for (const entry of fs
          .readdirSync(directory, { withFileTypes: true })
          .sort((a, b) => a.name.localeCompare(b.name))) {
          const filename = path.join(directory, entry.name);
          if (entry.isDirectory()) record(filename);
          else if (entry.isFile())
            report.legacyUmbrella.files[path.relative(installed, filename)] = hash(fs.readFileSync(filename));
          else if (entry.isSymbolicLink())
            report.legacyUmbrella.files[path.relative(installed, filename)] = `symlink:${fs.readlinkSync(filename)}`;
          else throw new Error(`unsupported umbrella member: ${filename}`);
        }
      }
      record(installed);
    }
    const legacy = await execute('legacy');
    report.runs.push(legacy);
    const nativeResult = await execute('native');
    report.runs.push(nativeResult);
    report.successfulInstall = legacy.status === 0 && nativeResult.status === 0;
    report.actualNativeRequests = Boolean(nativeResult.helper?.requests > 0 && nativeResult.helper?.outcomes?.ok > 0);
    report.actualLockfileOnlyEngineCalls =
      legacy.packageManagerCalls.length > 0 &&
      nativeResult.packageManagerCalls.length > 0 &&
      [...legacy.packageManagerCalls, ...nativeResult.packageManagerCalls].every((call) => call.lockfileOnly === true);
    report.dependencyCacheParity = isDeepStrictEqual(legacy.dependencies, nativeResult.dependencies);
    report.packageManagerInputParity = isDeepStrictEqual(legacy.packageManagerCalls, nativeResult.packageManagerCalls);
    report.lockfileParity = legacy.lockfileSha256 === nativeResult.lockfileSha256;
    report.acceptance =
      report.successfulInstall &&
      report.actualNativeRequests &&
      report.actualLockfileOnlyEngineCalls &&
      report.dependencyCacheParity &&
      report.packageManagerInputParity &&
      report.lockfileParity;
    report.timings = 'none: correctness/native participation gate must pass before timing this workload';
    fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
    if (!report.acceptance) process.exitCode = 1;
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
