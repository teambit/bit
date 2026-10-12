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
