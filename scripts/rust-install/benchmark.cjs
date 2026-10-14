#!/usr/bin/env node
// Benchmark native `bit install` against the TypeScript command on generated
// workspaces. Writes raw results outside the checkout (see docs/rust/README.md,
// "Benchmark artifacts"); docs/rust/native-install-benchmark.md keeps the summary.
//
// node scripts/rust-install/benchmark.cjs --cli <bit.js> --addon <bit-workspace.node> \
//   --out <dir> [--rounds 5] [--sizes small,medium] [--prepare-only 1]
'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = require.main === module ? parseArgs(process.argv.slice(2)) : {};
const CLI = args.cli && path.resolve(args.cli);
const ADDON = args.addon && path.resolve(args.addon);
const OUT = args.out && path.resolve(args.out);
const ROUNDS = Number(args.rounds ?? 5);
const SIZES = (args.sizes ?? 'small,medium').split(',');
const SCOPE = 'org.bench';
const SIZE_COMPONENTS = { small: 5, medium: 50 };
const SMALL_PACKAGES = { 'is-odd': '^3.0.1', 'is-even': '^1.0.0', 'lodash.get': '^4.4.2' };

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, '');
    parsed[key] = argv[i + 1];
    i += 1;
  }
  for (const required of ['cli', 'addon', 'out']) {
    if (!parsed[required]) throw new Error(`missing --${required}`);
  }
  return parsed;
}

function baseEnv(mode) {
  const env = { ...process.env };
  delete env.BIT_NATIVE_INSTALL;
  delete env.BIT_NATIVE_INSTALL_ADDON;
  if (mode === 'typescript') env.BIT_NATIVE_INSTALL = 'off';
  else env.BIT_NATIVE_INSTALL_ADDON = ADDON;
  return env;
}

