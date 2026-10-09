const {
  test,
  assert,
  fs,
  os,
  path,
  RustDependencyScannerSession,
  withRustDependencyScannerScope,
  acquireRustDependencyScannerSession,
  generateTree,
  DetectorHook,
  native,
  workspace,
  enabled,
  observe,
  noHooks,
  treeConfig,
  exited,
} = require('./scope-test-support.cjs');

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
