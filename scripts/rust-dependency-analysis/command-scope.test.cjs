const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const childProcess = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const installedRoot = process.env.BIT_LEGACY_ROOT || path.resolve(__dirname, '../..');
const installed = Module.createRequire(path.join(installedRoot, 'package.json'));
const ts = installed('typescript');
const root = process.env.BIT_SCANNER_INTEGRATION_ROOT || path.resolve(__dirname, '../..');
require.extensions['.ts'] = (target, filename) => {
  target.paths = [...Module._nodeModulePaths(installedRoot), ...target.paths];
  target._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        experimentalDecorators: true,
      },
      fileName: filename,
    }).outputText,
    filename
  );
};
const builder = path.join(root, 'scopes/dependencies/dependencies/files-dependency-builder');
const { RustDependencyScannerSession } = require(path.join(builder, 'rust-scanner/session.ts'));
const { withRustDependencyScannerScope, acquireRustDependencyScannerSession } = require(
  path.join(builder, 'rust-scanner/scope.ts')
);
const generateTree = require(path.join(builder, 'generate-tree-madge.ts')).default;
const { ComponentLoader } = require(path.join(root, 'components/legacy/consumer-component/component-loader.ts'));
const { ComponentID, ComponentIdList } = installed('@teambit/component-id');
const { DetectorHook } = installed('@teambit/dependency-resolver');
const native = process.env.BIT_TEST_NATIVE_SCANNER;
if (process.env.CI && !native) {
  throw new Error('command-scope validation in CI requires BIT_TEST_NATIVE_SCANNER; native parity must not be skipped');
}

function workspace(context, files = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-rust-command-scope-'));
  for (const [name, source] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), source);
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, file: (name) => path.join(directory, name) };
}

async function enabled(executable, operation) {
  const old = process.env.BIT_RUST_DEPENDENCY_SCANNER;
  if (executable === undefined) delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
  else process.env.BIT_RUST_DEPENDENCY_SCANNER = executable;
  try {
    return await operation();
  } finally {
    if (old === undefined) delete process.env.BIT_RUST_DEPENDENCY_SCANNER;
    else process.env.BIT_RUST_DEPENDENCY_SCANNER = old;
  }
}

function observe(context) {
  const children = [];
  const disposed = [];
  const spawn = childProcess.spawn;
  childProcess.spawn = (...args) => {
    const child = spawn(...args);
    const requests = [];
    const write = child.stdin.write;
    child.stdin.write = function (data, ...rest) {
      requests.push(JSON.parse(data.toString().trim()));
      return write.call(this, data, ...rest);
    };
    children.push({ executable: args[0], child, requests });
    return child;
  };
  const dispose = RustDependencyScannerSession.prototype.dispose;
  RustDependencyScannerSession.prototype.dispose = function () {
    disposed.push(this);
    return dispose.call(this);
  };
  context.after(() => {
    childProcess.spawn = spawn;
    RustDependencyScannerSession.prototype.dispose = dispose;
    for (const { child } of children) {
      try {
        child.kill('SIGKILL');
      } catch {}
    }
  });
  return { children, disposed };
}

function noHooks(context) {
  const old = DetectorHook.hooks;
  DetectorHook.hooks = [];
  context.after(() => {
    DetectorHook.hooks = old;
  });
}

function treeConfig(directory) {
  return { baseDir: directory, envDetectors: [], detectiveOptions: {} };
}

async function exited(child) {
  for (let i = 0; i < 200; i++) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    await delay(10);
  }
  assert.fail('operation helper did not exit after owner cleanup');
}

test('disabled scope leaves callbacks unchanged and does not create helpers', async (context) => {
  const events = observe(context);
  const result = await enabled(undefined, () => withRustDependencyScannerScope(async () => 42));
  assert.equal(result, 42);
  assert.equal(events.children.length, 0);
  assert.equal(events.disposed.length, 0);
});

test('exclusive leases are bounded and nested scopes retain the outer owner', async (context) => {
  const events = observe(context);
  const executable = path.join(os.tmpdir(), 'bit-unused-scanner');
  const held = [];
  await enabled(executable, () =>
    withRustDependencyScannerScope(async () => {
      for (let i = 0; i < 4; i++) held.push(acquireRustDependencyScannerSession(executable));
      assert.ok(held.every(Boolean));
      assert.equal(new Set(held.map(({ session }) => session)).size, 4);
      assert.equal(acquireRustDependencyScannerSession(executable), undefined);
      held[0].release();
      await withRustDependencyScannerScope(async () => {
        const reused = acquireRustDependencyScannerSession(executable);
        assert.equal(reused.session, held[0].session);
        reused.release();
      });
      assert.equal(events.disposed.length, 0);
      for (const lease of held) {
        lease.release();
        lease.release();
      }
    })
  );
  assert.equal(events.children.length, 0); // Unused leases never spawn processes.
  assert.equal(new Set(events.disposed).size, 4);
});

