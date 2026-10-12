const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { installed, source } = require('./load-source.cjs');
const { Repository, Source } = installed('@teambit/objects');
const compiled = process.env.BIT_TEST_CHECKOUT_SOURCE_COMPILED === '1';
const adapter = compiled
  ? installed('@teambit/component.sources/dist/rust-checkout-source.js')
  : source('scopes/component/sources/rust-checkout-source.ts');
const persistence = compiled
  ? installed('@teambit/component.sources/dist/rust-workspace-persistence.js')
  : source('scopes/component/sources/rust-workspace-persistence.ts');
function setup(t, respond) {
  const flag = process.env.BIT_RUST_CLIENT_VCS;
  const original = persistence.withWorkspaceSession;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  persistence.withWorkspaceSession = async (action) =>
    action({ usable: true, request: async (build, count) => respond(build(1), count) ?? count });
  t.after(() => {
    persistence.withWorkspaceSession = original;
    if (flag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = flag;
  });
  const repository = new Repository(path.resolve('cached-checkout-fixture'), {});
  const body = Source.from(Buffer.from('cached body'));
  const reference = body.hash();
  const model = { file: reference, relativePath: 'index.js', name: 'index.js', test: false };
  return { repository, body, reference, model };
}
function flags(frame) {
  let offset = 12;
  offset += 4 + frame.readUInt32BE(offset);
  const result = [];
  for (let index = 0; index < frame.readUInt32BE(8); index++) {
    offset += 20;
    offset += 4 + frame.readUInt32BE(offset);
    result.push(frame.readUInt32BE(offset));
    offset += 8;
  }
  assert.equal(offset, frame.length);
  return result;
}
test('only cached canonical Source bytes authorize helper preflight reuse', async (t) => {
  const observed = [];
  const f = setup(t, (frame) => {
    observed.push(flags(frame));
  });
  assert.equal((await adapter.prepareRustCheckoutSources([f.model], f.repository)).length, 1);
  f.repository.setCache(f.body);
  assert.equal((await adapter.prepareRustCheckoutSources([f.model], f.repository)).length, 1);
  f.body.contents[0] ^= 1;
  assert.equal(await adapter.prepareRustCheckoutSources([f.model], f.repository), undefined);
  assert.deepEqual(observed, [[1], [3]]);
});
test('cache authority is captured again after each asynchronous preflight batch', async (t) => {
  const observed = [];
  const f = setup(t, (frame) => {
    observed.push(flags(frame));
    f.repository.removeFromCache(f.reference);
  });
  f.repository.setCache(f.body);
  const models = Array.from({ length: 257 }, (_, index) => ({ ...f.model, relativePath: `${index}.js` }));
  assert.equal((await adapter.prepareRustCheckoutSources(models, f.repository)).length, 257);
  assert.deepEqual(observed, [Array(256).fill(3), [1]]);
});
test('write frames retain their original flags even when a caller includes a cache hint', () => {
  const frame = adapter.checkoutSourceFrame('BWC1', 1, path.resolve('objects'), [
    { hash: 'a'.repeat(40), destination: path.resolve('target'), preferCached: true },
  ]);
  assert.deepEqual(flags(frame), [1]);
});

test('replaced cache-capture exports decline reuse without invoking an accessor', async (t) => {
  const observed = [];
  const f = setup(t, (frame) => {
    observed.push(flags(frame));
  });
  f.repository.setCache(f.body);
  const query = installed('@teambit/objects/dist/objects/rust-history-query.js');
  const original = Object.getOwnPropertyDescriptor(query, 'captureRustHistoryQueryObjects');
  let calls = 0;
  Object.defineProperty(query, 'captureRustHistoryQueryObjects', {
    configurable: true,
    get() {
      calls++;
      throw Error('custom capture');
    },
  });
  t.after(() => Object.defineProperty(query, 'captureRustHistoryQueryObjects', original));
  assert.equal((await adapter.prepareRustCheckoutSources([f.model], f.repository)).length, 1);
  assert.deepEqual(observed, [[1]]);
  assert.equal(calls, 0);
});

test('oversized read-only batches retry at the original width before returning Sources', async (t) => {
  const observed = [];
  const f = setup(t, (_frame, count) => {
    observed.push(count);
    if (count > 64) return 0;
  });
  const models = Array.from({ length: 257 }, (_, index) => ({ ...f.model, relativePath: `${index}.js` }));
  assert.equal((await adapter.prepareRustCheckoutSources(models, f.repository)).length, 257);
  assert.deepEqual(observed, [256, 64, 64, 64, 64, 1]);
});
