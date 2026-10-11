// Whole-command timings include Node, helper and Git descendants; no native-only microbenchmarks.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const cp = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { createBenchmarkProcessControl } = require('../rust-dependency-analysis/process-tree-memory-control.cjs');
const { createProcessTreeMemorySampler } = require('../rust-dependency-analysis/process-tree-memory.cjs');
function pairedEntries(rounds, modes) {
  assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 20);
  const entries = [];
  if (rounds > 1) for (const mode of ['node', 'native']) entries.push({ mode, round: -1, warmup: true });
  for (let round = 0; round < rounds; round++)
    for (const mode of modes || (round % 2 ? ['native', 'node'] : ['node', 'native']))
      entries.push({ mode, round, warmup: false });
  if (!modes) for (const mode of ['missing-helper', 'crashed-helper']) entries.push({ mode, round: 0, fallback: true });
  return entries;
}
async function measuredCommand(nodeArgs, { cwd, env, step, operation }) {
  const linux = process.platform === 'linux';
  const cpuFile = path.join(cwd, `merge-command-cpu-${step}.txt`);
  const started = performance.now();
  let processTree;
  const result = await new Promise((resolve, reject) => {
    const child = cp.spawn(
      linux ? '/usr/bin/time' : process.execPath,
      linux ? ['-f', '%U %S', '-o', cpuFile, process.execPath, ...nodeArgs] : nodeArgs,
      { cwd, env, detached: linux, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const control = linux ? createBenchmarkProcessControl(child) : undefined;
    const sampler = linux ? createProcessTreeMemorySampler(child.pid, { intervalMs: 10 }) : undefined;
    sampler?.start();
    const timer = linux ? undefined : setTimeout(() => child.kill('SIGKILL'), 120000);
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (bytes) => (stdout += bytes));
    child.stderr.on('data', (bytes) => (stderr += bytes));
    child.once('error', (error) => {
      clearTimeout(timer);
      sampler?.stop();
      control?.dispose();
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      processTree = sampler?.stop();
      control?.dispose();
      if (control?.failure) return reject(control.failure);
      if (code) reject(new Error(`${operation} (${code})\n${stdout}\n${stderr}`));
      else resolve({ stdout, stderr });
    });
  });
  const measurement = { operation, step, wallMs: performance.now() - started, processTree };
  if (linux) {
    const [user, system] = (await fs.readFile(cpuFile, 'utf8')).trim().split(/\s+/).map(Number);
    assert.ok(Number.isFinite(user) && Number.isFinite(system));
    measurement.cpuSeconds = { user, system, total: user + system };
  }
  return { result, measurement };
}
module.exports = { pairedEntries, measuredCommand };