test('detached asynchronous work cannot reopen its closed owner context but owns a new operation', async (context) => {
  const events = observe(context);
  const executable = path.join(os.tmpdir(), 'bit-unused-scanner');
  let unblock;
  const gate = new Promise((resolve) => {
    unblock = resolve;
  });
  let detached;
  await enabled(executable, () =>
    withRustDependencyScannerScope(async () => {
      const lease = acquireRustDependencyScannerSession(executable);
      lease.release();
      detached = (async () => {
        await gate;
        const stale = acquireRustDependencyScannerSession(executable);
        let fresh;
        await withRustDependencyScannerScope(async () => {
          fresh = acquireRustDependencyScannerSession(executable);
          fresh.release();
        });
        return { stale, fresh, disposedAfterFreshOperation: events.disposed.length };
      })();
    })
  );
  const { stale, fresh, disposedAfterFreshOperation } = await enabled(executable, () => {
    unblock();
    return detached;
  });
  assert.equal(stale, undefined);
  assert.ok(fresh);
  assert.equal(events.children.length, 0);
  // The original owner disposed its helper; the later operation disposed its own on exit.
  assert.equal(disposedAfterFreshOperation, 2);
  assert.ok(events.disposed.includes(fresh.session));
});

test('dependency aspect explicitly registers the component-load scope adapter', async (context) => {
  const published = installed('@teambit/legacy.consumer-component').ComponentLoader;
  const oldScope = published.runDependencyLoadScope;
  const oldLoadDeps = published.loadDeps;
  context.after(() => {
    published.runDependencyLoadScope = oldScope;
    published.loadDeps = oldLoadDeps;
  });
  const { DependenciesMain } = require(
    path.join(root, 'scopes/dependencies/dependencies/dependencies.main.runtime.ts')
  );
  const main = await DependenciesMain.provider([
    { register() {} },
    {},
    {},
    {},
    {},
    {},
    {},
    { createLogger: () => ({}) },
  ]);
  assert.equal(published.runDependencyLoadScope, withRustDependencyScannerScope);
  assert.equal(typeof published.loadDeps, 'function');
  assert.ok(main instanceof DependenciesMain);
});

test(
  'reset refuses pending work, clears both caches after completion, and reuses the physical helper',
  { skip: !native },
  async (context) => {
    const { directory, file } = workspace(context, { 'entry.ts': `import './first';` });
    const events = observe(context);
    const session = new RustDependencyScannerSession({ executable: native, cwd: directory });
    context.after(() => session.dispose());
    const pending = session.prefetch(['entry.ts']);
    assert.equal(session.clearCache(), false);
    await Promise.resolve();
    assert.equal(session.clearCache(), false);
    await pending;
    assert.deepEqual(Object.keys(session.get('entry.ts').dependencies), ['./first']);
    await session.scanSource('inline.ts', `import './inline';`);
    assert.equal(session.clearCache(), true);
    assert.equal(session.get('entry.ts'), undefined);
    await session.scanSource('inline.ts', `import './inline';`);
    fs.writeFileSync(file('entry.ts'), `import './second';`);
    await session.prefetch(['entry.ts']);
    assert.deepEqual(Object.keys(session.get('entry.ts').dependencies), ['./second']);
    assert.equal(events.children.length, 1);
    assert.equal(events.children[0].requests.length, 4);
    session.dispose();
    assert.equal(session.clearCache(), false);
  }
);

test('leases isolate executable and working-directory configurations', async (context) => {
  const { directory } = workspace(context);
  const originalCwd = process.cwd();
  const executable = path.join(directory, 'first-scanner');
  context.after(() => process.chdir(originalCwd));
  await enabled(executable, () =>
    withRustDependencyScannerScope(async () => {
      const first = acquireRustDependencyScannerSession(executable);
      first.release();
      const differentExecutable = acquireRustDependencyScannerSession(path.join(directory, 'second-scanner'));
      assert.notEqual(differentExecutable.session, first.session);
      differentExecutable.release();
      process.chdir(directory);
      const differentDirectory = acquireRustDependencyScannerSession(executable);
      assert.notEqual(differentDirectory.session, first.session);
      differentDirectory.release();
      process.chdir(originalCwd);
      const same = acquireRustDependencyScannerSession(executable);
      assert.equal(same.session, first.session);
      same.release();
    })
  );
});

