#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const cp = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const installedRoot = process.env.BIT_LEGACY_ROOT || root;
const installed = Module.createRequire(path.join(installedRoot, 'package.json'));
const ts = installed('typescript');
require.extensions['.ts'] = (target, filename) => {
  target.paths = [...Module._nodeModulePaths(installedRoot), ...target.paths];
  target._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText,
    filename
  );
};
const sourceRoot = process.env.BIT_SCANNER_INTEGRATION_ROOT || root;
const builder = path.join(sourceRoot, 'scopes/dependencies/dependencies/files-dependency-builder');
const generateTree = require(path.join(builder, 'generate-tree-madge.ts')).default;
const { RustDependencyScannerSession } = require(path.join(builder, 'rust-scanner/session.ts'));
const { DetectorHook } = installed('@teambit/dependency-resolver');
const clockTicks = Number(cp.execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());
assert.ok(Number.isFinite(clockTicks) && clockTicks > 0);
const hash = (buffer) => createHash('sha256').update(buffer).digest('hex');
// Reports are committed, so record directories relative to this checkout and never as host paths.
const location = (directory) => {
  const relative = path.relative(root, directory);
  if (!relative) return '.';
  return relative.startsWith('..') || path.isAbsolute(relative) ? '<external checkout>' : relative;
};
function comparable(result) {
  return {
    ...result,
    errors: Object.fromEntries(Object.entries(result.errors).map(([file, error]) => [file, { code: error.code }])),
  };
}
async function worker(variant, manifestPath, workload, executable) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const { dataset, entries, smallGroups, edit } = manifest;
  if (workload.startsWith('edit')) fs.writeFileSync(edit.path, edit.original);
  const hookMode = workload.includes('hook');
  DetectorHook.hooks = hookMode
    ? [
        {
          isSupported: () => false,
          detect: () => {
            throw Error('nonmatching hook invoked');
          },
        },
      ]
    : [];
  const config = { baseDir: dataset, detectiveOptions: {}, envDetectors: [], visited: {} };
  if (variant !== 'legacy') process.env.BIT_RUST_DEPENDENCY_SCANNER = executable;
  else delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
  const stats = {
    helperStarts: 0,
    pathOutcomes: {},
    inlineOutcomes: {},
    nativeUnavailable: 0,
    fallbackPaths: [],
    sessions: 0,
  };
  const helpers = [],
    closures = [];
  const oldSpawn = cp.spawn;
  cp.spawn = function (command, args, options) {
    const child = oldSpawn.apply(this, arguments);
    if (command !== executable) return child;
    stats.helperStarts++;
    const helper = { child, pid: child.pid, peakRssKiB: 0, sampledCpuMs: 0 };
    helpers.push(helper);
    closures.push(new Promise((resolve) => child.once('close', resolve)));
    return child;
  };
  for (const [method, key] of [
    ['get', 'pathOutcomes'],
    ['scanSource', 'inlineOutcomes'],
  ]) {
    const original = RustDependencyScannerSession.prototype[method];
    RustDependencyScannerSession.prototype[method] =
      method === 'get'
        ? function (...args) {
            const result = original.apply(this, args);
            if (result) {
              stats[key][result.status] = (stats[key][result.status] || 0) + 1;
              if (result.status !== 'ok') stats.fallbackPaths.push(path.relative(dataset, result.path));
            } else stats.nativeUnavailable++;
            return result;
          }
        : async function (...args) {
            const result = await original.apply(this, args);
            if (result) {
              stats[key][result.status] = (stats[key][result.status] || 0) + 1;
              if (result.status !== 'ok') stats.fallbackPaths.push(path.relative(dataset, result.path));
            } else stats.nativeUnavailable++;
            return result;
          };
  }
  const dispose = RustDependencyScannerSession.prototype.dispose;
  RustDependencyScannerSession.prototype.dispose = function (...args) {
    stats.sessions++;
    for (const helper of helpers) {
      try {
        const status = fs.readFileSync(`/proc/${helper.pid}/status`, 'utf8');
        helper.peakRssKiB = Number(status.match(/^VmHWM:\s+(\d+)/m)?.[1] || helper.peakRssKiB);
        const fields = fs
          .readFileSync(`/proc/${helper.pid}/stat`, 'utf8')
          .slice(fs.readFileSync(`/proc/${helper.pid}/stat`, 'utf8').lastIndexOf(')') + 2)
          .split(' ');
        helper.sampledCpuMs = ((Number(fields[11]) + Number(fields[12])) * 1000) / clockTicks;
      } catch {
        /* already-exited helpers have no proc record */
      }
    }
    const result = dispose.apply(this, args);
    // Production deliberately unrefs idle helpers; instrumentation waits for real cleanup.
    for (const helper of helpers) if (helper.child.exitCode === null) helper.child.ref();
    return result;
  };
  const runUnscoped = () =>
    workload.startsWith('small')
      ? Promise.all([]).then(async () => {
          const results = [];
          for (const group of smallGroups)
            results.push(comparable(await generateTree(group, { ...config, visited: {} })));
          return results;
        })
      : generateTree(entries, config).then((result) => [comparable(result)]);
  const run =
    variant === 'pooled'
      ? () => require(path.join(builder, 'rust-scanner/scope.ts')).withRustDependencyScannerScope(runUnscoped)
      : runUnscoped;
  if (workload.startsWith('warm') || workload.startsWith('edit')) {
    await run();
    await Promise.all(closures);
    closures.length = 0;
    stats.helperStarts = 0;
    stats.sessions = 0;
    stats.pathOutcomes = {};
    stats.inlineOutcomes = {};
    stats.nativeUnavailable = 0;
    stats.fallbackPaths = [];
    helpers.length = 0;
  }
  if (workload.startsWith('edit')) {
    fs.writeFileSync(edit.path, edit.original + edit.append);
    config.visited = {};
  }
  if (workload === 'config-options') config.detectiveOptions = { ts: { comment: true } };
  const cpuStart = process.cpuUsage(),
    start = performance.now();
  const results = await run();
  await Promise.all(closures);
  const elapsedMs = performance.now() - start,
    cpu = process.cpuUsage(cpuStart);
  const helperResources = helpers.map(({ pid, peakRssKiB, sampledCpuMs }) => ({ pid, peakRssKiB, sampledCpuMs }));
  assert.deepEqual(results, manifest.expected[workload], `${workload}: final graph/pathMap/missing/error parity`);
  console.log(
    JSON.stringify({
      workload,
      variant,
      elapsedMs,
      nodeCpuMs: (cpu.user + cpu.system) / 1000,
      nodePeakRssKiB: process.resourceUsage().maxRSS,
      ...stats,
      helperResources,
      sampledHelperCpuMs: helperResources.reduce((n, h) => n + h.sampledCpuMs, 0),
      nodePlusLargestHelperPeakRssUpperBoundKiB:
        process.resourceUsage().maxRSS + Math.max(0, ...helperResources.map((h) => h.peakRssKiB)),
    })
  );
}
function median(values) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}
async function main() {
  const executable = path.resolve(process.argv[2] || path.join(root, 'native/target/release/bit-dependency-scanner'));
  const destination = process.argv[3];
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-integrated-benchmark-'));
  const dataset = path.join(temporary, 'dataset');
  fs.mkdirSync(dataset);
  const paths = cp
    .execFileSync(
      'git',
      ['ls-files', 'scopes/dependencies', 'scopes/workspace', 'components/legacy/consumer-component'],
      { cwd: root, encoding: 'utf8' }
    )
    .trim()
    .split('\n');
  const files = paths.filter((file) => fs.statSync(path.join(root, file)).isFile());
  for (const file of files) {
    const destination = path.join(dataset, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, file), destination);
  }
  fs.symlinkSync(path.join(installedRoot, 'node_modules'), path.join(dataset, 'node_modules'), 'dir');
  const production = files.filter(
    (file) =>
      /\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(file) && !/(fixtures|\.spec\.|\.test\.|\.composition|\.mock)/.test(file)
  );
  const entryCount = Math.min(96, production.length);
  const entries = Array.from({ length: entryCount }, (_, i) =>
    path.join(dataset, production[Math.floor((i * production.length) / entryCount)])
  );
  const bitmap = installed('comment-json').parse(fs.readFileSync(path.join(root, '.bitmap'), 'utf8'));
  const smallGroups = Object.values(bitmap)
    .filter(
      (component) =>
        component.rootDir &&
        (component.rootDir.startsWith('scopes/dependencies/') || component.rootDir.startsWith('scopes/workspace/'))
    )
    .map((component) => production.filter((file) => file.startsWith(component.rootDir + '/')))
    .filter((group) => group.length > 0 && group.length <= 6)
    .slice(0, 12)
    .map((group) => group.map((file) => path.join(dataset, file)));
  assert.ok(smallGroups.length >= 8, `only ${smallGroups.length} small components available`);
  const workloads = process.env.BIT_BENCH_WORKLOADS?.split(',') || [
    'large-pure',
    'large-hook',
    'small-pure',
    'small-hook',
    'warm-pure',
    'warm-hook',
    'config-options',
    'edit-pure',
    'edit-hook',
  ];
  const variants = process.env.BIT_BENCH_VARIANTS?.split(',') || ['legacy', 'native'];
  const edit = {
    path: entries.find((file) => file.endsWith('.ts')),
    append: "\nimport './__bit_benchmark_changed_dependency__';\n",
  };
  edit.original = fs.readFileSync(edit.path, 'utf8');
  const expected = {};
  for (const workload of workloads) {
    DetectorHook.hooks = workload.includes('hook') ? [{ isSupported: () => false, detect: () => [] }] : [];
    const config = {
      baseDir: dataset,
      detectiveOptions: workload === 'config-options' ? { ts: { comment: true } } : {},
      envDetectors: [],
      visited: {},
    };
    delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
    const run = async () =>
      workload.startsWith('small')
        ? Promise.all([]).then(async () => {
            const results = [];
            for (const group of smallGroups)
              results.push(comparable(await generateTree(group, { ...config, visited: {} })));
            return results;
          })
        : [comparable(await generateTree(entries, config))];
    if (workload.startsWith('warm') || workload.startsWith('edit')) await run();
    if (workload.startsWith('edit')) {
      fs.writeFileSync(edit.path, edit.original + edit.append);
      config.visited = {};
    }
    expected[workload] = await run();
    if (workload.startsWith('edit')) fs.writeFileSync(edit.path, edit.original);
  }
  const manifestPath = path.join(temporary, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ dataset, entries, smallGroups, edit, expected }));
  const sourceFiles = [
    'generate-tree-madge.ts',
    'precinct/index.ts',
    'dependency-tree/index.ts',
    'dependency-tree/Config.ts',
    'rust-scanner/session.ts',
    'rust-scanner/types.ts',
    'rust-scanner/protocol.ts',
    'rust-scanner/scope.ts',
  ]
    .filter((file) => fs.existsSync(path.join(builder, file)))
    .map((file) => ({
      path: file,
      bytes: fs.statSync(path.join(builder, file)).size,
      sha256: hash(fs.readFileSync(path.join(builder, file))),
    }));
  const report = {
    edit: { path: path.relative(dataset, edit.path), append: edit.append },
    clockTicks,
    sourceFiles,
    sourceWorktreeStatus: cp
      .execFileSync('git', ['status', '--porcelain'], { cwd: sourceRoot, encoding: 'utf8' })
      .trim(),
    sourceRoot: location(sourceRoot),
    sourceRevision: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim(),
    revision: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    node: process.version,
    rust: cp.execFileSync('rustc', ['--version'], { encoding: 'utf8' }).trim(),
    cpu: os.cpus()[0].model,
    logicalCpus: os.cpus().length,
    executableSha256: hash(fs.readFileSync(executable)),
    installedRoot: location(installedRoot),
    files: production.map((file) => ({
      path: file,
      bytes: fs.statSync(path.join(root, file)).size,
      sha256: hash(fs.readFileSync(path.join(root, file))),
    })),
    entryFiles: entries.map((file) => path.relative(dataset, file)),
    smallComponents: smallGroups.map((group) => group.map((file) => path.relative(dataset, file))),
    workloads: {},
  };
  try {
    for (const workload of workloads) {
      const runs = [];
      const execute = (variant, iteration) => {
        const start = performance.now();
        const child = cp.spawnSync(
          '/usr/bin/time',
          [
            '-f',
            '\nBIT_TREE_RESOURCE %U %S %M',
            process.execPath,
            __filename,
            '--worker',
            variant,
            manifestPath,
            workload,
            executable,
          ],
          { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }
        );
        const processElapsedMs = performance.now() - start;
        if (child.error) throw child.error;
        assert.equal(child.status, 0, child.stderr);
        const match = child.stderr.match(/BIT_TREE_RESOURCE ([\d.]+) ([\d.]+) (\d+)/);
        assert.ok(match, child.stderr);
        if (iteration >= 0)
          runs.push({
            ...JSON.parse(child.stdout),
            iteration,
            processElapsedMs,
            totalTreeCpuMs: (Number(match[1]) + Number(match[2])) * 1000,
            maxSingleProcessRssKiB: Number(match[3]),
          });
      };
      for (const variant of variants) execute(variant, -1);
      for (let iteration = 0; iteration < 9; iteration++)
        for (let offset = 0; offset < variants.length; offset++)
          execute(variants[(iteration + offset) % variants.length], iteration);
      const summary = Object.fromEntries(
        variants.map((variant) => {
          const list = runs.filter((run) => run.variant === variant);
          return [
            variant,
            {
              medianPipelineMs: median(list.map((run) => run.elapsedMs)),
              medianProcessMs: median(list.map((run) => run.processElapsedMs)),
              minPipelineMs: Math.min(...list.map((run) => run.elapsedMs)),
              maxPipelineMs: Math.max(...list.map((run) => run.elapsedMs)),
              medianTreeCpuMs: median(list.map((run) => run.totalTreeCpuMs)),
              helperStarts: list[0].helperStarts,
              sessions: list[0].sessions,
              pathOutcomes: list[0].pathOutcomes,
              inlineOutcomes: list[0].inlineOutcomes,
              nativeUnavailable: list[0].nativeUnavailable,
              fallbackPaths: list[0].fallbackPaths,
              maxNodePlusLargestHelperPeakRssUpperBoundKiB: Math.max(
                ...list.map((run) => run.nodePlusLargestHelperPeakRssUpperBoundKiB)
              ),
            },
          ];
        })
      );
      report.workloads[workload] = {
        summary,
        runs,
        graphs: expected[workload].map((result) => ({
          files: Object.keys(result.madgeTree).length,
          missingFiles: Object.keys(result.skipped).length,
          errorFiles: Object.keys(result.errors).length,
        })),
      };
      console.error(`${workload}: ${JSON.stringify(summary)}`);
    }
    const json = JSON.stringify(report, null, 2) + '\n';
    if (destination) fs.writeFileSync(destination, json);
    else console.log(json);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
if (process.argv[2] === '--worker')
  worker(...process.argv.slice(3)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
else
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
