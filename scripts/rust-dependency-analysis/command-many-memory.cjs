#!/usr/bin/env node
// Run only against a disposable current-source CLI made by command-build.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const { createProcessTreeMemorySampler } = require('./process-tree-memory.cjs');
const { createBenchmarkProcessControl } = require('./process-tree-memory-control.cjs');

assert.equal(process.platform, 'linux', 'simultaneous process RSS measurement requires Linux procfs');
assert.equal(
  process.argv.length,
  5,
  'usage: command-many-memory.cjs <private-cli-root> <native-executable> <output.json>'
);
const cliRoot = path.resolve(process.argv[2]);
const native = path.resolve(process.argv[3]);
const destination = path.resolve(process.argv[4]);
assert.ok([os.tmpdir(), '/tmp'].some((directory) => cliRoot.startsWith(directory + path.sep)));
assert.equal(fs.realpathSync(cliRoot), cliRoot, 'private workspace cannot alias a user checkout');
const provenance = JSON.parse(fs.readFileSync(path.join(cliRoot, '.bit-rust-private-build.json')));
const hash = (data) => createHash('sha256').update(data).digest('hex');
for (const module of provenance.compiledModules) {
  assert.equal(hash(fs.readFileSync(path.join(cliRoot, 'node_modules/@teambit', module.path))), module.sha256);
}
const cli = path.join(cliRoot, 'bin/bit.js');
assert.equal(
  cp.execFileSync(process.execPath, [cli, '--version'], { cwd: cliRoot, encoding: 'utf8' }).trim(),
  provenance.version
);
const cache = path.join(cliRoot, '.git/bit/cache/components/deps');
assert.equal(fs.realpathSync(path.dirname(cache)), path.dirname(cache));
if (fs.existsSync(cache)) assert.equal(fs.realpathSync(cache), cache, 'cache leaf cannot be a symlink');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-command-memory-'));
const original = path.join(temporary, 'original');
const warm = path.join(temporary, 'warm');
if (fs.existsSync(cache)) fs.cpSync(cache, original, { recursive: true, preserveTimestamps: true });
const installed = require('node:module').createRequire(path.join(cliRoot, 'package.json'));
const bitmap = installed('typescript').parseConfigFileTextToJson(
  '.bitmap',
  fs.readFileSync(path.join(cliRoot, '.bitmap'), 'utf8')
);
assert.equal(bitmap.error, undefined);
const sources = Object.values(bitmap.config)
  .filter(
    (entry) =>
      entry &&
      typeof entry === 'object' &&
      entry.rootDir?.startsWith('scopes/toolbox/') &&
      fs.existsSync(path.join(cliRoot, entry.rootDir, 'index.ts'))
  )
  .map((entry) => path.join(entry.rootDir, 'index.ts'))
  .sort()
  .slice(0, 16);
