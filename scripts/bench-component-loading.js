#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Component-loading benchmark harness.
 *
 * Part of the component-loading redesign (scopes/workspace/workspace/component-loading-redesign.md).
 * Measures wall-time (median of N warm runs) and peak RSS for the component-loading-heavy commands
 * listed in the redesign doc's §4 benchmark table. Re-run at every phase boundary and update that
 * table; any phase that regresses a number must explain why before merging.
 *
 * Usage:
 *   node scripts/bench-component-loading.js [options]
 *
 * Options:
 *   --bin=<name>        bit binary to benchmark (default: "bit"; use "bit6" in this repo)
 *   --runs=<n>          measured runs per command (default: 3, median is reported)
 *   --warmup=<n>        warmup runs per command, discarded (default: 1)
 *   --show-comp=<id>    component id for "bit show" (default: teambit.workspace/workspace)
 *   --commands=<list>   comma-separated subset of: status,list,show,graph (default: all)
 *   --json=<path>       also write the raw results as JSON to this path
 *
 * Peak RSS uses /usr/bin/time (-l on macOS, -v on Linux). If it isn't available, RSS is reported
 * as n/a and only wall-time is measured.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');

function parseArgs(argv) {
  const opts = {
    bin: 'bit',
    runs: 3,
    warmup: 1,
    showComp: 'teambit.workspace/workspace',
    commands: ['status', 'list', 'show', 'graph'],
    json: undefined,
  };
  argv.forEach((arg) => {
    const [key, rawValue] = arg.replace(/^--/, '').split('=');
    const value = rawValue ?? '';
    if (key === 'bin') opts.bin = value;
    else if (key === 'runs') opts.runs = parseInt(value, 10);
    else if (key === 'warmup') opts.warmup = parseInt(value, 10);
    else if (key === 'show-comp') opts.showComp = value;
    else if (key === 'commands')
      opts.commands = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else if (key === 'json') opts.json = value;
  });
  return opts;
}

/** map of command label -> argv passed to the bit binary. */
function commandArgs(label, opts) {
  switch (label) {
    case 'status':
      return ['status'];
    case 'list':
      return ['list'];
    case 'show':
      return ['show', opts.showComp];
    case 'graph':
      // --json computes the graph and prints it, avoiding SVG rendering / opening a browser.
      return ['graph', '--json'];
    default:
      throw new Error(`unknown command label "${label}"`);
  }
}

const TIME_BIN = '/usr/bin/time';
const timeAvailable = fs.existsSync(TIME_BIN);
const timeFlag = process.platform === 'linux' ? '-v' : '-l';

/** parse peak RSS in bytes from /usr/bin/time stderr, or undefined if not found. */
function parsePeakRssBytes(stderr) {
  if (!stderr) return undefined;
  // macOS BSD time -l: "  123456789  maximum resident set size" (bytes)
  const bsd = stderr.match(/(\d+)\s+maximum resident set size/);
  if (bsd) return parseInt(bsd[1], 10);
  // GNU time -v: "Maximum resident set size (kbytes): 123456"
  const gnu = stderr.match(/Maximum resident set size \(kbytes\):\s*(\d+)/);
  if (gnu) return parseInt(gnu[1], 10) * 1024;
  return undefined;
}

/** run the command once, returning { wallMs, rssBytes, ok }. */
function runOnce(bin, args) {
  const fullArgs = timeAvailable ? [timeFlag, bin, ...args] : args;
  const fullBin = timeAvailable ? TIME_BIN : bin;
  const start = process.hrtime.bigint();
  const res = spawnSync(fullBin, fullArgs, {
    stdio: ['ignore', 'ignore', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 64,
  });
  const wallMs = Number(process.hrtime.bigint() - start) / 1e6;
  const ok = res.status === 0;
  const rssBytes = timeAvailable ? parsePeakRssBytes(res.stderr) : undefined;
  return { wallMs, rssBytes, ok, stderr: res.stderr };
}

function median(nums) {
  const sorted = nums
    .filter((n) => n !== undefined)
    .slice()
    .sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fmtMs(ms) {
  if (ms === undefined) return 'n/a';
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtRss(bytes) {
  if (bytes === undefined) return 'n/a';
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const versionRes = spawnSync(opts.bin, ['--version'], { encoding: 'utf8' });
  if (versionRes.error || versionRes.status !== 0) {
    console.error(
      `✖ cannot run "${opts.bin} --version" (${versionRes.error ? versionRes.error.message : `exit ${versionRes.status}`}). is the binary on PATH?`
    );
    process.exit(1);
  }
  const binVersion = (versionRes.stdout || '').trim() || 'unknown';

  console.log('component-loading benchmark');
  console.log(`  bin: ${opts.bin} (${binVersion})  node: ${process.version}  platform: ${process.platform}`);
  console.log(`  runs: ${opts.runs} (median)  warmup: ${opts.warmup}  show-comp: ${opts.showComp}`);
  if (!timeAvailable) console.log('  note: /usr/bin/time not found — peak RSS unavailable, wall-time only');
  console.log('');

  const results = [];
  opts.commands.forEach((label) => {
    const args = commandArgs(label, opts);
    process.stdout.write(`▶ ${label} (${opts.bin} ${args.join(' ')})\n`);
    for (let i = 0; i < opts.warmup; i += 1) {
      const warm = runOnce(opts.bin, args);
      if (!warm.ok)
        console.log(`  ! warmup exited non-zero — the command may have failed; check "${opts.bin} ${args.join(' ')}"`);
    }
    const walls = [];
    const rsses = [];
    let anyFailed = false;
    for (let i = 0; i < opts.runs; i += 1) {
      const run = runOnce(opts.bin, args);
      walls.push(run.wallMs);
      rsses.push(run.rssBytes);
      if (!run.ok) anyFailed = true;
      process.stdout.write(`  run ${i + 1}: ${fmtMs(run.wallMs)}  ${fmtRss(run.rssBytes)}\n`);
    }
    const medWall = median(walls);
    const medRss = median(rsses);
    results.push({
      label,
      command: `${opts.bin} ${args.join(' ')}`,
      medianWallMs: medWall,
      medianRssBytes: medRss,
      failed: anyFailed,
    });
    console.log(`  → median: ${fmtMs(medWall)}  ${fmtRss(medRss)}${anyFailed ? '  (⚠ some runs failed)' : ''}\n`);
  });

  // markdown summary, mirroring the §4 table columns
  console.log('summary (markdown):');
  console.log('| command | median wall | peak RSS |');
  console.log('| --- | --- | --- |');
  results.forEach((r) => {
    console.log(`| \`${r.command}\` | ${fmtMs(r.medianWallMs)} | ${fmtRss(r.medianRssBytes)} |`);
  });

  if (opts.json) {
    fs.writeFileSync(
      opts.json,
      JSON.stringify(
        {
          bin: opts.bin,
          binVersion,
          node: process.version,
          platform: process.platform,
          runs: opts.runs,
          warmup: opts.warmup,
          results,
        },
        null,
        2
      )
    );
    console.log(`\nwrote ${opts.json}`);
  }

  // fail the process when any command had a failing run, so CI / baseline-capture callers don't
  // silently record numbers measured from a broken command.
  const failedCommands = results.filter((r) => r.failed);
  if (failedCommands.length) {
    console.error(
      `\n✖ ${failedCommands.length} command(s) had failing runs: ${failedCommands.map((r) => r.label).join(', ')}. the numbers above are unreliable.`
    );
    process.exitCode = 1;
  }
}

main();