test(
  'sequential graphs reuse one helper while rereading changed files and disposing at operation end',
  { skip: !native },
  async (context) => {
    noHooks(context);
    const { directory, file } = workspace(context, {
      'entry.ts': `import './first';`,
      'first.ts': 'export const first = 1;',
      'second.ts': 'export const second = 2;',
    });
    const events = observe(context);
    await enabled(native, () =>
      withRustDependencyScannerScope(async () => {
        const first = await generateTree([file('entry.ts')], treeConfig(directory));
        assert.deepEqual(first.madgeTree, { 'entry.ts': ['first.ts'], 'first.ts': [] });
        assert.equal(events.children.length, 1);
        assert.equal(events.disposed.length, 0);
        fs.writeFileSync(file('entry.ts'), `import './second';`);
        const second = await generateTree([file('entry.ts')], treeConfig(directory));
        assert.deepEqual(second.madgeTree, { 'entry.ts': ['second.ts'], 'second.ts': [] });
        assert.equal(events.children.length, 1);
        assert.equal(events.disposed.length, 0);
      })
    );
    assert.equal(events.disposed.length, 1);
    await exited(events.children[0].child);
  }
);

test(
  'a detector registered between graphs retains precedence over an already reused helper',
  { skip: !native },
  async (context) => {
    noHooks(context);
    const { directory, file } = workspace(context, {
      'entry.ts': `import './child';`,
      'child.ts': 'export const value = 1;',
    });
    const events = observe(context);
    await enabled(native, () =>
      withRustDependencyScannerScope(async () => {
        const first = await generateTree([file('entry.ts')], treeConfig(directory));
        assert.deepEqual(first.madgeTree, { 'child.ts': [], 'entry.ts': ['child.ts'] });
        let predicates = 0;
        DetectorHook.hooks = [
          {
            isSupported: () => {
              predicates++;
              return true;
            },
            detect: () => [],
          },
        ];
        const second = await generateTree([file('entry.ts')], treeConfig(directory));
        assert.deepEqual(second.madgeTree, { 'entry.ts': [] });
        assert.equal(predicates, 2);
        assert.equal(events.children.length, 1);
      })
    );
    assert.equal(events.disposed.length, 1);
  }
);

test(
  'independent overlapping operations do not share helper or cache ownership',
  { skip: !native },
  async (context) => {
    const { file } = workspace(context, { 'entry.ts': 'export const value = 1;' });
    const events = observe(context);
    const sessions = [];
    await enabled(native, () =>
      Promise.all(
        [1, 2].map(() =>
          withRustDependencyScannerScope(async () => {
            const lease = acquireRustDependencyScannerSession(native);
            sessions.push(lease.session);
            await lease.session.prefetch([file('entry.ts')]);
            lease.release();
          })
        )
      )
    );
    assert.equal(new Set(sessions).size, 2);
    assert.equal(events.children.length, 2);
    assert.equal(new Set(events.disposed).size, 2);
  }
);

test(
  'concurrent graphs within an operation hold separate snapshots until released',
  { skip: !native },
  async (context) => {
    const { file } = workspace(context, { 'entry.ts': `import './old';` });
    const events = observe(context);
    await enabled(native, () =>
      withRustDependencyScannerScope(async () => {
        const first = acquireRustDependencyScannerSession(native);
        const second = acquireRustDependencyScannerSession(native);
        await first.session.prefetch([file('entry.ts')]);
        fs.writeFileSync(file('entry.ts'), `import './new';`);
        await second.session.prefetch([file('entry.ts')]);
        assert.deepEqual(Object.keys(first.session.get(file('entry.ts')).dependencies), ['./old']);
        assert.deepEqual(Object.keys(second.session.get(file('entry.ts')).dependencies), ['./new']);
        first.release();
        second.release();
        assert.equal(events.disposed.length, 0);
      })
    );
    assert.equal(events.children.length, 2);
    assert.equal(events.disposed.length, 2);
  }
);

test('failed helper is disabled for the operation and retried only in a new operation', async (context) => {
  const events = observe(context);
  const executable = path.join(os.tmpdir(), 'bit-no-scanner-' + process.pid);
  for (let operation = 0; operation < 2; operation++) {
    await enabled(executable, () =>
      withRustDependencyScannerScope(async () => {
        const lease = acquireRustDependencyScannerSession(executable);
        await lease.session.prefetch(['entry.ts']);
        assert.ok(lease.session.unavailableReason);
        lease.release();
        assert.equal(acquireRustDependencyScannerSession(executable), undefined);
      })
    );
  }
  assert.equal(events.children.length, 2);
});