function bit(cwd, cliArgs, mode = 'typescript', extraEnv = {}) {
  const result = spawnSync(process.execPath, [CLI, ...cliArgs], {
    cwd,
    env: { ...baseEnv(mode), ...extraEnv },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`bit ${cliArgs.join(' ')} failed in ${cwd}\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

/** `/usr/bin/time -l` reports real/user/sys and the largest resident set among the process tree. */
function measure(cwd, cliArgs, mode) {
  const started = process.hrtime.bigint();
  const result = spawnSync('/usr/bin/time', ['-l', process.execPath, CLI, ...cliArgs], {
    cwd,
    env: baseEnv(mode),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const wallMs = Number(process.hrtime.bigint() - started) / 1e6;
  if (result.status !== 0) {
    throw new Error(`bit ${cliArgs.join(' ')} (${mode}) failed in ${cwd}\n${result.stdout}\n${result.stderr}`);
  }
  const stderr = result.stderr;
  const field = (name) => Number((stderr.match(new RegExp(`([\\d.]+) ${name}`)) ?? [])[1]);
  const rss = Number((stderr.match(/(\d+)\s+maximum resident set size/) ?? [])[1]);
  return {
    wallMs,
    cpuMs: (field('user') + field('sys')) * 1000,
    peakRssMb: rss / (1024 * 1024),
    stdout: result.stdout,
  };
}

/**
 * Lines that legitimately differ: timings and pnpm's throttled progress
 * rendering (ANSI cursor movement, `Progress:` lines and the digit fragments a
 * redraw leaves behind). Also lines the native command does not print yet
 * (bit#123): the importer's per-phase status lines, Harmony's
 * `loading N component(s)` and the command runner's `running command` status.
 */
const KNOWN_GAPS = [
  /^- (importing|successfully imported|import) /,
  /^- loading \d+ component\(s\)$/,
  /^- running command "install"\.\.\.$/,
];

function normalizeOutput(stdout) {
  return stdout
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
    .split(/\r?\n|\r/)
    .map((line) =>
      line
        .replace(/\(completed in [^)]*\)/g, '(completed in T)')
        .replace(/in [\d.]+ seconds/g, 'in T seconds')
        .trim()
    )
    .filter((line) => line !== '' && !/^\d+$/.test(line))
    .filter((line) => !/^Progress: /.test(line) && !/^[\d, ]*(resolved|reused|downloaded|added) \d/.test(line))
    .filter((line) => !KNOWN_GAPS.some((pattern) => pattern.test(line)))
    .join('\n');
}

function componentSource(index, total) {
  const imports = [];
  const parts = [`'c${index}'`];
  // Each component depends on up to two earlier ones, forming a dependency chain.
  for (const dep of [index - 1, Math.floor(index / 2)]) {
    if (dep >= 1 && dep !== index && !imports.includes(dep)) {
      imports.push(dep);
      parts.push(`c${dep}`);
    }
  }
  const importLines = imports.map((dep) => `import { c${dep} } from '@org/bench.comp-${dep}';`);
  const packageLine = index % 5 === 0 ? `import isOdd from 'is-odd';\nexport const odd = isOdd(${index});` : '';
  return `${importLines.join('\n')}\n${packageLine}\nexport const c${index} = [${parts.join(', ')}].join('-');\nexport const total = ${total};\n`;
}

/** Builds the exported workspace once and returns a clone-like template directory. */
function prepareTemplate(size) {
  const total = SIZE_COMPONENTS[size];
  const root = path.join(OUT, 'fixtures', size);
  fs.rmSync(root, { recursive: true, force: true });
  const remote = path.join(root, SCOPE);
  const ws = path.join(root, 'workspace');
  fs.mkdirSync(remote, { recursive: true });
  fs.mkdirSync(ws, { recursive: true });
  bit(remote, ['init', '--bare']);
  bit(ws, ['init', '--default-scope', SCOPE]);
  bit(ws, ['remote', 'add', `file://${remote}`]);
  const policy = { dependencies: SMALL_PACKAGES, peerDependencies: {} };
  const commentJson = require(path.join(path.dirname(CLI), '..', 'node_modules', 'comment-json'));
  const config = commentJson.parse(fs.readFileSync(path.join(ws, 'workspace.jsonc'), 'utf8'));
  config['teambit.dependencies/dependency-resolver'].policy = policy;
  fs.writeFileSync(path.join(ws, 'workspace.jsonc'), commentJson.stringify(config, null, 2));
  const names = [];
  for (let index = 1; index <= total; index += 1) {
    const dir = path.join(ws, 'comps', `comp-${index}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.ts'), componentSource(index, total));
    names.push(`comps/comp-${index}`);
  }
  bit(ws, ['add', ...names]);
  bit(ws, ['install', '--skip-import']);
  bit(ws, ['tag', '--message', 'bench', '--ignore-issues', '*']);
  bit(ws, ['export']);
  // A clone-like template: sources, workspace.jsonc and .bitmap, with an empty scope.
  const template = path.join(root, 'template');
  fs.cpSync(ws, template, {
    recursive: true,
    filter: (source) => {
      const rel = path.relative(ws, source);
      return !/^(node_modules|pnpm-lock\.yaml)(\/|$)/.test(rel) && !/^\.bit\/(objects|index\.json|cache|events|tmp)(\/|$)/.test(rel);
    },
  });
  // The scope dir must exist for the CLI to recognize the workspace.
  fs.mkdirSync(path.join(template, '.bit', 'objects'), { recursive: true });
  return template;
}

function freshWorkspace(template, name) {
  const dir = path.join(OUT, 'runs', name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(template, dir, { recursive: true });
  return dir;
}

const SCENARIOS = [
  { name: 'cold', args: ['install'], fresh: true },
  { name: 'repeat', args: ['install'], fresh: false },
  { name: 'add', args: ['install', 'is-number'], fresh: false },
  { name: 'cold --skip-compile --skip-write-config-files', args: ['install', '--skip-compile', '--skip-write-config-files'], fresh: true },
];

function runSize(size, template) {
  const results = [];
  const outputs = {};
  for (let round = 0; round <= ROUNDS; round += 1) {
    const order = round % 2 === 0 ? ['typescript', 'native'] : ['native', 'typescript'];
    for (const mode of order) {
      let dir = freshWorkspace(template, `${size}-${mode}`);
      for (const scenario of SCENARIOS) {
        if (scenario.fresh) dir = freshWorkspace(template, `${size}-${mode}`);
        const measured = measure(dir, scenario.args, mode);
        const output = normalizeOutput(measured.stdout);
        (outputs[`${scenario.name}:${mode}`] ??= []).push(output);
        if (round > 0) results.push({ size, scenario: scenario.name, mode, round, ...measured, stdout: undefined });
        process.stderr.write(`${size} ${scenario.name} ${mode} round ${round}: ${measured.wallMs.toFixed(0)}ms\n`);
      }
    }
  }
  return { results, outputs };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function summarize(size, results, outputs) {
  const lines = [];
  for (const scenario of SCENARIOS) {
    const row = {};
    for (const mode of ['typescript', 'native']) {
      const rows = results.filter((entry) => entry.scenario === scenario.name && entry.mode === mode);
      row[mode] = {
        wall: median(rows.map((entry) => entry.wallMs)),
        wallMin: Math.min(...rows.map((entry) => entry.wallMs)),
        wallMax: Math.max(...rows.map((entry) => entry.wallMs)),
        cpu: median(rows.map((entry) => entry.cpuMs)),
        rss: median(rows.map((entry) => entry.peakRssMb)),
      };
    }
    const ts = outputs[`${scenario.name}:typescript`].slice(1);
    const native = outputs[`${scenario.name}:native`].slice(1);
    const matched = ts.every((output, index) => output === native[index]);
    const ratio = (key) => (row.native[key] / row.typescript[key]).toFixed(3);
    lines.push(
      `| ${size} | ${scenario.name} | ${row.typescript.wall.toFixed(0)} (${row.typescript.wallMin.toFixed(0)}–${row.typescript.wallMax.toFixed(0)}) | ${row.native.wall.toFixed(0)} (${row.native.wallMin.toFixed(0)}–${row.native.wallMax.toFixed(0)}) | ${ratio('wall')} | ${row.typescript.cpu.toFixed(0)} | ${row.native.cpu.toFixed(0)} | ${ratio('cpu')} | ${row.typescript.rss.toFixed(0)} | ${row.native.rss.toFixed(0)} | ${ratio('rss')} | ${matched ? 'yes' : 'no'} |`
    );
    if (!matched) {
      const slug = scenario.name.replace(/[^a-z]+/g, '-').replace(/-+$/, '');
      fs.writeFileSync(path.join(OUT, `${size}-${slug}-typescript.txt`), ts.join('\n=====\n'));
      fs.writeFileSync(path.join(OUT, `${size}-${slug}-native.txt`), native.join('\n=====\n'));
    }
  }
  return lines;
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const header = [
    '| Workspace | Scenario | TS wall ms (min–max) | Native wall ms (min–max) | Wall ratio | TS CPU ms | Native CPU ms | CPU ratio | TS peak RSS MB | Native peak RSS MB | RSS ratio | Output matched |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  const table = [...header];
  const all = [];
  for (const size of SIZES) {
    const template = prepareTemplate(size);
    if (args['prepare-only']) continue;
    const { results, outputs } = runSize(size, template);
    all.push(...results);
    table.push(...summarize(size, results, outputs));
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ machine: machine(), rounds: ROUNDS, results: all }, null, 2));
  fs.writeFileSync(path.join(OUT, 'summary.md'), `${table.join('\n')}\n`);
  process.stdout.write(`${table.join('\n')}\n`);
}

function machine() {
  return {
    cpu: os.cpus()[0]?.model,
    cores: os.cpus().length,
    memoryGb: Math.round(os.totalmem() / 1024 ** 3),
    platform: `${os.type()} ${os.release()}`,
    node: process.version,
  };
}

if (require.main === module) main();

module.exports = { normalizeOutput };
