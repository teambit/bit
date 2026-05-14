#!/usr/bin/env node
// Bench harness for RFC "ESM Migration with Lazy-Loaded Aspects" — Slice 1.
// See docs/rfc-esm-lazy-aspects.md §8 and §10.
//
// Measures:
//   A. Wallclock for 6 startup scenarios (cold + warm).
//   B. Per-aspect isolated-import time — each *.main.runtime.js required in a
//      fresh Node process, repeated, so we can attribute marginal cost
//      without sibling-thread smear (see §11.3 finding #5).
//
// Run:   node scripts/bench-startup.mjs [--iters=5] [--json] [--no-warm] [--no-aspects]
//        [--bit=<path>] [--small-ws=<path>] [--large-ws=<path>]
// Env:   BIT_BENCH_SMALL_WS, BIT_BENCH_LARGE_WS — fixture workspace paths.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const repoRequire = createRequire(join(REPO_ROOT, 'package.json'));

const args = parseArgs(process.argv.slice(2));
const ITERS = Number(args.iters ?? 5);
const WARMUPS = 2;
const ASPECT_ITERS = Number(args['aspect-iters'] ?? 5);
const BIT_BIN = resolve(args.bit ?? join(REPO_ROOT, 'bin', 'bit.js'));
const SMALL_WS = args['small-ws'] ?? process.env.BIT_BENCH_SMALL_WS;
const LARGE_WS = args['large-ws'] ?? process.env.BIT_BENCH_LARGE_WS;
const DO_WARM = !args['no-warm'];
const DO_ASPECTS = !args['no-aspects'];
const JSON_OUT = !!args.json;

if (!existsSync(BIT_BIN)) {
  console.error(`bit binary not found at ${BIT_BIN}`);
  process.exit(1);
}

const NO_WS_DIR = mkdtempSync(join(tmpdir(), 'bit-bench-no-ws-'));
process.on('exit', () => {
  try { rmSync(NO_WS_DIR, { recursive: true, force: true }); } catch {}
});

const scenarios = [
  { name: 'bit --version',        argv: ['--version'],     cwd: NO_WS_DIR },
  { name: 'bit --help',           argv: ['--help'],        cwd: NO_WS_DIR },
  { name: 'bit <typo>',           argv: ['zzz-typo-cmd'],  cwd: NO_WS_DIR },
  { name: 'bit status (no ws)',   argv: ['status'],        cwd: NO_WS_DIR },
];
if (SMALL_WS) {
  if (existsSync(SMALL_WS)) scenarios.push({ name: 'bit status (small ws)', argv: ['status'], cwd: resolve(SMALL_WS) });
  else console.error(`warning: --small-ws path not found: ${SMALL_WS}`);
}
if (LARGE_WS) {
  if (existsSync(LARGE_WS)) scenarios.push({ name: 'bit status (large ws)', argv: ['status'], cwd: resolve(LARGE_WS) });
  else console.error(`warning: --large-ws path not found: ${LARGE_WS}`);
}

const report = {
  meta: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    bitBin: BIT_BIN,
    iters: ITERS,
    warmups: WARMUPS,
    aspectIters: ASPECT_ITERS,
    smallWs: SMALL_WS ?? null,
    largeWs: LARGE_WS ?? null,
    timestamp: new Date().toISOString(),
  },
  scenarios: [],
  aspects: [],
  aspectsMeta: null,
};

if (!JSON_OUT) {
  console.log(`bench-startup.mjs  —  node ${process.version}  ${process.platform}/${process.arch}`);
  console.log(`bit binary: ${BIT_BIN}`);
  console.log(`iters=${ITERS} aspect-iters=${ASPECT_ITERS} warmups=${WARMUPS}`);
  console.log('');
}

for (const sc of scenarios) {
  if (!JSON_OUT) process.stdout.write(`measuring: ${sc.name}  ... `);
  const cold = await runIterations(sc, ITERS, /*useCache*/ false);
  const warm = DO_WARM ? await runWarm(sc, WARMUPS, ITERS) : null;
  report.scenarios.push({ name: sc.name, argv: sc.argv, cwd: sc.cwd, cold, warm });
  if (!JSON_OUT) console.log('done');
}

