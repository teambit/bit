const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { source, installed } = require('./load-source.cjs');
const { Ref } = installed('@teambit/objects');
const adapter = source('scopes/component/sources/rust-checkout-source.ts');
const materializer = source('scopes/component/sources/rust-workspace-materializer.ts');

function fixture(contents = Buffer.from('source\r\n')) {
  const hash = createHash('sha1').update(contents).digest('hex');
  const reference = new Ref(hash);
  let reads = 0;
  let eligible = true;
  let cached;
  const repository = {
    objects: {},
    getPath: () => path.resolve('objects'),
    getCache: () => cached,
    canReadCheckoutSourcesNatively: () => eligible && !cached && !repository.objects[hash],
    loadSync: () => {
      reads++;
      return { contents };
    },
  };
  const model = { file: reference, relativePath: 'src/main.js', name: 'main.js', test: false };
  return {
    model,
    repository,
    hash,
    contents,
    reads: () => reads,
    disable: () => {
      eligible = false;
    },
    cache: (value) => {
      cached = { contents: value };
    },
  };
}

test('validated source descriptors defer bytes until the first canonical read', () => {
  const fixtureData = fixture();
  const file = adapter.createRustCheckoutSourceFile(fixtureData.model, fixtureData.repository, true);
  assert.equal(file.relative, path.normalize('src/main.js'));
  assert.equal(adapter.getRustCheckoutSourceDescriptor(file).hash, fixtureData.hash);
  assert.equal(fixtureData.reads(), 0);
  assert.equal(file.contents, fixtureData.contents);
  assert.equal(file.contents, fixtureData.contents);
  assert.equal(fixtureData.reads(), 1);
  assert.equal(adapter.getRustCheckoutSourceDescriptor(file), undefined);
});

test('a source contents setter invalidates provenance and preserves canonical Vinyl validation', () => {
  const fixtureData = fixture();
  const file = adapter.createRustCheckoutSourceFile(fixtureData.model, fixtureData.repository, true);
  const replacement = Buffer.from('hook mutation');
  file.contents = replacement;
  assert.equal(file.contents, replacement);
  assert.equal(fixtureData.reads(), 0);
  assert.equal(adapter.getRustCheckoutSourceDescriptor(file), undefined);
  assert.throws(() => {
    file.contents = 'invalid';
  }, /contents/i);
});

test('replacing the contents property cannot retain stale native provenance', () => {
  for (const accessor of [false, true]) {
    const fixtureData = fixture();
    const file = adapter.createRustCheckoutSourceFile(fixtureData.model, fixtureData.repository, true);
    const changed = Buffer.from('replacement contents');
    Object.defineProperty(
      file,
      'contents',
      accessor ? { configurable: true, get: () => changed } : { configurable: true, writable: true, value: changed }
    );
    assert.equal(adapter.getRustCheckoutSourceDescriptor(file), undefined);
    assert.equal(file.contents, changed);
    assert.equal(fixtureData.reads(), 0);
  }
});

test('custom reference loaders remain canonical at creation and persistence', async () => {
  const fixtureData = fixture();
  const file = adapter.createRustCheckoutSourceFile(fixtureData.model, fixtureData.repository, true);
  fixtureData.model.file.load = async () => ({ contents: Buffer.from('custom ref') });
  assert.equal(adapter.getRustCheckoutSourceDescriptor(file), undefined);
  assert.equal(adapter.createRustCheckoutSourceFile(fixtureData.model, fixtureData.repository, true), undefined);
  assert.equal(fixtureData.reads(), 0);
});

test('changing a model reference cannot reuse the descriptor for its old hash', () => {
  const fixtureData = fixture();
  const file = adapter.createRustCheckoutSourceFile(fixtureData.model, fixtureData.repository, true);
  fixtureData.model.file.hash = '1'.repeat(40);
  assert.equal(adapter.getRustCheckoutSourceDescriptor(file), undefined);
  assert.equal(fixtureData.reads(), 0);
});

