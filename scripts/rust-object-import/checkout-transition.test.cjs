const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { installed, source, root } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_CHECKOUT_TRANSITION_COMPILED === '1';
const sourcesDirectory = path.dirname(installed.resolve('@teambit/component.sources'));
const moduleAt = (name) =>
  compiled ? require(path.join(sourcesDirectory, `${name}.js`)) : source(`scopes/component/sources/${name}.ts`);
const materializer = moduleAt('rust-workspace-materializer');
const engine = moduleAt('rust-workspace-engine');
const restoredContexts = new WeakSet();

async function fakeOwner(t, request) {
  if (!restoredContexts.has(t)) {
    restoredContexts.add(t);
    const acquire = materializer.acquireWorkspaceSession;
    const flag = process.env.BIT_RUST_CLIENT_VCS;
    t.after(() => {
      materializer.acquireWorkspaceSession = acquire;
      if (flag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
      else process.env.BIT_RUST_CLIENT_VCS = flag;
    });
  }
  const effects = { acquisitions: 0, releases: 0, disposals: 0 };
  const physical = {
    usable: true,
    request,
    async dispose() {
      effects.disposals++;
      this.usable = false;
    },
  };
  materializer.acquireWorkspaceSession = () => {
    effects.acquisitions++;
    return {
      session: physical,
      executable: '/qualification/helper',
      async release() {
        effects.releases++;
      },
    };
  };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  return { effects, physical };
}

test('nested concurrent operations serialize frames without serializing public callback scopes', async (t) => {
  const events = [];
  let active = 0;
  let maximum = 0;
  const { effects } = await fakeOwner(t, async (name) => {
    maximum = Math.max(maximum, ++active);
    events.push(`request:${name}`);
    await new Promise((resolve) => setImmediate(resolve));
    active--;
    return name;
  });
  await engine.withRustWorkspaceEngine(async () => {
    const owner = engine.workspaceEngineSession().session;
    await Promise.all(
      ['first', 'second'].map((name) =>
        engine.withRustWorkspaceEngine(async () => {
          assert.equal(engine.workspaceEngineSession().session, owner);
          events.push(`callback:${name}`);
          assert.equal(await owner.request(name), name);
        })
      )
    );
  });
  assert.equal(maximum, 1);
  assert.deepEqual(events.slice(0, 2), ['callback:first', 'callback:second']);
  assert.deepEqual(
    events.filter((event) => event.startsWith('request:')),
    ['request:first', 'request:second']
  );
  assert.deepEqual(effects, { acquisitions: 1, releases: 1, disposals: 0 });
  assert.deepEqual(engine.workspaceEngineSession(), { owned: false });
});

test('lost engine response retires queued work and never acquires a replacement for the suffix', async (t) => {
  const frames = [];
  const { effects } = await fakeOwner(t, async (name) => {
    frames.push(name);
    return undefined;
  });
  await engine.withRustWorkspaceEngine(async () => {
    const session = engine.workspaceEngineSession().session;
    assert.deepEqual(await Promise.all([session.request('lost'), session.request('queued')]), [undefined, undefined]);
    assert.equal(engine.isRustWorkspaceEngine(), false);
    assert.deepEqual(engine.workspaceEngineSession().session, undefined);
    await engine.withRustWorkspaceEngine(async () => {
      assert.equal(engine.workspaceEngineSession().owned, true);
      assert.equal(engine.workspaceEngineSession().session, undefined);
    });
  });
  assert.deepEqual(frames, ['lost']);
  assert.deepEqual(effects, { acquisitions: 1, releases: 1, disposals: 1 });
});

test('cleanup keeps reverse acquisition order and preserves the original public failure identity', async (t) => {
  const { effects } = await fakeOwner(t, async () => true);
  const failure = new Error('public writer failed');
  const events = [];
  await assert.rejects(
    engine.withRustWorkspaceEngine(async () => {
      engine.registerRustWorkspaceEngineCleanup(() => {
        events.push('first');
      });
      engine.registerRustWorkspaceEngineCleanup(() => {
        events.push('second');
        throw new Error('cleanup failure');
      });
      throw failure;
    }),
    (error) => error === failure
  );
  assert.deepEqual(events, ['second', 'first']);
  assert.equal(effects.releases, 1);
  assert.equal(
    engine.registerRustWorkspaceEngineCleanup(() => {}),
    false
  );
});

test('an explicitly retired engine keeps compatibility cleanup alive without issuing more frames', async (t) => {
  const frames = [];
  const { effects } = await fakeOwner(t, async (name) => {
    frames.push(name);
    return name;
  });
  let cleanups = 0;
  await engine.withRustWorkspaceEngine(async () => {
    const session = engine.workspaceEngineSession().session;
    assert.equal(await session.request('before'), 'before');
    engine.registerRustWorkspaceEngineCleanup(() => {
      cleanups++;
    });
    await engine.retireRustWorkspaceEngine();
    assert.equal(await session.request('after'), undefined);
    assert.equal(engine.workspaceEngineSession().owned, true);
  });
  assert.deepEqual(frames, ['before']);
  assert.equal(cleanups, 1);
  assert.deepEqual(effects, { acquisitions: 1, releases: 1, disposals: 1 });
});

test('prompt retirement hydrates escaped values and removes their backing files before awaiting input', async (t) => {
  await fakeOwner(t, async () => undefined);
  const events = [];
  await engine.withRustWorkspaceEngine(async () => {
    engine.registerRustWorkspaceEngineCleanup(() => events.push('remove'));
    engine.registerRustWorkspaceEngineCleanup(() => events.push('hydrate'));
    await engine.retireRustWorkspaceEngine(true);
    assert.deepEqual(events, ['hydrate', 'remove']);
    assert.equal(engine.isRustWorkspaceEngine(), false);
    await engine.retireRustWorkspaceEngine(true);
    assert.deepEqual(events, ['hydrate', 'remove']);
  });
  assert.deepEqual(events, ['hydrate', 'remove']);
});

test('prompt retirement still removes private files after a hydration failure', async (t) => {
  await fakeOwner(t, async () => undefined);
  const failure = new Error('hydrate');
  let removed = 0;
  await engine.withRustWorkspaceEngine(async () => {
    engine.registerRustWorkspaceEngineCleanup(() => removed++);
    engine.registerRustWorkspaceEngineCleanup(() => {
      throw failure;
    });
    await assert.rejects(engine.retireRustWorkspaceEngine(true), (error) => error === failure);
    assert.equal(removed, 1);
  });
  assert.equal(removed, 1);
});

test('escaped borrowed sessions are closed after the outer operation rather than after nested callbacks', async (t) => {
  const frames = [];
  const { effects } = await fakeOwner(t, async (name) => {
    frames.push(name);
    return name;
  });
  let escaped;
  await engine.withRustWorkspaceEngine(async () => {
    await engine.withRustWorkspaceEngine(async () => {
      escaped = engine.workspaceEngineSession().session;
    });
    assert.equal(effects.releases, 0);
    assert.equal(await escaped.request('outer-suffix'), 'outer-suffix');
  });
  assert.equal(escaped.usable, false);
  assert.equal(await escaped.request('escaped'), undefined);
  assert.deepEqual(frames, ['outer-suffix']);
  assert.equal(effects.releases, 1);
});

test('physical request errors preserve identity while queued work and the canonical suffix remain retired', async (t) => {
  const failure = new Error('physical read failed');
  let calls = 0;
  const { effects } = await fakeOwner(t, async () => {
    calls++;
    throw failure;
  });
  await engine.withRustWorkspaceEngine(async () => {
    const session = engine.workspaceEngineSession().session;
    const results = await Promise.allSettled([session.request('failing'), session.request('queued')]);
    assert.equal(results[0].reason, failure);
    assert.deepEqual(results[1], { status: 'fulfilled', value: undefined });
    assert.equal(engine.workspaceEngineSession().session, undefined);
  });
  assert.equal(calls, 1);
  assert.deepEqual(effects, { acquisitions: 1, releases: 1, disposals: 1 });
});

test('successful public callbacks expose cleanup failure only after running every registered cleanup', async (t) => {
  const { effects } = await fakeOwner(t, async () => true);
  const failure = new Error('capsule cleanup failed');
  const events = [];
  await assert.rejects(
    engine.withRustWorkspaceEngine(async () => {
      engine.registerRustWorkspaceEngineCleanup(() => {
        events.push('first');
      });
      engine.registerRustWorkspaceEngineCleanup(() => {
        events.push('second');
        throw failure;
      });
      return 'public result';
    }),
    (error) => error === failure
  );
  assert.deepEqual(events, ['second', 'first']);
  assert.equal(effects.releases, 1);
});

test('lease release failures cannot replace public errors, including falsy thrown values', async (t) => {
  const { effects } = await fakeOwner(t, async () => true);
  const acquire = materializer.acquireWorkspaceSession;
  const releaseFailure = new Error('lease release failed');
  materializer.acquireWorkspaceSession = () => {
    const lease = acquire(),
      release = lease.release;
    lease.release = async () => {
      await release();
      throw releaseFailure;
    };
    return lease;
  };
  for (const failure of [new Error('public failure'), 0, null, undefined]) {
    let cleanup = 0;
    const result = await Promise.allSettled([
      engine.withRustWorkspaceEngine(async () => {
        engine.registerRustWorkspaceEngineCleanup(() => {
          cleanup++;
        });
        throw failure;
      }),
    ]);
    assert.equal(result[0].status, 'rejected');
    assert.equal(result[0].reason, failure);
    assert.equal(cleanup, 1);
  }
  await assert.rejects(
    engine.withRustWorkspaceEngine(async () => 'successful action'),
    (error) => error === releaseFailure
  );
  assert.equal(effects.releases, 5);
});

async function plannedFixture(t) {
  await fakeOwner(t, async () => true);
  const plan = moduleAt('rust-checkout-plan-source');
  const SourceFile = compiled
    ? require(path.join(sourcesDirectory, 'source-file.js')).default
    : source('scopes/component/sources/source-file.ts').default;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-checkout-capsule-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const contents = Buffer.from('\ufefforiginal retained bytes\r\n');
  const snapshotPath = path.join(directory, 'snapshot');
  await fs.writeFile(snapshotPath, contents);
  const descriptor = {
    token: 'a'.repeat(40),
    planIndex: 0,
    snapshotPath,
    snapshotHash: createHash('sha1').update(contents).digest('hex'),
    bytes: contents.length,
  };
  const template = () =>
    new SourceFile({
      cwd: directory,
      base: directory,
      path: path.join(directory, 'index.js'),
      contents: Buffer.from('template'),
    });
  return { plan, directory, contents, descriptor, template };
}

test('retained plan clones share Buffer aliases and become eager before private capsule cleanup', async (t) => {
  const { plan, directory, contents, descriptor, template } = await plannedFixture(t);
  let original, clone;
  await engine.withRustWorkspaceEngine(async () => {
    engine.registerRustWorkspaceEngineCleanup(() => fs.rm(directory, { recursive: true, force: true }));
    original = plan.createRustCheckoutPlanSourceFile(template(), descriptor);
    assert.ok(original);
    clone = original.clone();
    assert.deepEqual(plan.getRustCheckoutPlanSourceDescriptor(clone), descriptor);
    assert.equal(typeof Object.getOwnPropertyDescriptor(original, 'contents').get, 'function');
    assert.equal(typeof Object.getOwnPropertyDescriptor(clone, 'contents').get, 'function');
  });
  await assert.rejects(fs.stat(directory), { code: 'ENOENT' });
  assert.deepEqual(original.contents, contents);
  assert.equal(original.contents, clone.contents, 'default clone retains original Buffer alias');
  assert.equal(Object.getOwnPropertyDescriptor(original, 'contents'), undefined, 'escaped original is no longer lazy');
  assert.equal(Object.getOwnPropertyDescriptor(clone, 'contents'), undefined, 'escaped clone is no longer lazy');
  assert.equal(plan.getRustCheckoutPlanSourceDescriptor(original), undefined);
});

test('in-place shared body mutation invalidates both descriptors, while assignment invalidates only its receiver', async (t) => {
  const { plan, descriptor, template } = await plannedFixture(t);
  await engine.withRustWorkspaceEngine(async () => {
    const original = plan.createRustCheckoutPlanSourceFile(template(), descriptor);
    const clone = original.clone();
    assert.equal(original.contents, clone.contents);
    assert.ok(plan.getRustCheckoutPlanSourceDescriptor(original));
    original.contents[0] ^= 1;
    assert.equal(plan.getRustCheckoutPlanSourceDescriptor(original), undefined);
    assert.equal(plan.getRustCheckoutPlanSourceDescriptor(clone), undefined);
    const second = plan.createRustCheckoutPlanSourceFile(template(), descriptor);
    const secondClone = second.clone();
    second.contents = Buffer.from('assigned override');
    assert.equal(plan.getRustCheckoutPlanSourceDescriptor(second), undefined);
    assert.deepEqual(plan.getRustCheckoutPlanSourceDescriptor(secondClone), descriptor);
    assert.deepEqual(second.contents, Buffer.from('assigned override'));
  });
});

test('custom getter, clone and writer hooks decline retained provenance without speculative invocation', async (t) => {
  const { plan, descriptor, template } = await plannedFixture(t);
  let calls = 0;
  await engine.withRustWorkspaceEngine(async () => {
    for (const name of ['path', 'contents', 'clone', 'write']) {
      const file = template();
      if (name === 'path' || name === 'contents')
        Object.defineProperty(file, name, {
          configurable: true,
          get() {
            calls++;
            throw new Error('custom getter');
          },
        });
      else
        file[name] = () => {
          calls++;
          throw new Error('custom hook');
        };
      assert.equal(plan.createRustCheckoutPlanSourceFile(file, descriptor), undefined, name);
      assert.equal(calls, 0, 'native eligibility must not execute hooks');
    }
  });
});

test('a preloaded canonical Source Buffer stays aliased across planned public clones', async (t) => {
  const { plan, contents, descriptor, template } = await plannedFixture(t);
  await engine.withRustWorkspaceEngine(async () => {
    const canonicalBuffer = Buffer.from(contents);
    const file = plan.createRustCheckoutPlanSourceFile(template(), descriptor, canonicalBuffer);
    assert.ok(file);
    const clone = file.clone();
    assert.equal(file.contents, canonicalBuffer);
    assert.equal(clone.contents, canonicalBuffer);
    canonicalBuffer[0] ^= 1;
    assert.equal(plan.getRustCheckoutPlanSourceDescriptor(file), undefined);
    assert.equal(plan.getRustCheckoutPlanSourceDescriptor(clone), undefined);
    assert.equal(
      plan.createRustCheckoutPlanSourceFile(template(), descriptor, canonicalBuffer),
      undefined,
      'mismatched cached body cannot claim snapshot provenance'
    );
  });
});

test('in-place capsule replacement preserves object identity and can install compatibility bytes after retirement', async (t) => {
  const { plan, directory, contents, descriptor, template } = await plannedFixture(t);
  const replacement = Buffer.from('replacement compatibility bytes\r\n');
  const snapshotPath = path.join(directory, 'replacement');
  await fs.writeFile(snapshotPath, replacement);
  const next = {
    ...descriptor,
    planIndex: 1,
    snapshotPath,
    snapshotHash: createHash('sha1').update(replacement).digest('hex'),
    bytes: replacement.length,
  };
  const original = template();
  let clone;
  await engine.withRustWorkspaceEngine(async () => {
    engine.registerRustWorkspaceEngineCleanup(() => fs.rm(directory, { recursive: true, force: true }));
    assert.equal(plan.installRustCheckoutPlanSourceContents(original, descriptor), true);
    clone = original.clone();
    await engine.retireRustWorkspaceEngine();
    assert.equal(
      plan.installRustCheckoutPlanSourceContents(original, next),
      true,
      'retired engine still owns compatibility cleanup'
    );
    assert.equal(
      plan.getRustCheckoutPlanSourceDescriptor(original),
      undefined,
      'retirement cannot re-enable native writes'
    );
  });
  assert.deepEqual(original.contents, replacement);
  assert.deepEqual(
    clone.contents,
    contents,
    'prior clone keeps the original capsule rather than receiving replacement bytes'
  );
  assert.equal(Object.getOwnPropertyDescriptor(original, 'contents'), undefined);
  assert.equal(Object.getOwnPropertyDescriptor(clone, 'contents'), undefined);
  await assert.rejects(fs.stat(directory), { code: 'ENOENT' });
});

test('a custom numeric history getter declines the factory before metadata path reads', async (t) => {
  const { plan, descriptor, template } = await plannedFixture(t);
  let calls = 0;
  await engine.withRustWorkspaceEngine(async () => {
    const file = template();
    Object.defineProperty(file.history, '0', {
      configurable: true,
      enumerable: true,
      get() {
        calls++;
        throw new Error('custom history');
      },
    });
    assert.equal(plan.createRustCheckoutPlanSourceFile(file, descriptor), undefined);
    assert.equal(calls, 0);
  });
});

test('transformed root bitmap provenance is opt-in, rejects mutation and never normalizes custom CR bytes', async (t) => {
  const { directory, template } = await plannedFixture(t);
  const identity = moduleAt('rust-workspace-identity');
  const raw = Buffer.from('// disk bitmap comments\r\n{"component":{"rootDir":"component","version":"1.0.1"}}\r\n');
  const normalized = Buffer.from('{"component":{"rootDir":"component"}}\n');
  const sha1 = (bytes) => createHash('sha1').update(bytes).digest('hex');
  const file = template();
  file.path = path.join(directory, '.bitmap');
  file.contents = normalized;
  const read = { path: file.path, contents: raw, hash: sha1(raw), linuxHash: sha1(raw) };
  identity.registerRustWorkspaceBitmapFile(file, read);
  assert.equal(
    identity.getRustWorkspaceMergeDescriptor(file),
    undefined,
    'old merge kernels do not opt into transformed bitmap bytes'
  );
  assert.deepEqual(identity.getRustWorkspaceMergeDescriptor(file, true), {
    path: file.path,
    hash: sha1(raw),
    linuxHash: sha1(normalized),
    snapshotHash: sha1(normalized),
    bitmap: true,
  });
  file.contents[0] ^= 1;
  assert.equal(identity.getRustWorkspaceMergeDescriptor(file, true), undefined);
  const custom = template();
  custom.path = path.join(directory, '.bitmap');
  custom.contents = Buffer.from('custom callback\r\n');
  identity.registerRustWorkspaceBitmapFile(custom, { ...read, path: custom.path });
  assert.equal(
    identity.getRustWorkspaceMergeDescriptor(custom, true),
    undefined,
    'custom CR callback output remains canonical'
  );
});

test('escaped plan files cannot reuse old operation tokens in a fresh engine owner', async (t) => {
  const { plan, directory, contents, descriptor, template } = await plannedFixture(t);
  let escaped,
    frames = 0;
  await engine.withRustWorkspaceEngine(async () => {
    escaped = plan.createRustCheckoutPlanSourceFile(template(), descriptor);
  });
  await engine.withRustWorkspaceEngine(async () => {
    assert.equal(plan.getRustCheckoutPlanSourceDescriptor(escaped), undefined);
    assert.equal(materializer.hasNativeChunk([escaped], 1), false);
    await materializer.persistFilesInSession([escaped], 1, {
      usable: true,
      async request() {
        frames++;
        throw new Error('old token sent to a new process');
      },
      async write() {
        frames++;
        throw new Error('old plan cannot silently switch to raw native kernel');
      },
      async dispose() {},
    });
  });
  assert.equal(frames, 0);
  assert.deepEqual(
    await fs.readFile(path.join(directory, 'index.js')),
    installed('@teambit/toolbox.string.eol').auto(contents)
  );
});

test('late inherited Vinyl accessors decline privately while canonical write reads once and cleanup adds no setter calls', async (t) => {
  const { plan, contents, descriptor, template } = await plannedFixture(t);
  let prototype = Object.getPrototypeOf(template());
  while (!Object.hasOwn(prototype, 'contents')) prototype = Object.getPrototypeOf(prototype);
  const original = Object.getOwnPropertyDescriptor(prototype, 'contents');
  // Vinyl's own descriptor is non-configurable; a derived Vinyl prototype can legitimately shadow it.
  const mutablePrototype = Object.getPrototypeOf(Object.getPrototypeOf(template()));
  const previousOwn = Object.getOwnPropertyDescriptor(mutablePrototype, 'contents');
  let getters = 0,
    setters = 0,
    frames = 0,
    file,
    escapedClone;
  try {
    await engine.withRustWorkspaceEngine(async () => {
      file = plan.createRustCheckoutPlanSourceFile(template(), descriptor);
      escapedClone = file.clone();
      Object.defineProperty(mutablePrototype, 'contents', {
        ...original,
        configurable: true,
        get() {
          getters++;
          return original.get.call(this);
        },
        set(value) {
          setters++;
          return original.set.call(this, value);
        },
      });
      assert.equal(plan.getRustCheckoutPlanSourceDescriptor(file), undefined);
      assert.equal(materializer.hasNativeChunk([file], 1), false);
      assert.equal(getters, 0);
      assert.equal(setters, 0);
      await materializer.persistFilesInSession([file], 1, {
        usable: true,
        async request() {
          frames++;
          throw new Error('custom inherited accessor entered native kernel');
        },
        async write() {
          frames++;
          throw new Error('custom inherited accessor entered raw kernel');
        },
        async dispose() {},
      });
      assert.equal(getters, 1, 'canonical default writer observes the live inherited getter once');
      assert.equal(setters, 0, 'compatibility hydration is not a new public setter callback');
    });
    assert.equal(getters, 1);
    assert.equal(setters, 0, 'outer cleanup hydrates unused escaped clone without extra live setter invocation');
    assert.equal(frames, 0);
  } finally {
    if (previousOwn) Object.defineProperty(mutablePrototype, 'contents', previousOwn);
    else delete mutablePrototype.contents;
  }
  assert.equal(Object.getOwnPropertyDescriptor(escapedClone, 'contents'), undefined);
  assert.deepEqual(escapedClone.contents, contents);
});

test('frozen and sealed planned files retain canonical contents, cloning and writes after private cleanup', async (t) => {
  const { plan, directory, contents, descriptor, template } = await plannedFixture(t);
  const escaped = [];
  await engine.withRustWorkspaceEngine(async () => {
    engine.registerRustWorkspaceEngineCleanup(() => fs.rm(directory, { recursive: true, force: true }));
    assert.equal(
      plan.createRustCheckoutPlanSourceFile(Object.freeze(template()), descriptor),
      undefined,
      'initial nonextensible metadata cannot be overwritten'
    );
    for (const freeze of [Object.freeze, Object.seal]) {
      const file = plan.createRustCheckoutPlanSourceFile(template(), descriptor);
      const unread = plan.createRustCheckoutPlanSourceFile(template(), descriptor);
      freeze(file);
      freeze(unread);
      assert.equal(plan.getRustCheckoutPlanSourceDescriptor(file), undefined);
      assert.equal(materializer.hasNativeChunk([file], 1), false);
      assert.deepEqual(file.contents, contents, 'frozen lazy getter returns retained body without replacing fields');
      const clone = file.clone();
      assert.equal(clone.contents, file.contents, 'canonical default clone retains the public Buffer alias');
      await file.write();
      assert.deepEqual(
        await fs.readFile(path.join(directory, 'index.js')),
        installed('@teambit/toolbox.string.eol').auto(contents)
      );
      escaped.push(file, unread, clone);
    }
  });
  await assert.rejects(fs.stat(directory), { code: 'ENOENT' });
  for (const file of escaped)
    assert.deepEqual(
      file.contents,
      contents,
      'even an unread nonconfigurable getter is hydrated before private files disappear'
    );
});

test('nonconfigurable planned contents preserve frozen assignment errors and sealed replacement aliases', async (t) => {
  const { plan, directory, contents, descriptor, template } = await plannedFixture(t);
  const replacement = Buffer.from('replacement body\n');
  let frozen, sealed, previousClone;
  await engine.withRustWorkspaceEngine(async () => {
    engine.registerRustWorkspaceEngineCleanup(() => fs.rm(directory, { recursive: true, force: true }));
    frozen = plan.createRustCheckoutPlanSourceFile(template(), descriptor);
    sealed = plan.createRustCheckoutPlanSourceFile(template(), descriptor);
    previousClone = sealed.clone();
    Object.freeze(frozen);
    Object.seal(sealed);
    assert.throws(() => {
      frozen.contents = replacement;
    }, TypeError);
    sealed.contents = replacement;
    assert.equal(sealed.contents, replacement, 'sealed assignment exposes the exact new Buffer');
    assert.deepEqual(previousClone.contents, contents, 'a prior clone retains the original body');
    assert.equal(plan.getRustCheckoutPlanSourceDescriptor(sealed), undefined);
  });
  await assert.rejects(fs.stat(directory), { code: 'ENOENT' });
  assert.deepEqual(frozen.contents, contents, 'failed assignment must retain unread cleanup provenance');
  assert.equal(sealed.contents, replacement);
  assert.deepEqual(previousClone.contents, contents);
});

test('initial defining EOL and binary classifier hooks decline without speculative calls', async (t) => {
  const { plan, descriptor, template } = await plannedFixture(t);
  const eolModule = installed(path.join(path.dirname(installed.resolve('@teambit/toolbox.string.eol')), 'eol.js'));
  const binary = installed('isbinaryfile');
  let calls = 0;
  await engine.withRustWorkspaceEngine(async () => {
    const file = plan.createRustCheckoutPlanSourceFile(template(), descriptor);
    assert.ok(
      plan.captureRustCheckoutPlanWriteContinuation(file),
      'ordinary defining EOL module must be compiled into the candidate'
    );
    for (const [module, name] of [
      [eolModule, 'auto'],
      [binary, 'isBinaryFileSync'],
    ]) {
      const original = Object.getOwnPropertyDescriptor(module, name);
      for (const accessor of [false, true]) {
        try {
          Object.defineProperty(
            module,
            name,
            accessor
              ? {
                  configurable: true,
                  get() {
                    calls++;
                    throw new Error('custom classifier getter');
                  },
                }
              : {
                  configurable: true,
                  writable: true,
                  value() {
                    calls++;
                    throw new Error('custom classifier');
                  },
                }
          );
          assert.equal(plan.captureRustCheckoutPlanWriteContinuation(file), undefined);
          assert.equal(calls, 0);
        } finally {
          Object.defineProperty(module, name, original);
        }
      }
    }
  });
});

test('planned materialization preserves captured destinations and bodies across prefix ACKs and later frames', async (t) => {
  for (const failure of ['partial-prefix', 'lost-response', 'later-frame']) {
    const { plan, directory, contents, descriptor, template } = await plannedFixture(t);
    const fsExtra = installed('fs-extra');
    const eolModule = installed(path.join(path.dirname(installed.resolve('@teambit/toolbox.string.eol')), 'eol.js'));
    const { logger } = installed('@teambit/legacy.logger');
    const binary = installed('isbinaryfile');
    const originals = {
      outputFile: Object.getOwnPropertyDescriptor(fsExtra, 'outputFile'),
      auto: Object.getOwnPropertyDescriptor(eolModule, 'auto'),
      debug: Object.getOwnPropertyDescriptor(logger, 'debug'),
      binary: Object.getOwnPropertyDescriptor(binary, 'isBinaryFileSync'),
      stdout: process.stdout.write,
    };
    const outputFile = fsExtra.outputFile;
    const expected = eolModule.auto(contents);
    const writes = [],
      frames = [],
      logMessages = [];
    let lateCalls = 0,
      files;
    process.stdout.write = function (bytes, ...args) {
      const text = String(bytes);
      if (text.startsWith('writing a file to the file-system at ')) {
        logMessages.push(text.trim());
        const callback = args.find((arg) => typeof arg === 'function');
        callback?.();
        return true;
      }
      return originals.stdout.call(this, bytes, ...args);
    };
    const session = {
      usable: true,
      async dispose() {
        this.usable = false;
      },
      async request(build, count, validate) {
        const input = JSON.parse(build(frames.length + 1).subarray(12));
        assert.equal(input.kind, 'checkoutMaterialize');
        frames.push(input);
        const completed =
          failure === 'lost-response'
            ? 0
            : failure === 'later-frame' && frames.length === 1
              ? input.files.length
              : failure === 'later-frame'
                ? 0
                : 1;
        for (const row of input.files.slice(0, completed)) {
          writes.push(row.path);
          await outputFile(row.path, expected);
          await fs.utimes(row.path, new Date(1000000), new Date(1000000));
        }
        for (const file of files) {
          file.contents = Buffer.from('late public body');
          file.path = path.join(directory, 'late', path.basename(file.path));
          file.write = () => {
            lateCalls++;
            throw new Error('late writer must not run');
          };
          file.verbose = false;
        }
        fsExtra.outputFile = () => {
          lateCalls++;
          throw new Error('late outputFile must not run');
        };
        eolModule.auto = () => {
          lateCalls++;
          throw new Error('late EOL must not run');
        };
        logger.debug = () => {
          lateCalls++;
          throw new Error('late debug must not run');
        };
        binary.isBinaryFileSync = () => {
          lateCalls++;
          throw new Error('late binary classifier must not run');
        };
        if (failure === 'lost-response' || (failure === 'later-frame' && frames.length > 1)) return undefined;
        assert.equal(count, 1);
        assert.equal(
          validate({
            completed: 1,
            failed: false,
            data: { completed, skipped: [], failed: completed < input.files.length },
          }),
          true
        );
        return 1;
      },
    };
    try {
      await engine.withRustWorkspaceEngine(async () => {
        files = Array.from({ length: 66 }, (_, index) => {
          const file = plan.createRustCheckoutPlanSourceFile(template(), { ...descriptor, planIndex: index });
          file.path = path.join(directory, 'destinations', `file-${index}.txt`);
          file.verbose = true;
          return file;
        });
        await materializer.persistFilesInSession(files, 66, session);
        assert.equal(session.usable, false, 'physical helper is retired before canonical suffix');
      });
      assert.equal(lateCalls, 0);
      assert.equal(logMessages.length, 66, 'every original default write prefix logs exactly once');
      assert.equal(new Set(logMessages).size, 66);
      for (let index = 0; index < 66; index++)
        assert.deepEqual(await fs.readFile(path.join(directory, 'destinations', `file-${index}.txt`)), expected);
      await assert.rejects(fs.stat(path.join(directory, 'late')), { code: 'ENOENT' });
      assert.equal(frames.length, failure === 'later-frame' ? 2 : 1);
      assert.equal(writes.length, failure === 'later-frame' ? 64 : failure === 'partial-prefix' ? 1 : 0);
      for (const filename of writes)
        assert.equal((await fs.stat(filename)).mtimeMs, 1000000, 'acknowledged prefix must not be rewritten');
      if (failure === 'later-frame')
        assert.ok(
          frames[1].files.every((row) => path.dirname(row.path) === path.join(directory, 'destinations')),
          'frame after64 retains pre-await paths'
        );
    } finally {
      Object.defineProperty(fsExtra, 'outputFile', originals.outputFile);
      Object.defineProperty(eolModule, 'auto', originals.auto);
      Object.defineProperty(binary, 'isBinaryFileSync', originals.binary);
      if (originals.debug) Object.defineProperty(logger, 'debug', originals.debug);
      else delete logger.debug;
      process.stdout.write = originals.stdout;
    }
  }
});

test('lost selection receipts retain the observed callback prefix without acknowledging or repeating it', async (t) => {
  const checkoutDirectory = path.dirname(installed.resolve('@teambit/checkout'));
  const selection = compiled
    ? require(path.join(checkoutDirectory, 'rust-checkout-transition.js'))
    : source('scopes/component/checkout/rust-checkout-transition.ts');
  // Defining-module bootstrap registers the actual transport; compiled mode has no test-only registry setup.
  if (compiled) require(path.join(checkoutDirectory, 'checkout.main.runtime.js'));
  else source('scopes/component/checkout/checkout.main.runtime.ts');
  const publicEngine = require(path.join(sourcesDirectory, 'rust-workspace-engine.js'));
  const publicMaterializer = require(path.join(sourcesDirectory, 'rust-workspace-materializer.js'));
  const acquire = publicMaterializer.acquireWorkspaceSession;
  const flag = process.env.BIT_RUST_CLIENT_VCS;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  t.after(() => {
    publicMaterializer.acquireWorkspaceSession = acquire;
    if (flag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = flag;
  });
  const stages = [
    'unmerged',
    'resolveTarget',
    'hasVersion',
    'currentVersion',
    'mergePending',
    'modified',
    'targetRemoved',
  ];
  const values = {
    unmerged: false,
    resolveTarget: '1.0.0',
    hasVersion: true,
    currentVersion: { value: '1.0.1', hasBitmap: true },
    mergePending: false,
    modified: { modified: true, isRemoved: false },
    targetRemoved: { removed: false, hasBitmap: true },
  };
  const input = {
    component: {
      id: 'qualification.checkout/component@1.0.1',
      idWithoutVersion: 'qualification.checkout/component',
      componentVersion: '1.0.1',
      hasBitmap: true,
      currentExists: true,
      isRemoved: false,
    },
    model: { hasMainHead: true },
    options: {
      reset: false,
      head: false,
      main: false,
      latest: false,
      version: '1.0.0',
      forceOurs: false,
      forceTheirs: false,
      revert: false,
      loadStash: false,
    },
  };
  for (let lost = 0; lost < stages.length; lost++) {
    let revision = 0,
      releases = 0,
      disposals = 0;
    const callbacks = [],
      receipts = [];
    const physical = {
      usable: true,
      async dispose() {
        disposals++;
        this.usable = false;
      },
      async request(build, count, validate) {
        const frame = JSON.parse(build(1).subarray(12));
        if (frame.kind === 'checkoutSelectReceipt') {
          receipts.push(frame.observation);
          assert.deepEqual(frame.value, values[frame.observation]);
          if (revision === lost) return undefined;
          revision++;
        } else assert.equal(frame.kind, 'checkoutSelectBegin');
        const directive =
          revision < stages.length
            ? { kind: 'observe', observation: stages[revision] }
            : { kind: 'target', version: '1.0.0', merge: true };
        assert.equal(
          validate({ completed: 1, failed: false, data: { token: 'b'.repeat(40), revision, directive } }),
          true
        );
        return 1;
      },
    };
    publicMaterializer.acquireWorkspaceSession = () => ({
      session: physical,
      executable: '/qualification/helper',
      async release() {
        releases++;
      },
    });
    await publicEngine.withRustWorkspaceEngine(async () => {
      const result = await selection.selectRustCheckout(
        input,
        async (stage) => {
          callbacks.push(stage);
          return values[stage];
        },
        () => true
      );
      assert.equal(result.began, true);
      assert.equal(result.selection, undefined);
      assert.deepEqual([...result.acknowledged], stages.slice(0, lost));
      assert.deepEqual(callbacks, stages.slice(0, lost + 1));
      assert.deepEqual(receipts, callbacks);
      assert.equal(publicEngine.workspaceEngineSession().session, undefined);
    });
    assert.equal(releases, 1);
    assert.ok(disposals >= 1);
  }
});

test('real native selection acknowledges clean, locally modified, reset and revert callback plans', async (t) => {
  const checkoutDirectory = path.dirname(installed.resolve('@teambit/checkout'));
  const selection = compiled
    ? require(path.join(checkoutDirectory, 'rust-checkout-transition.js'))
    : source('scopes/component/checkout/rust-checkout-transition.ts');
  if (compiled) require(path.join(checkoutDirectory, 'checkout.main.runtime.js'));
  else source('scopes/component/checkout/checkout.main.runtime.ts');
  const publicEngine = require(path.join(sourcesDirectory, 'rust-workspace-engine.js'));
  const physical = require(path.join(sourcesDirectory, 'rust-workspace-materializer.js')).MaterializationSession;
  const oldFlag = process.env.BIT_RUST_CLIENT_VCS,
    oldHelper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT =
    process.env.BIT_TEST_OBJECT_IMPORT ||
    path.join(root, 'native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));
  const request = physical.prototype.request;
  const frames = [];
  physical.prototype.request = async function (build, ...args) {
    const input = JSON.parse(build(1).subarray(12));
    frames.push({ session: this, input });
    return request.call(this, build, ...args);
  };
  t.after(() => {
    physical.prototype.request = request;
    if (oldFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = oldFlag;
    if (oldHelper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = oldHelper;
  });
  for (const kind of ['clean', 'modified', 'reset', 'revert']) {
    const start = frames.length,
      callbacks = [];
    const input = {
      component: {
        id: 'qualification.checkout/component@1.0.1',
        idWithoutVersion: 'qualification.checkout/component',
        componentVersion: '1.0.1',
        hasBitmap: true,
        currentExists: true,
        isRemoved: false,
      },
      model: { hasMainHead: true },
      options: {
        reset: kind === 'reset',
        head: false,
        main: false,
        latest: false,
        ...(kind === 'reset' ? {} : { version: '1.0.0' }),
        forceOurs: false,
        forceTheirs: false,
        revert: kind === 'revert',
        loadStash: false,
      },
    };
    await publicEngine.withRustWorkspaceEngine(async () => {
      const result = await selection.selectRustCheckout(
        input,
        async (stage) => {
          callbacks.push(stage);
          return {
            unmerged: false,
            resolveTarget: kind === 'reset' ? '1.0.1' : '1.0.0',
            hasVersion: true,
            currentVersion: { value: '1.0.1', hasBitmap: true },
            mergePending: false,
            modified: { modified: kind !== 'clean', isRemoved: false },
            targetRemoved: { removed: false, hasBitmap: true },
          }[stage];
        },
        () => true
      );
      assert.equal(result.began, true, `real helper must accept ${kind}`);
      assert.deepEqual(result.selection, {
        kind: 'target',
        version: kind === 'reset' ? '1.0.1' : '1.0.0',
        merge: kind === 'modified',
      });
      assert.equal(callbacks[0], 'unmerged', 'reset still observes canonical unmerged callback');
      assert.equal(new Set(callbacks).size, callbacks.length, 'public observations run once');
      assert.deepEqual([...result.acknowledged], callbacks);
    });
    assert.ok(frames.length > start + 1);
    assert.equal(
      new Set(frames.slice(start).map((frame) => frame.session)).size,
      1,
      'all token receipts use one physical helper'
    );
    assert.equal(frames[start].input.kind, 'checkoutSelectBegin');
    assert.ok(frames.slice(start + 1).every((frame) => frame.input.kind === 'checkoutSelectReceipt'));
  }
});

function mergeApplyModule() {
  return compiled
    ? require(path.join(path.dirname(installed.resolve('@teambit/component.modules.merge-helper')), 'apply-version.js'))
    : source('scopes/component/modules/merge-helper/apply-version.ts');
}
function emptyMerge(changes = {}) {
  return {
    hasConflicts: false,
    modifiedFiles: [],
    addFiles: [],
    deletedConflictFiles: [],
    removeFiles: [],
    remainDeletedFiles: [],
    overrideFiles: [],
    updatedFiles: [],
    ...changes,
  };
}

test('async apply fallback keeps its one public clone prefix despite helper loss and source-array replacement', async (t) => {
  const { template } = await plannedFixture(t);
  const original = template();
  const originalClone = original.clone;
  let cloneCalls = 0,
    captured;
  original.clone = function () {
    cloneCalls++;
    return originalClone.call(this);
  };
  const files = [original];
  const result = await mergeApplyModule().applyModifiedVersionWithPlan(
    files,
    emptyMerge({ modifiedFiles: [{ filePath: 'index.js', output: 'merged retained output\n' }] }),
    undefined,
    async (clones) => {
      captured = clones;
      files[0] = template();
      files[0].clone = () => {
        throw new Error('replacement clone must not run');
      };
      original.contents = Buffer.from('late original body');
      await Promise.resolve();
      return undefined;
    }
  );
  assert.equal(cloneCalls, 1);
  assert.equal(result.modifiedFiles, captured);
  assert.deepEqual(result.modifiedFiles[0].contents, Buffer.from('merged retained output\n'));
  assert.deepEqual(original.contents, Buffer.from('late original body'));
});

test('async apply preserves the canonical modified-file prefix before a later typed merge error', async (t) => {
  const { template } = await plannedFixture(t);
  const original = template();
  const clone = original.clone;
  let cloneCalls = 0,
    captured;
  original.clone = function () {
    cloneCalls++;
    return clone.call(this);
  };
  await assert.rejects(
    mergeApplyModule().applyModifiedVersionWithPlan(
      [original],
      emptyMerge({
        modifiedFiles: [{ filePath: 'index.js', output: 'successful modified prefix\n' }],
        updatedFiles: [{ filePath: 'missing.js', content: Buffer.from('never applied') }],
      }),
      undefined,
      async (clones) => {
        captured = clones;
        return undefined;
      }
    ),
    (error) => {
      assert.ok(error instanceof installed('@teambit/bit-error').BitError);
      assert.equal(error.message, `file ${path.normalize('missing.js')} not found`);
      return true;
    }
  );
  assert.equal(cloneCalls, 1);
  assert.deepEqual(
    captured[0].contents,
    Buffer.from('successful modified prefix\n'),
    'fallback does not discard already-applied canonical mutation'
  );
  assert.deepEqual(original.contents, Buffer.from('template'));
});

test('async apply returns the exact retained result and propagates callback errors without a canonical replay', async (t) => {
  const { template } = await plannedFixture(t);
  const file = template();
  const clone = file.clone;
  let clones = 0;
  file.clone = function () {
    clones++;
    return clone.call(this);
  };
  const result = { modifiedFiles: [], filesStatus: { preserved: 'native-result' } };
  assert.equal(
    await mergeApplyModule().applyModifiedVersionWithPlan([file], emptyMerge(), undefined, async () => result),
    result
  );
  const failure = new Error('public plan callback failed');
  await assert.rejects(
    mergeApplyModule().applyModifiedVersionWithPlan([file], emptyMerge(), undefined, async () => {
      throw failure;
    }),
    (error) => error === failure
  );
  assert.equal(clones, 2, 'each operation has one clone prefix even when its callback throws');
});

test('packed retained bodies preserve lazy aliases and exact write continuation bytes', async (t) => {
  const { plan, contents, descriptor, template } = await plannedFixture(t);
  const prefix = Buffer.from('unrelated prefix');
  await fs.writeFile(descriptor.snapshotPath, Buffer.concat([prefix, contents, Buffer.from('suffix')]));
  descriptor.snapshotOffset = prefix.length;
  let original, clone;
  await engine.withRustWorkspaceEngine(async () => {
    original = plan.createRustCheckoutPlanSourceFile(template(), descriptor);
    assert.ok(original);
    clone = original.clone();
    const write = plan.captureRustCheckoutPlanWriteContinuation(original);
    assert.ok(write);
    assert.deepEqual(write.descriptor, descriptor);
    await write.persist();
    assert.deepEqual(await fs.readFile(original.path), installed('@teambit/toolbox.string.eol').auto(contents));
    assert.deepEqual(original.contents, contents);
    assert.equal(original.contents, clone.contents);
  });
  await fs.unlink(descriptor.snapshotPath);
  assert.deepEqual(clone.contents, contents);
});

test('checkout ownership excludes only separate dependency sessions and retains all state/body operations', () => {
  const { checkoutOwnsFrame } = require('./checkout-transition-qualification.cjs');
  const owned = [
    { magic: 'BMT1', kind: 'checkoutSelectBegin', helperId: 1 },
    { magic: 'BWS1', kind: 'inventoryBegin', helperId: 1 },
    { magic: 'BWC1', helperId: 1 },
  ];
  const graph = ['dependencyGraph', 'dependencyCacheRead', 'dependencyScan', 'dependencyResolve', 'dependencyCacheFreshness']
    .map((kind) => ({ magic: 'BWS1', kind, helperId: 2 }));
  assert.deepEqual([...owned, ...graph].filter(checkoutOwnsFrame), owned);
  for (const kind of ['read', 'fileStatus', 'dependencyGraphUnknown'])
    assert.equal(checkoutOwnsFrame({ magic: 'BWS1', kind, helperId: 2 }), true);
  assert.equal(checkoutOwnsFrame({ magic: 'BMT1', kind: 'inspectionFinish', helperId: 2 }), true);
});

test('declined cold preflight exclusion requires the entire helper to remain read-only preparation', () => {
  const { declinedPreflightOwners } = require('./checkout-transition-qualification.cjs');
  const prepare = { magic: 'BWS1', kind: 'commandPrepare', helperId: 1 };
  const legacy = { magic: 'BMT1', kind: 'checkoutMaterialize', helperId: 2 };
  assert.deepEqual([...declinedPreflightOwners([prepare, legacy])], [1]);
  for (const kind of ['commandPlan', 'commandApply', 'commandFinalize', 'unknown']) {
    assert.deepEqual([...declinedPreflightOwners([prepare, { ...prepare, kind }, legacy])], []);
  }
  assert.deepEqual([...declinedPreflightOwners([prepare, { ...legacy, helperId: 1 }])], []);
});
