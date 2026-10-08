#!/usr/bin/env node
// Diagnostic CPU samples are separate from acceptance timings.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
assert.equal(process.argv.length, 5, 'usage: command-profile.cjs <private-cli-root> <native-executable> <output.json>');
const root = path.resolve(process.argv[2]);
const executable = path.resolve(process.argv[3]);
assert.ok([os.tmpdir(), '/tmp'].some((directory) => root.startsWith(directory + path.sep)));
assert.equal(fs.realpathSync(root), root);
const provenance = JSON.parse(fs.readFileSync(path.join(root, '.bit-rust-private-build.json')));
const hash = (value) => createHash('sha256').update(value).digest('hex');
for (const entry of provenance.compiledModules)
  assert.equal(hash(fs.readFileSync(path.join(root, 'node_modules/@teambit', entry.path))), entry.sha256);
const workspace = require('./command-workspace.cjs').commandWorkspace(root, provenance);
const cache = workspace.cache;
assert.equal(fs.realpathSync(path.dirname(cache)), path.dirname(cache));
if (fs.existsSync(cache)) assert.equal(fs.realpathSync(cache), cache);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-command-profile-'));
const original = path.join(temp, 'original');
const warm = path.join(temp, 'warm');
if (fs.existsSync(cache)) fs.cpSync(cache, original, { recursive: true, preserveTimestamps: true });
const report = {
  provenance,
  driverRevision: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname, encoding: 'utf8' }).trim(),
  driverSha256: hash(fs.readFileSync(__filename)),
  fixture: workspace.fixture,
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  cpu: os.cpus()[0].model,
  kernel: os.release(),
  traceSha256: hash(fs.readFileSync(path.join(__dirname, 'command-profile-trace.cjs'))),
  nativeSha256: hash(fs.readFileSync(executable)),
  method:
    'V8 1ms CPU sampling of CLI process; helper CPU excluded; asynchronous stage spans are not critical-path shares',
  workloads: {},
};
function restore(state) {
  fs.rmSync(cache, { recursive: true, force: true });
  if (state === 'warm') fs.cpSync(warm, cache, { recursive: true, preserveTimestamps: true });
}
function run(command, variant, profiled) {
  const env = {
    ...process.env,
    BIT_GLOBALS_DIR: require('./command-workspace.cjs').benchmarkGlobals(temp),
    NODE_COMPILE_CACHE: path.join(temp, 'compile-cache'),
  };
  delete env.BIT_RUST_DEPENDENCY_SCANNER;
  if (variant === 'native') env.BIT_RUST_DEPENDENCY_SCANNER = executable;
  const directory = fs.mkdtempSync(path.join(temp, 'run-'));
  env.BIT_COMMAND_PROFILE_TRACE = path.join(directory, 'source.json');
  env.BIT_COMMAND_BENCH_TRACE = path.join(directory, 'transport.json');
  delete env.BIT_COMMAND_BENCH_TRACE_OWNER;
  const args = profiled
    ? [
        '--cpu-prof',
        '--cpu-prof-interval=1000',
        `--cpu-prof-dir=${directory}`,
        '--require',
        path.join(__dirname, 'command-profile-trace.cjs'),
      ]
    : [];
  const result = cp.spawnSync(process.execPath, [...args, path.join(root, 'bin/bit.js'), command, '--json'], {
    cwd: workspace.root,
    env,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    timeout: 120000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  const value = JSON.parse(result.stdout);
  if (!profiled) return { value };
  const source = JSON.parse(fs.readFileSync(env.BIT_COMMAND_PROFILE_TRACE));
  const transport = JSON.parse(fs.readFileSync(env.BIT_COMMAND_BENCH_TRACE));
  const filename = fs
    .readdirSync(directory)
    .find((file) => file.endsWith('.cpuprofile') && file.includes(`.${source.pid}.`));
  assert.ok(filename, 'CLI CPU profile required');
  const profile = JSON.parse(fs.readFileSync(path.join(directory, filename)));
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parents = new Map();
  for (const node of profile.nodes) for (const child of node.children || []) parents.set(child, node.id);
  const categories = {};
  const functions = new Map();
  let totalSampledUs = 0;
  for (let index = 0; index < profile.samples.length; index++) {
    const id = profile.samples[index];
    const weight = profile.timeDeltas[index];
    totalSampledUs += weight;
    const frames = [];
    let current = id;
    while (current !== undefined) {
      frames.push(nodes.get(current).callFrame);
      current = parents.get(current);
    }
    const urls = frames.map((frame) => frame.url).join('\n');
    let category = 'other';
    if (frames[0].functionName === '(idle)') category = 'idle';
    else if (frames[0].functionName === '(garbage collector)') category = 'garbageCollection';
    else if (/typescript-estree|babel.*parser|acorn|detective-|node-source-walk/.test(urls))
      category = 'legacyParsingAndExtraction';
    else if (/rust-scanner/.test(urls)) category = 'nativeCoordination';
    else if (/filing-cabinet|lookup-typescript|resolve-dependency|dependency-resolver/.test(urls))
      category = 'resolutionAndDependencyPolicy';
    else if (
      frames.some((frame) => /^(?:readFileSync|readSync|statSync|readdirSync|lstatSync)$/.test(frame.functionName))
    )
      category = 'filesystem';
    else if (
      frames.some((frame) =>
        /^(?:compileForInternalLoader|Module\._compile|Module\._load|wrapSafe)$/.test(frame.functionName)
      )
    )
      category = 'moduleLoading';
    categories[category] = (categories[category] || 0) + weight;
    const leaf = frames[0];
    const url = leaf.url.startsWith('file://' + root)
      ? leaf.url.slice(('file://' + root).length + 1)
      : leaf.url.replace(root, '<private-cli>');
    const key = `${leaf.functionName || '<anonymous>'} ${url}:${leaf.lineNumber + 1}`;
    functions.set(key, (functions.get(key) || 0) + weight);
  }
  return {
    value,
    metrics: {
      source,
      transport,
      profile: {
        totalSampledUs,
        categories: Object.fromEntries(
          Object.entries(categories).map(([key, sampledUs]) => [
            key,
            { sampledUs, percent: (sampledUs * 100) / totalSampledUs },
          ])
        ),
        topFunctions: [...functions]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 30)
          .map(([frame, sampledUs]) => ({ frame, sampledUs })),
      },
    },
  };
}
try {
  restore('cold');
  run('status', 'legacy', false);
  fs.cpSync(cache, warm, { recursive: true, preserveTimestamps: true });
  for (const command of ['status', 'graph']) {
    restore('warm');
    const reference = run(command, 'legacy', false).value;
    for (const state of ['cold', 'warm'])
      for (const variant of ['legacy', 'native']) {
        restore(state);
        const { value, metrics } = run(command, variant, true);
        assert.deepEqual(value, reference, `${command}/${state}/${variant}`);
        report.workloads[`${command}-${state}-${variant}`] = metrics;
        fs.writeFileSync(process.argv[4], JSON.stringify(report, null, 2) + '\n');
      }
  }
} finally {
  fs.rmSync(cache, { recursive: true, force: true });
  if (fs.existsSync(original)) fs.cpSync(original, cache, { recursive: true, preserveTimestamps: true });
  fs.rmSync(temp, { recursive: true, force: true });
}
