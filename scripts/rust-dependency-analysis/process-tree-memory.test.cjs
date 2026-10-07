const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createProcessTreeMemorySampler } = require('./process-tree-memory.cjs');
const { createBenchmarkProcessControl } = require('./process-tree-memory-control.cjs');

function proc(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-rss-proc-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  function process(pid, parentPid, rss, startTime = String(pid), tasks = { [pid]: [] }) {
    const directory = path.join(root, String(pid));
    fs.mkdirSync(directory, { recursive: true });
    const fields = ['S', String(parentPid), ...Array(17).fill('0'), startTime];
    fs.writeFileSync(path.join(directory, 'stat'), `${pid} (command ) ${pid}) ${fields.join(' ')}\n`);
    fs.writeFileSync(path.join(directory, 'status'), `Name: command\nVmRSS:\t${rss} kB\n`);
    fs.rmSync(path.join(directory, 'task'), { recursive: true, force: true });
    for (const [thread, children] of Object.entries(tasks)) {
      const task = path.join(directory, 'task', thread);
      fs.mkdirSync(task, { recursive: true });
      fs.writeFileSync(path.join(task, 'children'), children.join(' '));
    }
  }
  return { root, process, remove: (pid) => fs.rmSync(path.join(root, String(pid)), { recursive: true, force: true }) };
}

test('simultaneous RSS includes every descendant and thread child without duplicate counting', (context) => {
  const fixture = proc(context);
  fixture.process(10, 1, 100, '100', { 10: [20], 11: [20, 30] });
  fixture.process(20, 10, 200, '200', { 20: [40] });
  fixture.process(30, 10, 300);
  fixture.process(40, 20, 400);
  const report = createProcessTreeMemorySampler(10, { procRoot: fixture.root }).stop();
  assert.equal(report.peakSampledRssKiB, 1000);
  assert.equal(report.maxConcurrentProcesses, 4);
  assert.equal(report.uniqueProcesses, 4);
  assert.deepEqual(
    report.peakProcesses.map((p) => p.pid).sort((a, b) => a - b),
    [10, 20, 30, 40]
  );
  assert.equal(report.failedProcReads, 0);
});

test('peak is a simultaneous sum rather than a sum of independent process peaks', (context) => {
  const fixture = proc(context);
  fixture.process(10, 1, 1000, '10', { 10: [20] });
  fixture.process(20, 10, 100);
  const sampler = createProcessTreeMemorySampler(10, { procRoot: fixture.root });
  fixture.process(10, 1, 100, '10', { 10: [20] });
  fixture.process(20, 10, 1200);
  const report = sampler.stop();
  assert.equal(report.peakSampledRssKiB, 1300);
  assert.equal(report.peakProcesses.find((p) => p.pid === 10).rssKiB, 100);
});

test('observed orphan descendants remain included and reused unrelated PIDs are excluded', (context) => {
  const fixture = proc(context);
  fixture.process(10, 1, 100, '10', { 10: [20] });
  fixture.process(20, 10, 200);
  const sampler = createProcessTreeMemorySampler(10, { procRoot: fixture.root });
  fixture.remove(10);
  fixture.process(20, 1, 900);
  sampler.sample();
  fixture.process(20, 99, 10000, 'reused');
  const report = sampler.stop();
  assert.equal(report.observedRootExit, true);
  assert.equal(report.peakSampledRssKiB, 900);
  assert.equal(report.uniqueProcesses, 2);
});

test('stale child lists cannot attribute an unrelated reused PID to the command', (context) => {
  const fixture = proc(context);
  fixture.process(10, 1, 100, '10', { 10: [20] });
  fixture.process(20, 99, 10000);
  const report = createProcessTreeMemorySampler(10, { procRoot: fixture.root }).stop();
  assert.equal(report.peakSampledRssKiB, 100);
  assert.equal(report.uniqueProcesses, 1);
});

test('vanished processes are reported and cannot contribute stale RSS', (context) => {
  const fixture = proc(context);
  fixture.process(10, 1, 100, '10', { 10: [20, 30] });
  fixture.process(20, 10, 200);
  const sampler = createProcessTreeMemorySampler(10, { procRoot: fixture.root });
  fixture.remove(20);
  fixture.process(10, 1, 2000, '10', { 10: [] });
  const report = sampler.stop();
  assert.equal(report.peakSampledRssKiB, 2000);
  assert.equal(report.uniqueProcesses, 2);
  assert.ok(report.missingProcessReads > 0);
});