if (DO_ASPECTS) {
  const aspectPkgs = listAspectPackages();
  const targets = [];
  for (const pkg of aspectPkgs) {
    const runtimeFile = findMainRuntimeFile(pkg);
    if (runtimeFile) targets.push({ pkg, runtimeFile });
  }
  report.aspectsMeta = { packages: aspectPkgs.length, withRuntime: targets.length };
  if (!JSON_OUT) console.log(`\nper-aspect isolated import (${targets.length} aspects, n=${ASPECT_ITERS} each)`);
  let idx = 0;
  for (const t of targets) {
    idx += 1;
    if (!JSON_OUT) process.stdout.write(`  [${idx}/${targets.length}] ${t.pkg}  ... `);
    const samples = [];
    for (let i = 0; i < ASPECT_ITERS; i++) {
      const ms = await measureModuleImport(t.runtimeFile);
      if (typeof ms === 'number') samples.push(ms);
    }
    const stats = summarize(samples);
    report.aspects.push({ pkg: t.pkg, runtimeFile: t.runtimeFile, samples, ...stats });
    if (!JSON_OUT) console.log(stats.n > 0 ? `min=${stats.min.toFixed(1)}ms p50=${stats.p50.toFixed(1)}ms` : 'FAILED');
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printHumanReport(report);
}

// ── helpers ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq === -1) out[a.slice(2)] = true;
    else out[a.slice(2, eq)] = a.slice(eq + 1);
  }
  return out;
}

async function runIterations(sc, n, useCache, cacheDir) {
  const samples = [];
  let exits = [];
  for (let i = 0; i < n; i++) {
    const r = await runOnce(sc, useCache, cacheDir);
    samples.push(r.ms);
    exits.push(r.exitCode);
  }
  return { ...summarize(samples), samples, exits };
}

async function runWarm(sc, warmups, n) {
  const cacheDir = mkdtempSync(join(tmpdir(), 'bit-bench-cache-'));
  try {
    for (let i = 0; i < warmups; i++) await runOnce(sc, true, cacheDir);
    return await runIterations(sc, n, true, cacheDir);
  } finally {
    try { rmSync(cacheDir, { recursive: true, force: true }); } catch {}
  }
}

