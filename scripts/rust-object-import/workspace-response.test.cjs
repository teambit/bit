const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { installed, source } = require('./load-source.cjs');
const cp = require('node:child_process');
const api =
  process.env.BIT_TEST_MATERIALIZATION_COMPILED === '1'
    ? installed('@teambit/component.sources/dist/rust-workspace-materializer.js')
    : source('scopes/component/sources/rust-workspace-materializer.ts');
function setup(t) {
  const original = cp.spawn;
  const child = new EventEmitter();
  child.pid = 12345;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {
    queueMicrotask(() => child.emit('close'));
    return true;
  };
  cp.spawn = () => child;
  t.after(() => {
    cp.spawn = original;
  });
  const session = new api.MaterializationSession('/fixture/helper');
  t.after(() => session.dispose());
  return { session, child };
}
function response(id, payload) {
  return Buffer.from(
    JSON.stringify({ version: 1, id, completed: 1, skipped: [], failed: false, data: payload }) + '\n'
  );
}
test('fragmented large UTF-8 replies and a subsequent small reply preserve exact JSON framing', async (t) => {
  const { session, child } = setup(t);
  for (const [index, payload] of ['日本語 🚀\n'.repeat(20000), 'small'].entries()) {
    const bytes = response(index + 1, payload);
    let observed = 0;
    const pending = session.request(
      () => Buffer.alloc(0),
      1,
      (value) => {
        observed++;
        assert.equal(value.data, payload);
        return true;
      },
      bytes.length
    );
    for (let offset = 0; offset < bytes.length; offset += 113)
      child.stdout.emit('data', bytes.subarray(offset, offset + 113));
    assert.equal(await pending, 1);
    assert.equal(observed, 1);
  }
});
test('response size includes the terminator and trailing bytes cannot acknowledge a prefix', async (t) => {
  for (const mode of ['limit', 'trailing']) {
    await t.test(mode, async (t) => {
      const { session, child } = setup(t);
      const bytes = response(1, 'body');
      let observed = 0;
      const pending = session.request(
        () => Buffer.alloc(0),
        1,
        () => {
          observed++;
          return true;
        },
        mode === 'limit' ? bytes.length - 1 : bytes.length + 10
      );
      child.stdout.emit('data', bytes.subarray(0, 10));
      child.stdout.emit(
        'data',
        mode === 'limit' ? bytes.subarray(10) : Buffer.concat([bytes.subarray(10), Buffer.from('trailing')])
      );
      assert.equal(await pending, undefined);
      assert.equal(observed, 0);
      assert.equal(session.usable, false);
    });
  }
});

test('raw replies preserve arbitrary bytes across header/body fragmentation and subsequent JSON replies', async (t) => {
  for (const width of [1, 37, 65536]) {
    const { session, child } = setup(t);
    const body = Buffer.alloc(64 * 1024).fill(Buffer.from([0, 255, 10, 13, 0xc3, 0xa9, 34, 92]));
    const header = Buffer.from(
      JSON.stringify({ version: 1, id: 1, completed: 1, skipped: [], failed: false, binaryBytes: body.length }) + '\n'
    );
    const wire = Buffer.concat([header, body]);
    let observed = 0;
    const pending = session.request(
      () => Buffer.alloc(0),
      1,
      (value, contents) => {
        assert.deepEqual(contents, body);
        observed++;
        return true;
      },
      wire.length,
      false,
      true
    );
    for (let offset = 0; offset < wire.length; offset += width)
      child.stdout.emit('data', wire.subarray(offset, offset + width));
    assert.equal(await pending, 1);
    assert.equal(observed, 1);
    const next = session.request(() => Buffer.alloc(0), 1);
    child.stdout.emit('data', response(2, 'after raw'));
    assert.equal(await next, 1);
  }
});

test('raw replies reject malformed lengths, surplus bytes and incomplete bodies without acknowledging a prefix', async (t) => {
  for (const mode of ['missing', 'negative', 'fractional', 'limit', 'surplus', 'incomplete']) {
    await t.test(mode, async (t) => {
      const { session, child } = setup(t);
      let observed = 0;
      const binaryBytes = {
        missing: undefined,
        negative: -1,
        fractional: 1.5,
        limit: 99999,
        surplus: 1,
        incomplete: 3,
      }[mode];
      const pending = session.request(
        () => Buffer.alloc(0),
        1,
        () => {
          observed++;
          return true;
        },
        1024,
        false,
        true
      );
      child.stdout.emit(
        'data',
        Buffer.concat([
          Buffer.from(
            JSON.stringify({ version: 1, id: 1, completed: 1, skipped: [], failed: false, binaryBytes }) + '\n'
          ),
          Buffer.from([0, 255]),
        ])
      );
      if (mode === 'incomplete') await session.dispose();
      assert.equal(await pending, undefined);
      assert.equal(observed, 0);
      assert.equal(session.usable, false);
    });
  }
});

test('failed spawn cleanup never signals a child without a positive PID', async (t) => {
  const original = cp.ChildProcess.prototype.kill;
  const unsafe = [];
  cp.ChildProcess.prototype.kill = function (signal) {
    if (!this.pid || this.pid <= 0) {
      unsafe.push(signal);
      return false;
    }
    return original.call(this, signal);
  };
  t.after(() => {
    cp.ChildProcess.prototype.kill = original;
  });
  const session = new api.MaterializationSession(
    require('node:path').join(require('node:os').tmpdir(), `bit-missing-${process.pid}-${Date.now()}`, 'helper')
  );
  // Dispose both before the asynchronous spawn-error event and after it.
  await session.dispose();
  assert.equal(session.usable, false);
  assert.deepEqual(unsafe, []);
});