test('missing task children lists fail instead of silently measuring only the root', (context) => {
  const fixture = proc(context);
  fixture.process(10, 1, 100, '10', {});
  assert.throws(() => createProcessTreeMemorySampler(10, { procRoot: fixture.root }), /CONFIG_PROC_CHILDREN/);
});

test('invalid root and interval fail explicitly', (context) => {
  const fixture = proc(context);
  assert.throws(() => createProcessTreeMemorySampler(0), /positive integer/);
  assert.throws(() => createProcessTreeMemorySampler(10, { intervalMs: 1 }), /interval/);
  assert.throws(() => createProcessTreeMemorySampler(10, { procRoot: fixture.root }), /cannot inspect/);
});

test('identity is rechecked when a PID changes between stat and RSS reads', (context) => {
  const fixture = proc(context);
  fixture.process(10, 1, 100, '10', { 10: [20] });
  fixture.process(20, 10, 200, '20');
  let reused = false;
  const sampler = createProcessTreeMemorySampler(10, {
    procRoot: fixture.root,
    readFileSync(filename, encoding) {
      if (filename === path.join(fixture.root, '20/status') && !reused) {
        reused = true;
        fixture.process(20, 99, 10000, '999');
      }
      return fs.readFileSync(filename, encoding);
    },
  });
  const report = sampler.stop();
  assert.equal(report.peakSampledRssKiB, 100);
  assert.equal(report.uniqueProcesses, 1);
  assert.equal(report.racedProcessReads, 1);
});

test('unreadable live process memory is reported as a failed read', (context) => {
  const fixture = proc(context);
  fixture.process(10, 1, 100, '10', { 10: [20] });
  fixture.process(20, 10, 200);
  const report = createProcessTreeMemorySampler(10, {
    procRoot: fixture.root,
    readFileSync(filename, encoding) {
      if (filename === path.join(fixture.root, '20/status')) {
        const error = new Error('permission denied');
        error.code = 'EACCES';
        throw error;
      }
      return fs.readFileSync(filename, encoding);
    },
  }).stop();
  assert.ok(report.failedProcReads > 0);
  assert.equal(report.peakSampledRssKiB, 100);
});

async function resistantChild(context) {
  const child = spawn(
    process.execPath,
    ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); console.log('ready');"],
    { detached: true, stdio: ['ignore', 'pipe', 'inherit'] }
  );
  context.after(() => {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
  });
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stdout.once('data', resolve);
  });
  return child;
}

test(
  'cancellation escalates before waiting for a SIGTERM-resistant process to close',
  { skip: process.platform !== 'linux', timeout: 2000 },
  async (context) => {
    const child = await resistantChild(context);
    const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve(signal)));
    const control = createBenchmarkProcessControl(child, { graceMs: 25, timeoutMs: 1000 });
    context.after(control.dispose);
    const failure = new Error('output limit reached');
    control.terminate(failure);
    assert.equal(await closed, 'SIGKILL');
    assert.equal(control.failure, failure);
  }
);

test(
  'overall command timeout also terminates resistant process groups',
  { skip: process.platform !== 'linux', timeout: 2000 },
  async (context) => {
    const child = await resistantChild(context);
    const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve(signal)));
    const control = createBenchmarkProcessControl(child, { graceMs: 25, timeoutMs: 25 });
    context.after(control.dispose);
    assert.equal(await closed, 'SIGKILL');
    assert.match(control.failure.message, /timed out/);
  }
);

test(
  'real process allocations are observed and timer cleanup allows shutdown',
  { skip: process.platform !== 'linux' },
  async (context) => {
    const child = spawn(
      process.execPath,
      [
        '-e',
        "const data = Buffer.alloc(24 * 1024 * 1024, 1); console.log('ready'); process.stdin.resume(); process.stdin.on('data', () => { console.log(data[0]); });",
      ],
      { stdio: ['pipe', 'pipe', 'inherit'] }
    );
    context.after(() => child.kill('SIGKILL'));
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.stdout.once('data', resolve);
    });
    const sampler = createProcessTreeMemorySampler(child.pid);
    sampler.start();
    const closing = new Promise((resolve) => child.once('close', resolve));
    child.stdin.destroy();
    child.kill('SIGTERM');
    await closing;
    const report = sampler.stop();
    assert.ok(report.peakSampledRssKiB > 24 * 1024);
    assert.equal(report.uniqueProcesses, 1);
    assert.equal(report.observedRootExit, true);
    assert.deepEqual(sampler.stop(), report);
  }
);