function runOnce(sc, useCache, cacheDir) {
  return new Promise((resolveP) => {
    const env = { ...process.env };
    delete env.NODE_OPTIONS; // strip parent NODE_OPTIONS to keep timing comparable
    if (useCache && cacheDir) env.NODE_COMPILE_CACHE = cacheDir;
    else delete env.NODE_COMPILE_CACHE;
    const t0 = process.hrtime.bigint();
    const child = spawn(process.execPath, [BIT_BIN, ...sc.argv], {
      cwd: sc.cwd,
      env,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    child.on('exit', (code) => {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      resolveP({ ms, exitCode: code });
    });
    child.on('error', (err) => {
      resolveP({ ms: NaN, exitCode: -1, error: err.message });
    });
  });
}

function listAspectPackages() {
  const manifestsPath = require_resolve('@teambit/bit/dist/manifests.js');
  if (!manifestsPath || !existsSync(manifestsPath)) {
    console.error(`could not locate @teambit/bit/dist/manifests.js (${manifestsPath})`);
    return [];
  }
  const src = readFileSync(manifestsPath, 'utf8');
  const re = /require\("(@teambit\/[^"]+)"\)/g;
  const set = new Set();
  for (const m of src.matchAll(re)) set.add(m[1]);
  set.delete('@teambit/harmony'); // not an aspect; framework
  return [...set].sort();
}

function findMainRuntimeFile(pkg) {
  const pkgRoot = packageRoot(pkg);
  if (!pkgRoot) return null;
  const dist = join(pkgRoot, 'dist');
  if (!existsSync(dist)) return null;
  const entries = readdirSync(dist);
  const candidates = entries.filter((f) => f.endsWith('.main.runtime.js'));
  if (candidates.length === 0) return null;
  // If multiple, prefer the one whose basename matches the package's last segment.
  const last = pkg.split('/').pop();
  const preferred = candidates.find((f) => f.startsWith(`${last}.`));
  return join(dist, preferred ?? candidates[0]);
}

function packageRoot(pkg) {
  // Some @teambit packages have an "exports" map that catches `./*` → `./*.ts`,
  // which breaks `require.resolve('<pkg>/package.json')`. So resolve the main
  // entry instead, then walk up until we find the package.json.
  const main = require_resolve(pkg);
  if (!main) return null;
  let dir = dirname(main);
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function require_resolve(spec) {
  try { return repoRequire.resolve(spec); } catch { return null; }
}

function measureModuleImport(modPath) {
  // Spawn a fresh Node process that times require(modPath) and prints the ms.
  const code = `
    const t0 = process.hrtime.bigint();
    try {
      require(${JSON.stringify(modPath)});
    } catch (e) {
      process.stderr.write('IMPORT_ERR: ' + (e && e.message ? e.message : String(e)));
      process.exit(2);
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    process.stdout.write(ms.toFixed(3));
  `;
  return new Promise((resolveP) => {
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    delete env.NODE_COMPILE_CACHE;
    const child = spawn(process.execPath, ['-e', code], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.on('exit', () => {
      const v = Number(out);
      resolveP(Number.isFinite(v) ? v : null);
    });
    child.on('error', () => resolveP(null));
  });
}

function summarize(samples) {
  const xs = samples.filter((x) => Number.isFinite(x)).slice().sort((a, b) => a - b);
  const n = xs.length;
  if (n === 0) return { n: 0, min: NaN, p50: NaN, p95: NaN, mean: NaN, max: NaN };
  const min = xs[0];
  const max = xs[n - 1];
  const p50 = percentile(xs, 0.50);
  const p95 = percentile(xs, 0.95);
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  return { n, min, p50, p95, mean, max };
}

function percentile(sortedXs, p) {
  const n = sortedXs.length;
  if (n === 0) return NaN;
  if (n === 1) return sortedXs[0];
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedXs[lo];
  return sortedXs[lo] + (sortedXs[hi] - sortedXs[lo]) * (idx - lo);
}

function printHumanReport(rep) {
  console.log('\n══════════════════ Wallclock scenarios ══════════════════');
  const header = ['scenario', 'cold min', 'cold p50', 'cold mean', 'warm min', 'warm p50', 'warm mean'];
  const rows = rep.scenarios.map((s) => [
    s.name,
    fmt(s.cold.min), fmt(s.cold.p50), fmt(s.cold.mean),
    s.warm ? fmt(s.warm.min) : '—',
    s.warm ? fmt(s.warm.p50) : '—',
    s.warm ? fmt(s.warm.mean) : '—',
  ]);
  printTable(header, rows);

  if (rep.aspects.length > 0) {
    console.log(`\n══════════════════ Per-aspect isolated import (n=${rep.meta.aspectIters}) ══════════════════`);
    const sorted = [...rep.aspects].sort((a, b) => (b.min ?? 0) - (a.min ?? 0));
    const aHeader = ['aspect package', 'min (ms)', 'p50 (ms)', 'mean (ms)', 'max (ms)', 'n'];
    const aRows = sorted.map((a) => [
      a.pkg,
      a.n ? a.min.toFixed(1) : 'FAIL',
      a.n ? a.p50.toFixed(1) : '—',
      a.n ? a.mean.toFixed(1) : '—',
      a.n ? a.max.toFixed(1) : '—',
      String(a.n),
    ]);
    printTable(aHeader, aRows);

    const okStats = rep.aspects.filter((a) => a.n > 0);
    if (okStats.length > 0) {
      const totalMin = okStats.reduce((acc, a) => acc + a.min, 0);
      const totalMedian = okStats.reduce((acc, a) => acc + a.p50, 0);
      console.log(`\nsum of per-aspect min:    ${totalMin.toFixed(0)} ms across ${okStats.length} aspects`);
      console.log(`sum of per-aspect median: ${totalMedian.toFixed(0)} ms`);
      console.log('(serial-sum upper bound — actual eager startup overlaps shared deps, so observed cost is lower)');
    }
  }
}

function fmt(x) {
  if (!Number.isFinite(x)) return '—';
  return x.toFixed(1);
}

function printTable(header, rows) {
  const cols = header.length;
  const widths = new Array(cols).fill(0);
  for (let i = 0; i < cols; i++) widths[i] = String(header[i]).length;
  for (const row of rows) for (let i = 0; i < cols; i++) widths[i] = Math.max(widths[i], String(row[i]).length);
  const fmtRow = (row, padLeft) => row.map((cell, i) => {
    const s = String(cell);
    return padLeft[i] ? s.padStart(widths[i]) : s.padEnd(widths[i]);
  }).join('  ');
  const padLeft = header.map((_, i) => i > 0); // first col left-aligned, rest right
  console.log(fmtRow(header, padLeft));
  console.log(widths.map((w) => '─'.repeat(w)).join('  '));
  for (const row of rows) console.log(fmtRow(row, padLeft));
}
