const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function harness(platform, code, signal) {
  const events = [];
  const module = { exports: {} };
  const mocks = {
    'node:fs/promises': { readFile: async () => '0.1 0.2' },
    'node:child_process': {
      spawn() {
        const child = new EventEmitter();
        child.pid = 123;
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        queueMicrotask(() => {
          child.stdout.emit('data', 'complete output');
          child.stderr.emit('data', 'diagnostic output');
          child.emit('close', code, signal);
        });
        return child;
      },
    },
    '../rust-dependency-analysis/process-tree-memory-control.cjs': {
      createBenchmarkProcessControl: () => ({ dispose: () => events.push('dispose') }),
    },
    '../rust-dependency-analysis/process-tree-memory.cjs': {
      createProcessTreeMemorySampler: () => ({
        start: () => events.push('start'),
        stop: () => { events.push('stop'); return { peakRssBytes: 42 }; },
      }),
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'merge-history-measurement.cjs'), 'utf8'), {
    module,
    require: (name) => mocks[name] || require(name),
    process: { platform, execPath: process.execPath },
    setTimeout,
    clearTimeout,
  });
  return {
    events,
    run: () => module.exports.measuredCommand(['cli.js'], { cwd: __dirname, env: {}, step: 0, operation: 'recovery' }),
  };
}

for (const platform of ['linux', 'win32']) {
  test(`${platform}: whole command measurement rejects signals and unknown/nonzero exits`, async () => {
    for (const [code, signal] of [[null, 'SIGTERM'], [null, null], [undefined, undefined], [0, 'SIGKILL'], [1, null]]) {
      const measured = harness(platform, code, signal);
      await assert.rejects(measured.run(), /recovery.*(?:signal|exit)|recovery \(1\)/);
      assert.deepEqual(measured.events, platform === 'linux' ? ['start', 'stop', 'dispose'] : []);
    }
  });
  test(`${platform}: successful whole command measurement retains output and resource results`, async () => {
    const measured = harness(platform, 0, null);
    const result = await measured.run();
    assert.equal(result.result.stdout, 'complete output');
    assert.equal(result.result.stderr, 'diagnostic output');
    assert.equal(result.measurement.operation, 'recovery');
    assert.ok(result.measurement.wallMs >= 0);
    if (platform === 'linux') {
      assert.equal(result.measurement.cpuSeconds.total, 0.1 + 0.2);
      assert.equal(result.measurement.processTree.peakRssBytes, 42);
    }
  });
}