test(
  'owner exceptions clean up leased helpers without hiding the original error',
  { skip: !native },
  async (context) => {
    const { file } = workspace(context, { 'entry.ts': 'export const value = 1;' });
    const events = observe(context);
    await assert.rejects(
      enabled(native, () =>
        withRustDependencyScannerScope(async () => {
          const lease = acquireRustDependencyScannerSession(native);
          await lease.session.prefetch([file('entry.ts')]);
          throw new Error('owner failed');
        })
      ),
      /owner failed/
    );
    assert.equal(events.disposed.length, 1);
    await exited(events.children[0].child);
  }
);

test(
  'direct graph calls retain individual ownership outside a component-load scope',
  { skip: !native },
  async (context) => {
    noHooks(context);
    const { directory, file } = workspace(context, { 'entry.ts': 'export const value = 1;' });
    const events = observe(context);
    await enabled(native, async () => {
      await generateTree([file('entry.ts')], treeConfig(directory));
      await generateTree([file('entry.ts')], treeConfig(directory));
    });
    assert.equal(events.children.length, 2);
    assert.equal(events.disposed.length, 2);
  }
);

test(
  'component loadMany shares scope across cold sequential components and leaves warm cache untouched',
  { skip: !native },
  async (context) => {
    noHooks(context);
    const { directory, file } = workspace(context, { 'a.ts': 'export const a = 1;', 'b.ts': 'export const b = 2;' });
    const events = observe(context);
    const ids = ComponentIdList.fromArray(
      ['a', 'b'].map((name) => ComponentID.fromObject({ scope: 'test', name, version: '0.0.1' }))
    );
    const consumer = {
      getPath: () => directory,
      scope: { getPath: () => path.join(directory, '.bit') },
      config: { path: path.join(directory, 'workspace.jsonc') },
      bitmapIdsFromCurrentLaneIncludeRemoved: ids,
    };
    const loader = new ComponentLoader(consumer);
    // Preserve the actual shouldRunInParallel decision: an empty dependency cache
    // must keep cold components sequential. Component loading itself is isolated.
    loader.invalidateDependenciesCacheIfNeeded = async () => {};
    loader.componentFsCache.listDependenciesDataCache = async () => ({});
    let active = 0;
    let maximum = 0;
    loader.loadOne = async (id) => {
      active++;
      maximum = Math.max(maximum, active);
      await generateTree([file(id.name + '.ts')], treeConfig(directory));
      active--;
      return { id };
    };
    const oldScope = ComponentLoader.runDependencyLoadScope;
    ComponentLoader.runDependencyLoadScope = withRustDependencyScannerScope;
    context.after(() => {
      ComponentLoader.runDependencyLoadScope = oldScope;
    });
    await enabled(native, async () => {
      const first = await loader.loadMany(ids);
      assert.equal(first.components.length, 2);
      assert.equal(maximum, 1);
      assert.equal(events.children.length, 1);
      assert.equal(events.disposed.length, 1);
      const second = await loader.loadMany(ids);
      assert.equal(second.components.length, 2);
      assert.equal(events.children.length, 1);
      assert.equal(events.disposed.length, 1);
    });
  }
);

test(
  'nested component loadMany retains the outer helper until parent loading completes',
  { skip: !native },
  async (context) => {
    noHooks(context);
    const { directory, file } = workspace(context, { 'a.ts': 'export const a = 1;', 'b.ts': 'export const b = 2;' });
    const events = observe(context);
    const ids = ['a', 'b'].map((name) => ComponentID.fromObject({ scope: 'test', name, version: '0.0.1' }));
    const consumer = {
      getPath: () => directory,
      scope: { getPath: () => path.join(directory, '.bit') },
      config: { path: path.join(directory, 'workspace.jsonc') },
      bitmapIdsFromCurrentLaneIncludeRemoved: ComponentIdList.fromArray(ids),
    };
    const loader = new ComponentLoader(consumer);
    loader.invalidateDependenciesCacheIfNeeded = async () => {};
    loader.componentFsCache.listDependenciesDataCache = async () => ({});
    loader.loadOne = async (id) => {
      await generateTree([file(id.name + '.ts')], treeConfig(directory));
      if (id.name === 'a') {
        await loader.loadMany(ComponentIdList.fromArray([ids[1]]));
        assert.equal(events.disposed.length, 0);
      }
      return { id };
    };
    const oldScope = ComponentLoader.runDependencyLoadScope;
    ComponentLoader.runDependencyLoadScope = withRustDependencyScannerScope;
    context.after(() => {
      ComponentLoader.runDependencyLoadScope = oldScope;
    });
    await enabled(native, () => loader.loadMany(ComponentIdList.fromArray([ids[0]])));
    assert.equal(events.children.length, 1);
    assert.equal(events.disposed.length, 1);
  }
);
