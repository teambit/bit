const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { installed } = require('./load-source.cjs');
const objects = installed('@teambit/objects');
const sources = installed('@teambit/component.sources');
const { Scope } = installed('@teambit/legacy.scope');
const materializer = installed('@teambit/component.sources/dist/rust-workspace-materializer.js');
const query = installed('@teambit/objects/dist/objects/rust-history-query.js');

async function fixture(t, observe) {
  assert.ok(process.env.BIT_TEST_OBJECT_IMPORT, 'the compiled Rust helper is required');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-source-body-load-'));
  const scope = await Scope.ensure(path.join(directory, 'scope'), 'qualification.source-bodies');
  await scope.ensureDir();
  const previous = { flag: process.env.BIT_RUST_CLIENT_VCS, helper: process.env.BIT_RUST_OBJECT_IMPORT };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = process.env.BIT_TEST_OBJECT_IMPORT;
  const original = materializer.MaterializationSession.prototype.request;
  const frames = [];
  materializer.MaterializationSession.prototype.request = function (build, count, validate, ...rest) {
    let magic;
    return original.call(
      this,
      (id) => {
        const bytes = build(id);
        magic = bytes.subarray(0, 4).toString();
        return bytes;
      },
      count,
      (response, body) => {
        observe?.(response, body, magic);
        const accepted = !validate || validate(response, body);
        frames.push({
          magic,
          completed: response.completed,
          failed: response.failed,
          bytes: body?.length || 0,
          accepted,
        });
        return accepted;
      },
      ...rest
    );
  };
  t.after(async () => {
    materializer.MaterializationSession.prototype.request = original;
    for (const [name, value] of [
      ['BIT_RUST_CLIENT_VCS', previous.flag],
      ['BIT_RUST_OBJECT_IMPORT', previous.helper],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { repository: scope.objects, frames, run: (action) => query.withRustHistoryQueryOperation(action) };
}
async function store(repository, body) {
  const source = objects.Source.from(body),
    ref = source.hash(),
    filename = repository.objectPath(ref);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, await source.compress());
  return { ref, filename };
}
const models = (ref, count = 1) =>
  Array.from({ length: count }, (_, index) => ({
    file: ref,
    relativePath: `file-${index}.js`,
    name: `file-${index}.js`,
    test: false,
  }));

test('actual parallel Source reads hydrate canonical cache entries without collapsing concurrent misses', async (t) => {
  const f = await fixture(t),
    bytes = Buffer.from([0xef, 0xbb, 0xbf, 0xff, 0, 13, 10]);
  const { ref, filename } = await store(f.repository, bytes);
  await f.run(async () => {
    const files = await sources.prepareRustCheckoutSources(models(ref, 65), f.repository);
    assert.ok(files);
    assert.ok(
      f.frames.some((frame) => frame.magic === 'BWC2' && frame.completed === 65 && frame.bytes === bytes.length * 65)
    );
    assert.equal(
      new Set(files.map((file) => file.contents)).size,
      65,
      'each concurrent miss owns its canonical body Buffer'
    );
    files.forEach((file) => {
      assert.deepEqual(file.contents, bytes);
      assert.ok(sources.getRustCheckoutSourceDescriptor(file), 'hydrated files still support native Source writes');
      assert.equal(Object.getOwnPropertyDescriptor(file, 'contents')?.get, undefined);
    });
    const cached = f.repository.getCache(ref);
    assert.ok(files.some((file) => file.contents === cached.contents));
    await fs.unlink(filename);
    const frameCount = f.frames.length;
    const repeated = await sources.prepareRustCheckoutSources(models(ref, 2), f.repository);
    assert.ok(repeated);
    repeated.forEach((file) => assert.strictEqual(file.contents, cached.contents));
    assert.equal(f.frames.length, frameCount, 'canonical cache hits require no helper round trip');
    f.repository.removeFromCache(ref);
    assert.equal(
      await sources.prepareRustCheckoutSources(models(ref), f.repository),
      undefined,
      'a later logical cache miss must not reuse the helper cache after disk removal'
    );
    assert.deepEqual(files[0].contents, bytes, 'an already loaded public file retains its body after eviction');
  });
});

test('large Sources retain the canonical weak-only cache policy', async (t) => {
  const f = await fixture(t),
    bytes = randomBytes(128 * 1024);
  const { ref } = await store(f.repository, bytes);
  await f.run(async () => {
    const files = await sources.prepareRustCheckoutSources(models(ref), f.repository);
    assert.ok(files);
    assert.ok(f.frames.some((frame) => frame.magic === 'BWC2' && frame.completed === 1));
    assert.deepEqual(files[0].contents, bytes);
    assert.equal(f.repository.cache.has(ref.toString()), false);
    const cached = f.repository.getCache(ref);
    assert.strictEqual(cached.contents, files[0].contents);
    assert.equal(f.repository.cache.has(ref.toString()), false, 'weak-only reads must not promote large Sources');
  });
});

test('a corrupt Source returns no hydrated prefix and cannot write any public files', async (t) => {
  const f = await fixture(t);
  const good = await store(f.repository, Buffer.from('valid'));
  const bad = await store(f.repository, Buffer.from('invalid'));
  await fs.writeFile(bad.filename, Buffer.from('not zlib'));
  await f.run(async () => {
    assert.equal(
      await sources.prepareRustCheckoutSources([...models(good.ref), ...models(bad.ref)], f.repository),
      undefined
    );
    assert.equal(
      f.repository.getCache(good.ref),
      undefined,
      'no partial canonical cache commit before a complete read'
    );
    assert.ok(f.frames.some((frame) => frame.magic === 'BWC2' && frame.completed === 0 && frame.failed));
  });
});

test('invalid binary body bytes decline before committing any Source cache entries', async (t) => {
  const f = await fixture(t, (response, body) => {
    if (response.completed && body?.length) body[0] ^= 1;
  });
  const { ref } = await store(f.repository, Buffer.from('verified body'));
  await f.run(async () => {
    assert.equal(await sources.prepareRustCheckoutSources(models(ref), f.repository), undefined);
    assert.equal(f.repository.getCache(ref), undefined);
    assert.ok(f.frames.some((frame) => frame.magic === 'BWC2' && !frame.accepted));
  });
});

test('an in-flight cached load retains its selected Source after a later cache eviction', async (t) => {
  let evict;
  const f = await fixture(t, (response) => {
    if (response.completed) evict?.();
  });
  const { ref } = await store(f.repository, Buffer.from('cached body'));
  const selected = await ref.load(f.repository);
  await f.run(async () => {
    const miss = await store(f.repository, Buffer.from('concurrent miss'));
    evict = () => f.repository.removeFromCache(ref);
    const files = await sources.prepareRustCheckoutSources([...models(ref), ...models(miss.ref)], f.repository);
    assert.ok(files);
    assert.strictEqual(files[0].contents, selected.contents);
    assert.equal(f.repository.getCache(ref), undefined, 'an existing cache hit must not be reinserted after eviction');
    assert.ok(f.frames.some((frame) => frame.magic === 'BWC2' && frame.completed === 1));
  });
});

test('a replaced Source body reader export declines without invoking its accessor', async (t) => {
  const f = await fixture(t),
    body = Buffer.from('canonical fallback');
  const { ref } = await store(f.repository, body);
  const module = installed('@teambit/component.sources/dist/rust-checkout-source-bodies.js');
  const original = Object.getOwnPropertyDescriptor(module, 'readRustCheckoutSourceBodies');
  let reads = 0;
  try {
    Object.defineProperty(module, 'readRustCheckoutSourceBodies', {
      configurable: true,
      get() {
        reads++;
        return original.value;
      },
    });
    await f.run(async () => {
      const files = await sources.prepareRustCheckoutSources(models(ref), f.repository);
      assert.ok(files);
      assert.deepEqual(files[0].contents, body);
      assert.equal(
        f.frames.some((frame) => frame.magic === 'BWC2'),
        false
      );
    });
  } finally {
    Object.defineProperty(module, 'readRustCheckoutSourceBodies', original);
  }
  assert.equal(reads, 0);
});

test('zero-byte Source bodies are successful reads, not missing cache receipts', async (t) => {
  const f = await fixture(t),
    { ref } = await store(f.repository, Buffer.alloc(0));
  await f.run(async () => {
    const files = await sources.prepareRustCheckoutSources(models(ref, 2), f.repository);
    assert.ok(files);
    assert.equal(files[0].contents.length, 0);
    assert.notStrictEqual(files[0].contents, files[1].contents);
    assert.ok(f.repository.getCache(ref));
    assert.ok(f.frames.some((frame) => frame.magic === 'BWC2' && frame.completed === 2 && frame.bytes === 0));
  });
});

test('eager file provenance follows owned bytes after cache replacement and rejects changed public behavior', async (t) => {
  const f = await fixture(t);
  const bytes = Buffer.from('owned source bytes');
  const { ref } = await store(f.repository, bytes);
  await f.run(async () => {
    const [file] = await sources.prepareRustCheckoutSources(models(ref), f.repository);
    const descriptor = sources.getRustCheckoutSourceDescriptor(file);
    assert.ok(descriptor);
    f.repository.objects[ref.toString()] = objects.Source.from(Buffer.from('replacement cache entry'));
    assert.deepEqual(file.contents, bytes);
    assert.deepEqual(sources.getRustCheckoutSourceDescriptor(file), descriptor);
    file.contents[0] ^= 1;
    assert.equal(sources.getRustCheckoutSourceDescriptor(file), undefined);
    file.contents[0] ^= 1;
    let calls = 0;
    Object.defineProperty(file, 'write', {
      configurable: true,
      get() {
        calls++;
        return undefined;
      },
    });
    assert.equal(sources.getRustCheckoutSourceDescriptor(file), undefined);
    assert.equal(calls, 0);
    delete file.write;
    Object.defineProperty(file.contents, 'toString', {
      configurable: true,
      get() {
        calls++;
        return undefined;
      },
    });
    assert.equal(sources.getRustCheckoutSourceDescriptor(file), undefined);
    assert.equal(calls, 0);
    delete file.contents.toString;
    assert.deepEqual(sources.getRustCheckoutSourceDescriptor(file), descriptor);
  });
});

test('native file status preserves first matching paths, target order and raw EOL differences', async (t) => {
  const f = await fixture(t);
  const { ref } = await store(f.repository, Buffer.from('source\r\n'));
  await f.run(async () => {
    const targets = await sources.prepareRustCheckoutSources(models(ref, 3), f.repository);
    const current = [
      new sources.SourceFile({ base: '.', path: 'file-1.js', contents: Buffer.from('source\n') }),
      new sources.SourceFile({ base: '.', path: 'file-0.js', contents: Buffer.from('source\r\n') }),
      new sources.SourceFile({ base: '.', path: 'file-1.js', contents: Buffer.from('source\r\n') }),
    ];
    for (const file of current) {
      const hash = objects.Source.from(file.contents).hash().toString();
      sources.registerRustWorkspaceFile(file, { path: file.path, contents: file.contents, hash, linuxHash: hash });
    }
    assert.deepEqual(await sources.getRustFileStatuses(targets, current), [
      { relativePath: 'file-0.js', unchanged: true },
      { relativePath: 'file-1.js', unchanged: false },
      { relativePath: 'file-2.js', unchanged: false },
    ]);
    assert.ok(f.frames.some((frame) => frame.magic === 'BWS1' && frame.completed === 3));
    current[1].contents[0] ^= 1;
    assert.equal(await sources.getRustFileStatuses(targets, current), undefined, 'changed bytes invalidate identity');
    current[1].contents[0] ^= 1;
    let calls = 0;
    Object.defineProperty(current[0], 'relative', {
      get() {
        calls++;
        return 'file-1.js';
      },
    });
    assert.equal(await sources.getRustFileStatuses(targets, current), undefined);
    assert.equal(calls, 0, 'speculative matching must not invoke a custom path getter');
  });
});

test('file status discards a native response when a public body changes during the request', async (t) => {
  let mutate;
  const f = await fixture(t, (_, __, magic) => {
    if (magic === 'BWS1') mutate?.();
  });
  const { ref } = await store(f.repository, Buffer.from('status bytes'));
  await f.run(async () => {
    const files = await sources.prepareRustCheckoutSources(models(ref), f.repository);
    mutate = () => {
      files[0].contents[0] ^= 1;
    };
    assert.equal(await sources.getRustFileStatuses(files, files), undefined);
    assert.ok(f.frames.some((frame) => frame.magic === 'BWS1' && frame.completed === 1));
  });
});

test('owned Source snapshots detect mutations without invoking public Buffer methods', async (t) => {
  const f = await fixture(t);
  const { ref } = await store(f.repository, Buffer.from('owned cached bytes'));
  const api = installed('@teambit/objects/dist/objects/rust-history-query-sources.js');
  await f.run(async () => {
    const [file] = await sources.prepareRustCheckoutSources(models(ref), f.repository);
    const cached = f.repository.getCache(ref);
    assert.equal(api.hasRustCapturedSourceContents(cached, ref.toString(), file.contents), true);
    file.contents[0] ^= 1;
    assert.equal(api.hasRustCapturedSourceContents(cached, ref.toString(), file.contents), false);
    file.contents[0] ^= 1;
    let calls = 0;
    Object.defineProperty(file.contents, 'equals', {
      configurable: true,
      get() {
        calls++;
        throw new Error('custom equals');
      },
    });
    assert.equal(api.hasRustCapturedSourceContents(cached, ref.toString(), file.contents), true);
    assert.equal(calls, 0);
    delete file.contents.equals;
    cached.contents = Buffer.from(file.contents);
    assert.equal(api.hasRustCapturedSourceContents(cached, ref.toString(), cached.contents), false);
    const [reloaded] = await sources.prepareRustCheckoutSources(models(ref), f.repository);
    assert.strictEqual(reloaded.contents, cached.contents, 'new aliases are verified with the canonical body hash');
  });
});

test('ordinary model loads own only their Source batch and return eager bodies after the owner closes', async (t) => {
  const f = await fixture(t),
    bytes = Buffer.from('source body read exactly once\r\n');
  const { ref, filename } = await store(f.repository, bytes);
  assert.equal(query.isRustHistoryQueryOperation(), false);
  const files = await sources.prepareRustCheckoutSources(models(ref, 65), f.repository, true);
  assert.ok(files);
  assert.equal(files.length, 65);
  assert.equal(query.isRustHistoryQueryOperation(), false, 'read ownership must end with the model load');
  assert.ok(f.frames.some((frame) => frame.magic === 'BWC2' && frame.accepted && frame.bytes > 0));
  assert.ok(!f.frames.some((frame) => frame.magic === 'BWC0'), 'eager loading must not also preflight the same bodies');
  await fs.unlink(filename);
  for (const file of files) {
    assert.deepEqual(file.contents, bytes);
    assert.equal(sources.getRustCheckoutSourceDescriptor(file)?.hash, ref.toString());
  }
  const cached = f.repository.getCache(ref);
  assert.ok(cached);
  assert.deepEqual(cached.contents, bytes);
});
