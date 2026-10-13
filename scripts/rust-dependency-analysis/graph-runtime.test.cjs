const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { benchmarkGlobals } = require('./command-workspace.cjs');

test('actual cold CLI status consumes whole native graphs and preserves canonical JSON after source mutation', async (t) => {
  for (const key of ['BIT_LEGACY_ROOT', 'BIT_TEST_OBJECT_IMPORT', 'BIT_TEST_WORKSPACE_ADDON'])
    assert.ok(process.env[key], key);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-graph-runtime-'));
  const directory = path.join(temporary, 'workspace');
  fs.mkdirSync(directory);
  const globals = benchmarkGlobals(temporary);
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const command = (args, extra = {}) =>
    execFileSync(process.execPath, [path.join(process.env.BIT_LEGACY_ROOT, 'bin/bit.js'), ...args], {
      cwd: directory,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, CI: '1', BIT_GLOBALS_DIR: globals, BIT_RUST_CLIENT_VCS: 'off', ...extra },
    });
  command(['init', '--skip-interactive', '--default-scope', 'qualification.graph']);
  const write = (file, body) => {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  };
  write('package.json', '{"name":"whole-graph-runtime","private":true}');
  write('alpha/index.js', "require('./left'); require('./right'); require('node:fs'); module.exports = 1;");
  write('alpha/left.js', "require('./shared'); module.exports = 1;");
  write('alpha/right.js', "require('./shared'); module.exports = 2;");
  write('alpha/shared.ts', 'export const value: number = 1;');
  write('alpha/plain.txt', 'SOURCE_BODY_SENTINEL');
  command(['add', 'alpha', '--id', 'alpha', '--main', 'index.js']);
  command(['link']);
  const compare = (label) => {
    fs.rmSync(path.join(directory, '.bit/cache/components/deps'), { recursive: true, force: true });
    const expected = command(['status', '--json']);
    fs.rmSync(path.join(directory, '.bit/cache/components/deps'), { recursive: true, force: true });
    const trace = path.join(temporary, label + '.json');
    const actual = command(['status', '--json'], {
      BIT_RUST_CLIENT_VCS: 'on',
      BIT_RUST_OBJECT_IMPORT: process.env.BIT_TEST_OBJECT_IMPORT,
      BIT_IMPORT_TRACE: trace,
      BIT_IMPORT_TRACE_PROTOCOL_ONLY: '1',
      NODE_OPTIONS: `--require=${path.resolve(__dirname, '../rust-object-import/import-trace.cjs')}`,
    });
    assert.deepEqual(JSON.parse(actual), JSON.parse(expected), label);
    assert.equal(actual, expected, `${label}: byte equality`);
    const metrics = JSON.parse(fs.readFileSync(trace));
    assert.ok(
      metrics.workspace.dependencyGraph?.completed > 0,
      `${label}: native whole graph must be consumed ${JSON.stringify(metrics.workspace)}`
    );
    assert.equal(metrics.workspace.dependencyScan.frames, 0, `${label}: no per-file scan frames`);
    assert.equal(metrics.workspace.dependencyResolve.frames, 0, `${label}: no per-file resolve frames`);
  };
  compare('initial');
  write('alpha/shared.ts', "export { value } from './added';");
  write('alpha/added.ts', 'export const value: number = 2;');
  compare('mutated');
});