assert.equal(sources.length, 16);
const originals = sources.map((name) => ({
  name,
  bytes: fs.readFileSync(path.join(cliRoot, name)),
  stat: fs.statSync(path.join(cliRoot, name)),
}));
const directories = [...new Set(sources.map((name) => path.dirname(name)))].map((name) => ({
  name,
  stat: fs.statSync(path.join(cliRoot, name)),
}));
const markers = sources.map((name) => `bit-rust-many-memory-${hash(name).slice(0, 12)}`);
const adapterSource = path.join(cliRoot, 'scopes/dependencies/dependencies/files-dependency-builder/precinct/index.ts');
const adapterCompiled = path.join(
  cliRoot,
  'node_modules/@teambit/dependencies/dist/files-dependency-builder/precinct/index.js'
);
const report = {
  diagnosticOverlay: {
    sourceSha256: hash(fs.readFileSync(adapterSource)),
    compiledSha256: hash(fs.readFileSync(adapterCompiled)),
  },
  provenance,
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  cpu: os.cpus()[0].model,
  logicalCpus: os.cpus().length,
  kernel: os.release(),
  nativeSha256: hash(fs.readFileSync(native)),
  method:
    'near-simultaneous sampled RSS sum, including GNU time wrapper and observed command descendants; driver excluded',
  sampleIntervalMs: 20,
  caveats: [
    'shared pages are counted for each process',
    'short-lived processes and between-sample peaks can be missed',
    'OS and private V8 compile caches are warm',
  ],
  workloads: {},
};
function restore(state) {
  fs.rmSync(cache, { recursive: true, force: true });
  if (state === 'warm') fs.cpSync(warm, cache, { recursive: true, preserveTimestamps: true });
}
function cacheEntries() {
  return Number(
    cp
      .execFileSync(
        process.execPath,
        ['-e', "require('cacache').ls(process.argv[1]).then(cache => console.log(Object.keys(cache).length))", cache],
        { cwd: cliRoot, encoding: 'utf8' }
      )
      .trim()
  );
}
let activeControl;
let interrupted = false;
function interrupt() {
  interrupted = true;
  activeControl?.terminate(new Error('memory benchmark interrupted'));
}
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
async function execute(variant) {
  if (interrupted) throw new Error('memory benchmark interrupted');
  const cacheEntriesBefore = cacheEntries();
  const traceFile = path.join(temporary, 'trace.json');
  fs.rmSync(traceFile, { force: true });
  const env = {
    ...process.env,
    NODE_COMPILE_CACHE: path.join(temporary, 'compile-cache'),
    BIT_COMMAND_BENCH_TRACE: traceFile,
  };
  delete env.BIT_NO_COMPILE_CACHE;
  if (variant === 'native') env.BIT_RUST_DEPENDENCY_SCANNER = native;
  else delete env.BIT_RUST_DEPENDENCY_SCANNER;
  const started = performance.now();
  const child = cp.spawn(
    '/usr/bin/time',
    [
      '-f',
      '\nBIT_MEMORY_RESOURCE %U %S %M',
      process.execPath,
      '--require',
      path.join(__dirname, 'command-invalidation-trace.cjs'),
      cli,
      'status',
      '--json',
    ],
    { cwd: cliRoot, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const control = createBenchmarkProcessControl(child);
  activeControl = control;
  let stdout = '';
  let stderr = '';
  let outputBytes = 0;
  let outputError;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  function collect(stream, chunk) {
    outputBytes += Buffer.byteLength(chunk);
    if (outputBytes > 128 * 1024 * 1024) {
      outputError = new Error('command output exceeds benchmark limit');
      control.terminate(outputError);
      return;
    }
    if (stream === 'stdout') stdout += chunk;
    else stderr += chunk;
  }
  child.stdout.on('data', (chunk) => collect('stdout', chunk));
  child.stderr.on('data', (chunk) => collect('stderr', chunk));
  const closing = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  let sampler;
  try {
    if (!child.pid) await closing;
    sampler = createProcessTreeMemorySampler(child.pid);
    sampler.start();
    const result = await closing;
    const memory = sampler.stop();
    if (control.failure) throw control.failure;
    if (interrupted) throw new Error('memory benchmark interrupted');
    if (outputError) throw outputError;
    assert.equal(result.code, 0, stderr);
    assert.equal(memory.failedProcReads, 0, 'unreadable or malformed procfs data cannot pass memory validation');
    assert.equal(memory.racedProcessReads, 0, 'process identity changed during memory measurement');
    const elapsedMs = performance.now() - started;
    const resources = stderr.match(/BIT_MEMORY_RESOURCE ([\d.]+) ([\d.]+) (\d+)/);
    assert.ok(resources, stderr);
    const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
    return {
      value: JSON.parse(stdout),
      cacheEntriesBefore,
      cacheEntriesAfter: cacheEntries(),
      elapsedMs,
      totalTreeCpuMs: (Number(resources[1]) + Number(resources[2])) * 1000,
      maxIndividualProcessRssKiB: Number(resources[3]),
      ...trace,
      memory,
    };
  } catch (error) {
    control.terminate(error);
    try {
      await closing;
    } catch {}
    throw error;
  } finally {
    sampler?.stop();
    control.dispose();
    activeControl = undefined;
  }
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
async function main() {
  try {
    restore('cold');
    const reference = (await execute('legacy')).value;
    fs.cpSync(cache, warm, { recursive: true, preserveTimestamps: true });
    for (const [index, original] of originals.entries()) {
      fs.writeFileSync(path.join(cliRoot, original.name), `import '${markers[index]}';\n` + original.bytes.toString());
    }
    restore('warm');
    const edited = (await execute('legacy')).value;
    assert.notDeepEqual(edited, reference);
    for (const marker of markers) assert.ok(JSON.stringify(edited).includes(marker));
    restore('cold');
    assert.deepEqual((await execute('legacy')).value, edited, 'uncached legacy freshness proof');
    restore('warm');
    assert.deepEqual((await execute('native')).value, edited, 'native warmup whole JSON parity');
    {
      const runs = [];
      for (let iteration = 0; iteration < 9; iteration++) {
        for (const variant of iteration % 2 ? ['native', 'legacy'] : ['legacy', 'native']) {
          restore('warm');
          const { value, ...metrics } = await execute(variant);
          assert.deepEqual(value, edited, `${variant} complete JSON parity`);
          for (const source of sources)
            assert.ok(metrics.dependencyTreeEntryFiles.includes(source), `missing analysis ${source}`);
          assert.ok(metrics.dependencyTreeOperations >= 16);
          if (variant === 'native') assert.ok(metrics.helperStarts > 0);
          runs.push({ iteration, variant, ...metrics });
        }
      }
      const summary = Object.fromEntries(
        ['legacy', 'native'].map((variant) => {
          const rows = runs.filter((run) => run.variant === variant);
          return [
            variant,
            {
              medianElapsedMs: median(rows.map((run) => run.elapsedMs)),
              medianHelperStarts: median(rows.map((run) => run.helperStarts)),
              maxConcurrentHelpers: Math.max(...rows.map((run) => run.maxConcurrentHelpers)),
              medianPeakSampledRssKiB: median(rows.map((run) => run.memory.peakSampledRssKiB)),
              minPeakSampledRssKiB: Math.min(...rows.map((run) => run.memory.peakSampledRssKiB)),
              maxPeakSampledRssKiB: Math.max(...rows.map((run) => run.memory.peakSampledRssKiB)),
              maxConcurrentProcesses: Math.max(...rows.map((run) => run.memory.maxConcurrentProcesses)),
              failedProcReads: rows.reduce((sum, run) => sum + run.memory.failedProcReads, 0),
            },
          ];
        })
      );
      report.workloads['many16'] = {
        summary,
        sources,
        markers,
        referenceSha256: hash(JSON.stringify(edited)),
        memoryGate: {
          maxMedianRatio: 1.1,
          passes: summary.native.medianPeakSampledRssKiB / summary.legacy.medianPeakSampledRssKiB <= 1.1,
          actualMedianRatio: summary.native.medianPeakSampledRssKiB / summary.legacy.medianPeakSampledRssKiB,
        },
        runs,
      };
      fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
      console.error(`many16: ${JSON.stringify(summary)}`);
    }
  } finally {
    for (const original of originals) {
      const filename = path.join(cliRoot, original.name);
      fs.writeFileSync(filename, original.bytes);
      fs.utimesSync(filename, original.stat.atime, original.stat.mtime);
    }
    for (const original of directories)
      fs.utimesSync(path.join(cliRoot, original.name), original.stat.atime, original.stat.mtime);
    fs.rmSync(cache, { recursive: true, force: true });
    if (fs.existsSync(original)) fs.cpSync(original, cache, { recursive: true, preserveTimestamps: true });
    fs.rmSync(temporary, { recursive: true, force: true });
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
