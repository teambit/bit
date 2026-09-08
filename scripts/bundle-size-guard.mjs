#!/usr/bin/env node
/* eslint no-console: 0 */
/**
 * Guard the size of the esbuild CLI bundle's output, part by part, so a regression like the
 * SSR bundle jumping 6 MB -> 53 MB (bundle-plan/18-findings-log.md, 2026-09-07/08) fails CI
 * immediately instead of shipping.
 *
 * Two phases, because half the tree isn't there yet when `setup_esbuild_bundle` finishes - the
 * UI/preview pre-bundle is injected later, by a separate CI job (`check_ui_prebundle_size`, which
 * runs `inject_ui_prebundle` then this in `--phase=post`, before `e2e_test_ui_prebundle` even
 * starts - build validation, not a test):
 *
 *   node scripts/bundle-size-guard.mjs --phase=pre  --out-dir <dir>   # right after the bundle is built
 *   node scripts/bundle-size-guard.mjs --phase=post --out-dir <dir>   # right after inject_ui_prebundle
 *
 * Sizes are compared against scripts/bundle-size-baseline.json, each with `marginPercent` room to
 * grow before failing. To accept an intentional size increase, re-measure and rewrite the baseline:
 *
 *   node scripts/bundle-size-guard.mjs --phase=pre  --out-dir <dir> --update-baseline
 *   node scripts/bundle-size-guard.mjs --phase=post --out-dir <dir> --update-baseline
 */
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, 'bundle-size-baseline.json');

function parseArgs(argv) {
  const args = { phase: undefined, outDir: undefined, updateBaseline: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--update-baseline') args.updateBaseline = true;
    else if (arg.startsWith('--phase=')) args.phase = arg.slice('--phase='.length);
    else if (arg === '--phase') args.phase = argv[++i];
    else if (arg.startsWith('--out-dir=')) args.outDir = arg.slice('--out-dir='.length);
    else if (arg === '--out-dir') args.outDir = argv[++i];
  }
  return args;
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** Sum of file sizes under `path` (a file or a directory, recursively); 0 if it doesn't exist. */
function measure(path) {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (stat.isFile()) return stat.size;
  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isSymbolicLink()) continue;
    total += entry.isDirectory() ? measure(full) : statSync(full).size;
  }
  return total;
}

/** Sum of `measure()` across every directory matching `<dirGlob*>/<suffix>` (one `*` segment). */
function measureAcross(outDir, globPattern, suffix) {
  const starAt = globPattern.indexOf('*');
  if (starAt === -1) return measure(join(outDir, globPattern));
  const before = globPattern.slice(0, starAt).replace(/\/$/, '');
  const parentDir = join(outDir, before);
  if (!existsSync(parentDir)) return 0;
  let total = 0;
  for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    total += measure(join(parentDir, entry.name, suffix));
  }
  return total;
}

function measureCheck(outDir, check) {
  if (check.pathGlob) return measureAcross(outDir, check.pathGlob, check.suffix);
  if (check.excludePath) return measure(join(outDir, check.path)) - measure(join(outDir, check.excludePath));
  return measure(join(outDir, check.path));
}

function loadBaseline() {
  return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
}

function saveBaseline(baseline) {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
}

const COLOR = process.env.CI || process.stdout.isTTY ? { red: '[31m', green: '[32m', yellow: '[33m', dim: '[2m', bold: '[1m', reset: '[0m' } : null;
function paint(color, text) {
  return COLOR ? `${color}${text}${COLOR.reset}` : text;
}

/** Right-pad a rendered (possibly colored) string to `width` visible characters. */
function padVisible(text, visibleLength, width) {
  return text + ' '.repeat(Math.max(0, width - visibleLength));
}

/** Left-pad a rendered (possibly colored) string to `width` visible characters. */
function padVisibleStart(text, visibleLength, width) {
  return ' '.repeat(Math.max(0, width - visibleLength)) + text;
}