test('manifest mutations during native preflight fall back before producing deferred sources', async (t) => {
  const previousFlag = process.env.BIT_RUST_CLIENT_VCS;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  const previousAcquire = materializer.acquireWorkspaceSession;
  t.after(() => {
    materializer.acquireWorkspaceSession = previousAcquire;
    if (previousFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = previousFlag;
  });
  const mutations = [
    (models) => {
      models[0].file.hash = '1'.repeat(40);
    },
    (models) => {
      models[0].relativePath = 'changed.js';
    },
    (models) => {
      models[0].name = 'changed.js';
    },
    (models) => {
      models[0].test = true;
    },
    (models) => {
      models[0] = { ...models[0] };
    },
    (models) => {
      models.push({ ...models[0] });
    },
  ];
  for (const mutate of mutations) {
    const fixtureData = fixture();
    const models = [fixtureData.model];
    let released = false;
    materializer.acquireWorkspaceSession = () => ({
      session: {
        request: async (build, count) => {
          const frame = build(1);
          assert.equal(frame.subarray(0, 4).toString(), 'BWC0');
          mutate(models);
          return count;
        },
      },
      release: async () => {
        released = true;
      },
    });
    assert.equal(await adapter.prepareRustCheckoutSources(models, fixtureData.repository), undefined);
    assert.equal(released, true);
    assert.equal(fixtureData.reads(), 0);
  }
});

test('live cached and pending Source mutations override disk descriptors without eager loading', () => {
  for (const pending of [false, true]) {
    const fixtureData = fixture();
    const file = adapter.createRustCheckoutSourceFile(fixtureData.model, fixtureData.repository, true);
    const changed = Buffer.from('live Source mutation');
    if (pending) fixtureData.repository.objects[fixtureData.hash] = { contents: changed };
    else fixtureData.cache(changed);
    assert.equal(adapter.getRustCheckoutSourceDescriptor(file), undefined);
    assert.equal(file.contents, changed);
    assert.equal(fixtureData.reads(), 0);
  }
});

test('factory and persistence inspections reject unvalidated or transformed reads', () => {
  const fixtureData = fixture();
  assert.equal(adapter.createRustCheckoutSourceFile(fixtureData.model, fixtureData.repository), undefined);
  const file = adapter.createRustCheckoutSourceFile(fixtureData.model, fixtureData.repository, true);
  fixtureData.disable();
  assert.equal(adapter.getRustCheckoutSourceDescriptor(file), undefined);
  assert.equal(adapter.createRustCheckoutSourceFile(fixtureData.model, fixtureData.repository, true), undefined);
  assert.equal(fixtureData.reads(), 0);
});

test('file status uses original bytes without hydrating target sources or converting EOLs', () => {
  const fixtureData = fixture(Buffer.from('text\r\n'));
  const file = adapter.createRustCheckoutSourceFile(fixtureData.model, fixtureData.repository, true);
  assert.equal(adapter.compareRustCheckoutSource(file, { contents: Buffer.from('text\r\n') }), true);
  assert.equal(adapter.compareRustCheckoutSource(file, { contents: Buffer.from('text\n') }), false);
  assert.equal(adapter.compareRustCheckoutSource(file), false);
  assert.equal(fixtureData.reads(), 0);
});

test('preflight validates all source batches and reaps its helper without loading bodies in Node', async (t) => {
  const fixtureData = fixture();
  const previousFlag = process.env.BIT_RUST_CLIENT_VCS;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  const previousAcquire = materializer.acquireWorkspaceSession;
  let released = 0;
  const counts = [];
  materializer.acquireWorkspaceSession = () => ({
    session: {
      request: async (build, count) => {
        const frame = build(counts.length + 1);
        assert.equal(frame.subarray(0, 4).toString(), 'BWC0');
        assert.equal(frame.readUInt32BE(8), count);
        counts.push(count);
        return count;
      },
    },
    release: async () => {
      released++;
    },
  });
  t.after(() => {
    materializer.acquireWorkspaceSession = previousAcquire;
    if (previousFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = previousFlag;
  });
  const models = Array.from({ length: 65 }, (_, index) => ({ ...fixtureData.model, relativePath: `${index}.js` }));
  const files = await adapter.prepareRustCheckoutSources(models, fixtureData.repository);
  assert.equal(files.length, 65);
  assert.deepEqual(counts, [64, 1]);
  assert.equal(released, 1);
  assert.equal(fixtureData.reads(), 0);
  materializer.acquireWorkspaceSession = () => ({
    session: { request: async () => 0 },
    release: async () => {
      released++;
    },
  });
  assert.equal(await adapter.prepareRustCheckoutSources(models, fixtureData.repository), undefined);
  assert.equal(released, 2);
  assert.equal(fixtureData.reads(), 0);
});

test('mutating the original Ref cannot redirect hydration away from the validated source hash', () => {
  const fixtureData = fixture();
  const file = adapter.createRustCheckoutSourceFile(fixtureData.model, fixtureData.repository, true);
  const originalHash = fixtureData.hash;
  const redirectedHash = '1'.repeat(40);
  fixtureData.model.file.hash = redirectedHash;
  const requested = [];
  fixtureData.repository.loadSync = (reference) => {
    requested.push(reference.toString());
    return { contents: reference.toString() === originalHash ? fixtureData.contents : Buffer.from('wrong object') };
  };
  assert.equal(adapter.getRustCheckoutSourceDescriptor(file), undefined);
  assert.equal(file.contents, fixtureData.contents);
  assert.deepEqual(requested, [originalHash]);
});
