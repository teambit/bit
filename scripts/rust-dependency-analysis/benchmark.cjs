#!/usr/bin/env node
// Actual-file extraction experiment, not a Bit command benchmark.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { performance } = require('node:perf_hooks');
const { legacy, compare } = require('./compare.cjs');

function timedSpawn(executable, args, options = {}) {
  const result = spawnSync('/usr/bin/time', ['-f', '\nBIT_BENCH_RESOURCE %U %S %M', executable, ...args], {
    encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  const match = result.stderr.match(/BIT_BENCH_RESOURCE ([\d.]+) ([\d.]+) (\d+)/);
  assert.ok(match, 'GNU time resource record required');
  return { stdout: result.stdout, cpuMs: (Number(match[1]) + Number(match[2])) * 1000, maxSingleProcessRssKiB: Number(match[3]) };
}

function worker(variant, manifestPath, executable, threads) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const uniquePaths = [...new Set(manifest.requests)];
  const expected = new Map(manifest.files.map(file => [file.path, file.expected]));
  const readLegacy = filePath => legacy({ path: filePath, source: fs.readFileSync(filePath, 'utf8') });
  const cpuStart = process.cpuUsage();
  const start = performance.now();
  let results, helper, fallbacks = 0, nativeSuccess = 0;
  if (variant === 'legacy') results = manifest.requests.map(readLegacy);
  else if (variant === 'control') {
    const cache = new Map(uniquePaths.map(filePath => [filePath, readLegacy(filePath)]));
    results = manifest.requests.map(filePath => cache.get(filePath));
  } else {
    helper = timedSpawn(executable, ['--threads', threads], {
      input: JSON.stringify({ version: 1, id: 'benchmark', files: uniquePaths.map(filePath => ({ path: filePath })) }) + '\n',
    });
    const response = JSON.parse(helper.stdout);
    assert.equal(response.id, 'benchmark');
    assert.equal(response.files.length, uniquePaths.length);
    const cache = new Map();
    for (let index = 0; index < uniquePaths.length; index++) {
      const filePath = uniquePaths[index], outcome = response.files[index];
      assert.equal(outcome.path, filePath);
      if (outcome.status === 'unsupported') { fallbacks++; cache.set(filePath, readLegacy(filePath)); }
      else { nativeSuccess++; cache.set(filePath, outcome); }
    }
    results = manifest.requests.map(filePath => cache.get(filePath));
  }
  const elapsedMs = performance.now() - start;
  const cpu = process.cpuUsage(cpuStart);
  // Correctness is checked for every run, outside the internal extraction timer.
  for (let index = 0; index < results.length; index++) {
    try { compare(expected.get(manifest.requests[index]), results[index]); }
    catch (error) { throw new Error(`${manifest.requests[index]}: ${error.message}`); }
  }
  console.log(JSON.stringify({ variant, extractionElapsedMs: elapsedMs, nodeCpuMs: (cpu.user + cpu.system) / 1000,
    nodePeakRssKiB: process.resourceUsage().maxRSS, helperCpuMs: helper?.cpuMs || 0,
    helperPeakRssKiB: helper?.maxSingleProcessRssKiB || 0, fallbacks, nativeSuccess,
    readsAndParses: variant === 'legacy' ? manifest.requests.length : variant === 'control' ? uniquePaths.length : uniquePaths.length + fallbacks }));
}

function median(values) { return [...values].sort((a,b) => a-b)[Math.floor(values.length / 2)]; }
function main() {
  const root = path.resolve(__dirname, '../..');
  const executable = path.resolve(process.argv[2] || path.join(root, 'native/target/release/bit-dependency-scanner'));
  const output = process.argv[3];
  const threads = process.env.BIT_BENCH_THREADS || '4';
  const candidates = execFileSync('git', ['ls-files', 'scopes/dependencies', 'scopes/workspace', 'components/legacy/consumer-component'], { cwd: root, encoding: 'utf8' })
    .trim().split('\n').filter(file => /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file)).sort();
  const count = Math.min(240, candidates.length);
  const selected = Array.from({ length: count }, (_, i) => candidates[Math.floor(i * candidates.length / count)]);
  const files = selected.map(relative => {
    const filePath = path.join(root, relative), source = fs.readFileSync(filePath, 'utf8');
    const expected = legacy({ path: filePath, source });
    assert.equal(expected.status, 'ok', `representative corpus must parse: ${relative}`);
    return { path: filePath, relative, bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex'), expected };
  });
  // Preflight reports exact fallback files and rejects drift before timing variants.
  const preflight = JSON.parse(timedSpawn(executable, ['--threads', threads], {
    input: JSON.stringify({ version: 1, id: 'preflight', files: files.map(file => ({ path: file.path })) }) + '\n',
  }).stdout);
  assert.equal(preflight.files.length, files.length);
  const fallbackPaths = [];
  for (let index = 0; index < files.length; index++) {
    const outcome = preflight.files[index];
    assert.equal(outcome.path, files[index].path);
    if (outcome.status === 'unsupported') fallbackPaths.push(files[index].relative);
    else compare(files[index].expected, outcome);
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-extraction-bench-'));
  const load = createRequire(path.join(process.env.BIT_LEGACY_ROOT || root, 'package.json'));
  const version = (requireFrom, name) => requireFrom(`${name}/package.json`).version;
  const detectorLoad = createRequire(fs.realpathSync(load.resolve('@teambit/typescript.deps-detectors.detective-typescript')));
  // The packages compare.cjs loads from the legacy root, plus the TS detective's own parser.
  const packageVersions = Object.fromEntries([
    ...['@teambit/node.deps-detectors.detective-es6', '@teambit/typescript.deps-detectors.detective-typescript', 'module-definition', 'node-source-walk'].map(name => [name, version(load, name)]),
    ['@typescript-eslint/typescript-estree', version(detectorLoad, '@typescript-eslint/typescript-estree')],
  ]);
  // Paths are recorded relative to the checkout so results carry no machine-specific locations.
  const report = { fallbackPaths, packageVersions, executableSha256: createHash('sha256').update(fs.readFileSync(executable)).digest('hex'), revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    // rust-toolchain.toml applies only inside native/, where the release build runs.
    node: process.version, rust: execFileSync('rustc', ['--version'], { cwd: path.join(root, 'native'), encoding: 'utf8' }).trim(), platform: `${os.platform()}/${os.arch()}`, cpu: os.cpus()[0].model,
    logicalCpus: os.cpus().length, threads: Number(threads), executable: path.relative(root, executable), externalLegacyRoot: Boolean(process.env.BIT_LEGACY_ROOT),
    files: files.map(({ expected, path: _absolute, ...file }) => file), uniqueSourceBytes: files.reduce((n,file) => n + file.bytes, 0), workloads: {} };
  try {
    for (const [workload, repeats] of [['unique', 1], ['duplicate-3x', 3]]) {
      const manifestPath = path.join(temp, `${workload}.json`);
      const requests = Array.from({ length: repeats }, () => files.map(file => file.path)).flat();
      fs.writeFileSync(manifestPath, JSON.stringify({ files, requests }));
      const runs = [];
      const variants = ['legacy', 'control', 'rust'];
      const execute = (variant, iteration, warmup) => {
        const start = performance.now();
        const timed = timedSpawn(process.execPath, [__filename, '--worker', variant, manifestPath, executable, threads]);
        const endToEndElapsedMs = performance.now() - start;
        const result = JSON.parse(timed.stdout);
        if (!warmup) runs.push({ iteration, ...result, endToEndElapsedMs, totalTreeCpuMs: timed.cpuMs,
          maxSingleProcessRssKiB: timed.maxSingleProcessRssKiB,
          summedPeakRssUpperBoundKiB: result.nodePeakRssKiB + result.helperPeakRssKiB });
      };
      for (const variant of variants) execute(variant, -1, true);
      // Rotating order balances deterministic order effects; nine runs per variant.
      for (let iteration = 0; iteration < 9; iteration++) {
        for (let offset = 0; offset < 3; offset++) execute(variants[(iteration + offset) % 3], iteration, false);
      }
      const summaries = Object.fromEntries(variants.map(variant => {
        const subset = runs.filter(run => run.variant === variant);
        return [variant, { medianExtractionMs: median(subset.map(run => run.extractionElapsedMs)),
          medianEndToEndMs: median(subset.map(run => run.endToEndElapsedMs)),
          minEndToEndMs: Math.min(...subset.map(run => run.endToEndElapsedMs)), maxEndToEndMs: Math.max(...subset.map(run => run.endToEndElapsedMs)),
          medianTotalTreeCpuMs: median(subset.map(run => run.totalTreeCpuMs)),
          maxSummedPeakRssUpperBoundKiB: Math.max(...subset.map(run => run.summedPeakRssUpperBoundKiB)),
          fallbackFiles: subset[0].fallbacks, nativeSuccessFiles: subset[0].nativeSuccess }];
      }));
      report.workloads[workload] = { requests: requests.length, summaries, runs };
      console.error(`${workload}: ${JSON.stringify(summaries)}`);
    }
    const serialized = JSON.stringify(report, null, 2) + '\n';
    if (output) fs.writeFileSync(output, serialized); else console.log(serialized);
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}
if (process.argv[2] === '--worker') worker(...process.argv.slice(3)); else main();