function printReport(phase, outDir, marginPercent, rows) {
  console.log(`[bundle-size-guard] phase "${phase}", out-dir ${outDir}, margin +${marginPercent}%\n`);

  const cols = {
    status: 4,
    label: Math.max(5, ...rows.map((r) => r.check.label.length)),
    actual: 10,
    max: 10,
    used: 11,
  };
  const header =
    `  ${'    '.padEnd(cols.status)} ${'CHECK'.padEnd(cols.label)} ` +
    `${'ACTUAL'.padStart(cols.actual)} ${'MAX'.padStart(cols.max)} ${'MARGIN USED'.padStart(cols.used)}`;
  console.log(paint(COLOR?.bold, header));

  for (const { check, actualMB, maxMB, over } of rows) {
    // % of the *allowed growth room* consumed, not of max - right at baseline this reads 0%, not
    // ~91%, since max is always baseline*(1+margin). Can go negative (shrunk below baseline).
    const allowedGrowth = maxMB - check.baselineMB;
    const marginUsedPercent = allowedGrowth > 0 ? ((actualMB - check.baselineMB) / allowedGrowth) * 100 : over ? 100 : 0;
    const nearLimit = !over && marginUsedPercent >= 75;
    const statusColor = over ? COLOR?.red : nearLimit ? COLOR?.yellow : COLOR?.green;
    const statusPlain = over ? 'FAIL' : nearLimit ? 'warn' : ' ok ';
    const usedText = `${marginUsedPercent.toFixed(0)}%`;

    const line =
      `  ${padVisible(paint(statusColor, statusPlain), statusPlain.length, cols.status)} ` +
      `${check.label.padEnd(cols.label)} ` +
      `${`${actualMB.toFixed(2)} MB`.padStart(cols.actual)} ` +
      `${`${maxMB.toFixed(2)} MB`.padStart(cols.max)} ` +
      `${padVisibleStart(paint(statusColor, usedText), usedText.length, cols.used)}`;
    console.log(line);
  }

  const overCount = rows.filter((r) => r.over).length;
  console.log(
    paint(
      COLOR?.dim,
      `\n  ${rows.length - overCount}/${rows.length} within budget${overCount ? `, ${overCount} over` : ''} (baseline + margin; see scripts/bundle-size-baseline.json)`
    )
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.phase || !['pre', 'post'].includes(args.phase)) {
    console.error('usage: node scripts/bundle-size-guard.mjs --phase=pre|post --out-dir <dir> [--update-baseline]');
    process.exit(1);
  }
  if (!args.outDir) {
    console.error('missing required --out-dir=<dir> (the root of the built distribution)');
    process.exit(1);
  }
  if (!existsSync(args.outDir)) {
    console.error(`no such out-dir: ${args.outDir}`);
    process.exit(1);
  }

  const baseline = loadBaseline();
  const checks = baseline.checks.filter((c) => c.phase === args.phase);
  const margin = 1 + baseline.marginPercent / 100;

  const rows = checks.map((check) => {
    const actualBytes = measureCheck(args.outDir, check);
    const actualMB = actualBytes / 1024 / 1024;
    const maxMB = check.baselineMB * margin;
    return { check, actualMB, maxMB, over: actualMB > maxMB };
  });

  if (args.updateBaseline) {
    for (const { check, actualMB } of rows) {
      check.baselineMB = Math.round(actualMB * 100) / 100;
    }
    saveBaseline(baseline);
    console.log(`[bundle-size-guard] baseline updated for phase "${args.phase}":\n`);
    for (const { check, actualMB } of rows) {
      console.log(`  ${mb(actualMB * 1024 * 1024).padStart(10)}  ${check.label}`);
    }
    return;
  }

  printReport(args.phase, args.outDir, baseline.marginPercent, rows);

  const failures = rows.filter((r) => r.over);
  if (failures.length) {
    console.error(
      `[bundle-size-guard] ${failures.length} check(s) exceeded their size budget. ` +
        `If this growth is expected, re-run with --update-baseline and commit the new ` +
        `scripts/bundle-size-baseline.json.`
    );
    process.exit(1);
  }
  console.log('\n[bundle-size-guard] all checks within budget.');
}

main();
