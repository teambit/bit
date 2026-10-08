#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { createHash } = require('node:crypto');
assert.equal(
  process.argv.length,
  5,
  'usage: command-configuration-benchmark.cjs <private-cli-root> <native-executable> <output.json>'
);
const cliRoot = path.resolve(process.argv[2] || '');
const native = path.resolve(process.argv[3] || '');
const destination = process.argv[4];
assert.ok(
  [os.tmpdir(), '/tmp'].some((directory) => cliRoot.startsWith(directory + path.sep)),
  'requires an owned disposable CLI workspace under tmp'
);
assert.equal(fs.realpathSync(cliRoot), cliRoot, 'workspace must not alias a user checkout');
assert.ok(
  fs.existsSync(path.join(cliRoot, '.bit-rust-private-build.json')),
  'private build provenance marker required'
);
const provenance = JSON.parse(fs.readFileSync(path.join(cliRoot, '.bit-rust-private-build.json')));
for (const module of provenance.compiledModules) {
  const actual = createHash('sha256')
    .update(fs.readFileSync(path.join(cliRoot, 'node_modules/@teambit', module.path)))
    .digest('hex');
  assert.equal(actual, module.sha256, `compiled module changed: ${module.path}`);
}
const cli = path.join(cliRoot, 'bin/bit.js');
assert.equal(
  cp.execFileSync(process.execPath, [cli, '--version'], { cwd: cliRoot, encoding: 'utf8' }).trim(),
  provenance.version
);
const cache = path.join(cliRoot, '.git/bit/cache/components/deps');
assert.equal(fs.realpathSync(path.dirname(cache)), path.dirname(cache), 'owned cache parent cannot contain symlinks');
if (fs.existsSync(cache)) assert.equal(fs.realpathSync(cache), cache, 'cache leaf cannot alias another workspace');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-command-benchmark-'));
const compileCache = path.join(temporary, 'node-compile-cache');
const warmSnapshot = path.join(temporary, 'warm-deps');
const tracer = path.join(__dirname, 'command-invalidation-trace.cjs');
const originalCache = path.join(temporary, 'original-deps');
if (fs.existsSync(cache)) fs.cpSync(cache, originalCache, { recursive: true, preserveTimestamps: true });
const commands = (process.env.BIT_COMMAND_BENCH_MUTATIONS || 'resolved-import,component-policy,tsconfig').split(',');
assert.ok(commands.every((command) => ['resolved-import', 'component-policy', 'tsconfig'].includes(command)));
const report = {
  provenance,
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  cpu: os.cpus()[0].model,
  nativeSha256: createHash('sha256').update(fs.readFileSync(native)).digest('hex'),
  workloads: {},
  parity: 'whole command JSON without normalization',
  memory: 'independent Node/helper peak samples are diagnostic only, not simultaneous process-tree RSS',
};
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
function cacheEntries() {
  return Number(
    cp
      .execFileSync(
        process.execPath,
        ['-e', "require('cacache').ls(process.argv[1]).then(cache=>console.log(Object.keys(cache).length))", cache],
        { cwd: cliRoot, encoding: 'utf8' }
      )
      .trim()
  );
}
function cacheTimes() {
  return JSON.parse(
    cp.execFileSync(
      process.execPath,
      [
        '-e',
        "require('cacache').ls(process.argv[1]).then(cache=>console.log(JSON.stringify(Object.fromEntries(Object.entries(cache).map(([key,value])=>[key,value.time])))))",
        cache,
      ],
      { cwd: cliRoot, encoding: 'utf8' }
    )
  );
}
function execute(command, variant) {
  const beforeTimes = cacheTimes();
  const cacheEntriesBefore = cacheEntries();
  const traceFile = path.join(temporary, 'trace.json');
  fs.rmSync(traceFile, { force: true });
  const env = { ...process.env, NODE_COMPILE_CACHE: compileCache, BIT_COMMAND_BENCH_TRACE: traceFile };
  delete env.BIT_NO_COMPILE_CACHE;
  if (variant === 'native') env.BIT_RUST_DEPENDENCY_SCANNER = native;
  else delete env.BIT_RUST_DEPENDENCY_SCANNER;
  const start = performance.now();
  const run = cp.spawnSync(
    '/usr/bin/time',
    [
      '-f',
      '\nBIT_COMMAND_RESOURCE %U %S %M',
      process.execPath,
      '--require',
      tracer,
      cli,
      ...(Array.isArray(command) ? command : [command]),
      '--json',
    ],
    { cwd: cliRoot, env, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }
  );
  const elapsedMs = performance.now() - start;
  if (run.error) throw run.error;
  assert.equal(run.status, 0, run.stderr);
  const match = run.stderr.match(/BIT_COMMAND_RESOURCE ([\d.]+) ([\d.]+) (\d+)/);
  assert.ok(match, run.stderr);
  const value = JSON.parse(run.stdout);
  const trace = JSON.parse(fs.readFileSync(traceFile, 'utf8'));
  return {
    changedCacheEntries: (() => {
      const afterTimes = cacheTimes();
      return [...new Set([...Object.keys(beforeTimes), ...Object.keys(afterTimes)])].filter(
        (key) => beforeTimes[key] !== afterTimes[key]
      ).length;
    })(),
    cacheEntriesBefore,
    cacheEntriesAfter: cacheEntries(),
    value,
    elapsedMs,
    totalTreeCpuMs: (Number(match[1]) + Number(match[2])) * 1000,
    maxSingleProcessRssKiB: Number(match[3]),
    ...trace,
  };
}
function verify(actual, reference, label) {
  try {
    assert.deepEqual(actual, reference, label);
  } catch (error) {
    const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const firstDifference = (a, b, location = '$') => {
      if (JSON.stringify(a) === JSON.stringify(b)) return undefined;
      if (a && b && typeof a === 'object' && typeof b === 'object') {
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
          const difference = firstDifference(a[key], b[key], `${location}.${key}`);
          if (difference) return difference;
        }
      }
      return { location, actual: a, reference: b };
    };
    let semanticGraphEquality;
    if (
      Array.isArray(actual.nodes) &&
      Array.isArray(actual.edges) &&
      Array.isArray(reference.nodes) &&
      Array.isArray(reference.edges)
    ) {
      const sorted = (value) => ({
        ...value,
        nodes: [...value.nodes].sort(),
        edges: [...value.edges].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      });
      try {
        assert.deepEqual(sorted(actual), sorted(reference));
        semanticGraphEquality = true;
      } catch {
        semanticGraphEquality = false;
      }
    }
    report.blocked = {
      label,
      classification: label.includes('/legacy') ? 'legacy-reference-instability' : 'native-parity-failure',
      actualGraphCounts: { nodes: actual.nodes?.length, edges: actual.edges?.length },
      referenceGraphCounts: { nodes: reference.nodes?.length, edges: reference.edges?.length },
      actualSha256: digest(actual),
      referenceSha256: digest(reference),
      firstDifference: firstDifference(actual, reference),
      semanticGraphEquality,
      note: 'strict equality failed; semantic equality is diagnostic only and does not pass the benchmark gate',
    };
    fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
    throw new Error(`${label}: strict JSON parity failed; diagnostic saved to ${destination}`);
  }
}
function restore(state) {
  fs.rmSync(cache, { recursive: true, force: true });
  if (state === 'warm') fs.cpSync(warmSnapshot, cache, { recursive: true, preserveTimestamps: true });
}
const componentDir = path.join(cliRoot, 'scopes/toolbox/string/capitalize');
const sourceFile = path.join(componentDir, 'index.ts');
const policyFile = path.join(componentDir, 'component.json');
const tsconfigFile = path.join(componentDir, 'tsconfig.json');
const componentPolicy = (policy) => ({
  componentId: { scope: 'teambit.toolbox', name: 'string/capitalize', version: '0.0.518' },
  propagate: true,
  extensions: { 'teambit.dependencies/dependency-resolver': { policy } },
});
const files = [sourceFile, policyFile, tsconfigFile];
const originals = files.map((file) => ({
  file,
  exists: fs.existsSync(file),
  data: fs.existsSync(file) ? fs.readFileSync(file) : undefined,
  stat: fs.existsSync(file) ? fs.statSync(file) : undefined,
}));
const originalDirectoryTimes = fs.statSync(componentDir);
function resetFiles(final = false) {
  for (const { file, exists, data, stat } of originals) {
    if (exists) {
      fs.writeFileSync(file, data);
      fs.utimesSync(file, stat.atime, stat.mtime);
    } else if (final) fs.rmSync(file, { force: true });
  }
  if (!final) {
    fs.writeFileSync(policyFile, JSON.stringify(componentPolicy({})));
    fs.writeFileSync(
      tsconfigFile,
      JSON.stringify({ compilerOptions: { strict: false, baseUrl: '.', paths: { '@alias': ['./capitalize'] } } })
    );
    const old = new Date(originalDirectoryTimes.mtimeMs - 10000);
    fs.utimesSync(policyFile, old, old);
    fs.utimesSync(tsconfigFile, old, old);
  }
  fs.utimesSync(componentDir, originalDirectoryTimes.atime, originalDirectoryTimes.mtime);
}
try {
  // Common initial cache and bytecode priming; these commands are excluded from measurements.
  resetFiles();
  restore('cold');
  execute('status', 'legacy');
  fs.cpSync(cache, warmSnapshot, { recursive: true, preserveTimestamps: true });
  for (const mutation of commands) {
    resetFiles();
    const command = mutation === 'component-policy' ? ['show', 'teambit.toolbox/string/capitalize'] : 'status';
    restore('warm');
    const baseline = execute(command, 'legacy').value;
    const editedFile =
      mutation === 'resolved-import' ? sourceFile : mutation === 'component-policy' ? policyFile : tsconfigFile;
    if (mutation === 'resolved-import') {
      fs.writeFileSync(sourceFile, "export { ellipsis } from '../ellipsis/ellipsis';\n");
      assert.ok(
        fs.existsSync(path.join(componentDir, '../ellipsis/ellipsis.ts')),
        'replacement import must resolve to a real existing file'
      );
    } else if (mutation === 'component-policy') {
      fs.writeFileSync(policyFile, JSON.stringify(componentPolicy({ dependencies: { lodash: '4.17.21' } })));
    } else {
      fs.writeFileSync(
        tsconfigFile,
        JSON.stringify({
          compilerOptions: { strict: true, baseUrl: '.', paths: { '@alias': ['../ellipsis/ellipsis'] } },
        })
      );
    }
    for (const state of ['warm']) {
      restore(state);
      const referenceRun = execute(command, 'legacy');
      assert.ok(
        mutation === 'tsconfig'
          ? referenceRun.dependencyTreeOperations === 0 && referenceRun.changedCacheEntries === 0
          : referenceRun.dependencyTreeOperations >= 1 && referenceRun.changedCacheEntries >= 1,
        'legacy must invalidate expected cached component entries'
      );
      const reference = referenceRun.value;
      restore('cold');
      verify(execute(command, 'legacy').value, reference, `${mutation}/legacy warm vs uncached`);
      if (mutation === 'tsconfig')
        assert.deepEqual(reference, baseline, 'ignored TSconfig does not alter dependency output');
      else assert.notDeepEqual(reference, baseline, 'changed dependency input must change command JSON');
      if (mutation === 'component-policy') {
        const dependencies = reference.find((fragment) => fragment.title === 'dependencies')?.json;
        assert.ok(
          dependencies?.some((dep) => dep.id === 'lodash' && dep.version === '4.17.21'),
          'show must include the new package policy'
        );
      }
      report.proofs ||= {};
      report.proofs[mutation] = {
        warmMatchesUncachedLegacy: true,
        changedBaselineJson: JSON.stringify(reference) !== JSON.stringify(baseline),
        command,
        editedFile: path.relative(cliRoot, editedFile),
        editedSha256: createHash('sha256').update(fs.readFileSync(editedFile)).digest('hex'),
        classification:
          mutation === 'tsconfig'
            ? 'ignored untracked TSconfig; built-in resolver does not consume TS paths'
            : 'component dependency freshness',
        legacyChangedCacheEntries: referenceRun.changedCacheEntries,
        legacyDependencyTreeOperations: referenceRun.dependencyTreeOperations,
      };
      const variants = ['legacy', 'native'];
      for (const variant of variants) {
        restore(state);
        verify(execute(command, variant).value, reference, `${mutation}/${state}/${variant} warmup parity`);
      }
      const runs = [];
      for (let iteration = 0; iteration < 9; iteration++) {
        for (let offset = 0; offset < variants.length; offset++) {
          const variant = variants[(iteration + offset) % variants.length];
          restore(state);
          const result = execute(command, variant);
          assert.ok(
            mutation === 'tsconfig'
              ? result.dependencyTreeOperations === 0 && result.changedCacheEntries === 0
              : result.dependencyTreeOperations >= 1 && result.changedCacheEntries >= 1,
            'each measured run must invalidate expected entries'
          );
          if (variant === 'native') {
            if (mutation === 'tsconfig') {
              assert.equal(result.requests, 0);
              assert.equal(result.helperStarts, 0);
            } else
              assert.ok(result.requests > 0 && result.helperStarts > 0, 'native must actually extract after mutation');
          }
          verify(result.value, reference, `${mutation}/${state}/${variant} parity`);
          const { value, ...metrics } = result;
          runs.push({ iteration, variant, ...metrics });
        }
      }
      const summary = Object.fromEntries(
        variants.map((variant) => {
          const rows = runs.filter((run) => run.variant === variant);
          return [
            variant,
            {
              medianElapsedMs: median(rows.map((row) => row.elapsedMs)),
              minElapsedMs: Math.min(...rows.map((row) => row.elapsedMs)),
              maxElapsedMs: Math.max(...rows.map((row) => row.elapsedMs)),
              medianTreeCpuMs: median(rows.map((row) => row.totalTreeCpuMs)),
              maxNodePlusHelperObservedPeaksKiB: Math.max(
                ...rows.map((row) => row.nodePeakRssKiB + row.helperPeakRssKiB)
              ),
              helperStarts: rows.map((row) => row.helperStarts),
              outcomes: rows[0].outcomes,
              requests: rows[0].requests,
              inlineFiles: rows[0].inlineFiles,
            },
          ];
        })
      );
      report.workloads[mutation] = {
        summary,
        runs,
        referenceSha256: createHash('sha256').update(JSON.stringify(reference)).digest('hex'),
      };
      fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
      console.error(`${mutation}: ${JSON.stringify(summary)}`);
    }
  }
} finally {
  resetFiles(true);
  fs.rmSync(cache, { recursive: true, force: true });
  if (fs.existsSync(originalCache)) fs.cpSync(originalCache, cache, { recursive: true, preserveTimestamps: true });
  fs.rmSync(temporary, { recursive: true, force: true });
}
