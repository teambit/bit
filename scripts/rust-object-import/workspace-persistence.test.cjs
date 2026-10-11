const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { root, source, installed } = require('./load-source.cjs');
const compiled =
  process.env.BIT_TEST_MATERIALIZATION_COMPILED === '1' ? installed('@teambit/component.sources') : undefined;
const AbstractVinyl = compiled?.AbstractVinyl || source('scopes/component/sources/abstract-vinyl.ts').default;
const { DataToPersist } = compiled || source('scopes/component/sources/data-to-persist.ts');
const { RemovePath } = compiled || source('scopes/component/sources/remove-path.ts');
const { Symlink } = compiled || source('scopes/component/sources/symlink.ts');
const { withWorkspacePersistence } = compiled
  ? require(path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-persistence.js'))
  : source('scopes/component/sources/rust-workspace-persistence.ts');
const native =
  process.env.BIT_TEST_OBJECT_IMPORT ||
  path.join(root, 'native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));

async function setup(t, executable = native) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-persistence-'));
  const keys = ['BIT_RUST_OBJECT_IMPORT', 'BIT_RUST_WORKSPACE_PERSISTENCE', 'BIT_RUST_WORKSPACE_MATERIALIZATION'];
  const previous = keys.map((key) => process.env[key]);
  process.env.BIT_RUST_OBJECT_IMPORT = executable;
  process.env.BIT_RUST_WORKSPACE_PERSISTENCE = 'on';
  process.env.BIT_RUST_WORKSPACE_MATERIALIZATION = 'off';
  const originalSpawn = cp.spawn;
  const children = [];
  const acknowledgements = [];
  cp.spawn = (...args) => {
    const child = originalSpawn(...args);
    if (args[0] === path.toNamespacedPath(executable)) {
      children.push(child);
      child.stdout.on('data', (data) => acknowledgements.push(data.toString()));
    }
    return child;
  };
  t.after(async () => {
    cp.spawn = originalSpawn;
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { directory, children, acknowledgements };
}
function vinyl(directory, name, contents = 'new\r\n') {
  const result = new AbstractVinyl({
    base: directory,
    path: path.join(directory, name),
    contents: Buffer.from(contents),
  });
  result.override = true;
  return result;
}
function overrideConcurrency(t, value) {
  const concurrency = require(
    path.join(path.dirname(installed.resolve('@teambit/harmony.modules.concurrency')), 'concurrency.js')
  );
  const previous = concurrency.concurrentIOLimit;
  concurrency.concurrentIOLimit = () => value;
  t.after(() => {
    concurrency.concurrentIOLimit = previous;
  });
  return (next) => {
    value = next;
  };
}
function frames(values) {
  return values.join('').trim().split('\n').filter(Boolean).map(JSON.parse);
}
async function absent(filename) {
  await assert.rejects(fs.lstat(filename), { code: 'ENOENT' });
}
async function closed(children) {
  for (const child of children)
    assert.ok(child.exitCode !== null || child.signalCode !== null, 'helper must be reaped before completion');
}

test('negative and sub-unit concurrency retain canonical skipping without launching helpers', async (t) => {
  const { directory, children } = await setup(t);
  const setConcurrency = overrideConcurrency(t, -1);
  for (const concurrency of [-1, 0.5, NaN, -Infinity]) {
    setConcurrency(concurrency);
    const existing = path.join(directory, `existing-${String(concurrency)}`);
    await fs.writeFile(existing, 'retained');
    const data = new DataToPersist();
    data.removePath(new RemovePath(existing));
    const file = vinyl(directory, `new-${String(concurrency)}`);
    data.addFile(file);
    await data.persistAllToFS();
    assert.equal(await fs.readFile(existing, 'utf8'), 'retained');
    await absent(file.path);
  }
  assert.equal(children.length, 0);
});

test('invalid cleanup concurrency rejects before deleting any path', async (t) => {
  const { directory, children } = await setup(t);
  const setConcurrency = overrideConcurrency(t, -1);
  for (const concurrency of [-1, 0.5, 1.5, NaN, -Infinity]) {
    setConcurrency(concurrency);
    const existing = path.join(directory, `cleanup-${String(concurrency)}`);
    await fs.writeFile(existing, 'retained');
    const data = new DataToPersist();
    data.removePath(new RemovePath(existing, true));
    await assert.rejects(data.persistAllToFS(), TypeError);
    assert.equal(await fs.readFile(existing, 'utf8'), 'retained');
  }
  assert.equal(children.length, 0);
});

test('file phase uses concurrency changed by a custom deletion hook', async (t) => {
  const { directory, children } = await setup(t);
  const setConcurrency = overrideConcurrency(t, 2);
  const data = new DataToPersist();
  const removal = new RemovePath(path.join(directory, 'hook'));
  removal.persistToFS = async () => {
    setConcurrency(-1);
  };
  data.removePath(removal);
  const file = vinyl(directory, 'skipped');
  data.addFile(file);
  await data.persistAllToFS();
  await absent(file.path);
  assert.equal(children.length, 0);
});

test('one native helper persists deletion, ordinary writes and links in phase order', async (t) => {
  const { directory, children, acknowledgements } = await setup(t);
  const component = path.join(directory, 'component');
  await fs.mkdir(component);
  await fs.writeFile(path.join(component, 'stale'), 'stale');
  const destination = path.join(directory, 'links/source');
  await fs.mkdir(destination, { recursive: true });
  await fs.writeFile(path.join(destination, 'stale'), 'replace destination directory');
  const data = new DataToPersist();
  data.removePath(new RemovePath(component));
  data.addFile(vinyl(directory, 'component/new'));
  data.addSymlink(new Symlink(path.join(component, 'new'), destination));
  await data.persistAllToFS();
  await absent(path.join(component, 'stale'));
  assert.deepEqual(await fs.readFile(destination), await fs.readFile(path.join(component, 'new')));
  const sourceStat = await fs.stat(path.join(component, 'new'));
  const destStat = await fs.stat(destination);
  assert.equal(destStat.ino, sourceStat.ino);
  assert.equal(children.length, 1);
  assert.equal(
    frames(acknowledgements).reduce((sum, frame) => sum + frame.completed, 0),
    3
  );
  await closed(children);
});

test('remove empty immediate parents in reverse order without recursively deleting ancestors', async (t) => {
  const { directory, acknowledgements } = await setup(t);
  const empty = path.join(directory, 'ancestor/empty');
  const retained = path.join(directory, 'ancestor/retained');
  await fs.mkdir(empty, { recursive: true });
  await fs.mkdir(retained);
  await fs.writeFile(path.join(empty, 'a'), 'a');
  await fs.writeFile(path.join(empty, 'b'), 'b');
  await fs.writeFile(path.join(retained, 'keep'), 'keep');
  const data = new DataToPersist();
  data.removePath(new RemovePath(path.join(empty, 'a'), true));
  data.removePath(new RemovePath(path.join(empty, 'b'), true));
  data.removePath(new RemovePath(path.join(retained, 'missing'), true));
  data.removePath(new RemovePath(path.join(directory, 'missing')));
  await data.persistAllToFS();
  await absent(empty);
  assert.ok((await fs.stat(path.join(directory, 'ancestor'))).isDirectory());
  assert.equal(await fs.readFile(path.join(retained, 'keep'), 'utf8'), 'keep');
  assert.ok(frames(acknowledgements).length > 0);
});

test(
  'directory deletion removes its symlinks without following targets',
  { skip: process.platform === 'win32' },
  async (t) => {
    const { directory } = await setup(t);
    const retained = path.join(directory, 'retained');
    const removed = path.join(directory, 'removed');
    await fs.mkdir(retained);
    await fs.writeFile(path.join(retained, 'keep'), 'keep');
    await fs.mkdir(removed);
    await fs.symlink(retained, path.join(removed, 'link'));
    const dangling = path.join(directory, 'dangling');
    await fs.symlink(path.join(directory, 'missing'), dangling);
    const data = new DataToPersist();
    data.removePath(new RemovePath(removed));
    data.removePath(new RemovePath(dangling));
    await data.persistAllToFS();
    await absent(removed);
    await absent(dangling);
    assert.equal(await fs.readFile(path.join(retained, 'keep'), 'utf8'), 'keep');
  }
);

test('ordinary directory links and avoidHardLink match canonical link kinds and targets', async (t) => {
  const { directory } = await setup(t);
  async function run(name, flag) {
    process.env.BIT_RUST_WORKSPACE_PERSISTENCE = flag;
    const base = path.join(directory, name);
    await fs.mkdir(path.join(base, 'source-dir'), { recursive: true });
    await fs.writeFile(path.join(base, 'source-file'), 'source');
    const data = new DataToPersist();
    data.addSymlink(new Symlink(path.join(base, 'source-dir'), path.join(base, 'links/dir')));
    data.addSymlink(new Symlink(path.join(base, 'source-file'), path.join(base, 'links/file'), undefined, true));
    await data.persistAllToFS();
    const dir = await fs.lstat(path.join(base, 'links/dir'));
    const file = await fs.lstat(path.join(base, 'links/file'));
    assert.equal(await fs.readFile(path.join(base, 'links/file'), 'utf8'), 'source');
    assert.equal(await fs.realpath(path.join(base, 'links/dir')), await fs.realpath(path.join(base, 'source-dir')));
    return { dirLink: dir.isSymbolicLink(), fileLink: file.isSymbolicLink() };
  }
  assert.deepEqual(await run('native', 'on'), await run('node', 'off'));
});

test('custom remove, write and link hooks preserve phase order and original receivers', async (t) => {
  const { directory } = await setup(t);
  const data = new DataToPersist();
  const events = [];
  const removal = new RemovePath(path.join(directory, 'old'));
  removal.persistToFS = async function () {
    assert.equal(this, removal);
    events.push('remove');
  };
  data.removePath(removal);
  const file = vinyl(directory, 'custom');
  file.write = async function () {
    assert.equal(this, file);
    assert.deepEqual(events, ['remove']);
    events.push('write');
    await fs.writeFile(this.path, 'custom');
  };
  data.addFile(file);
  const link = new Symlink(file.path, path.join(directory, 'link'));
  link.write = function () {
    assert.equal(this, link);
    assert.deepEqual(events, ['remove', 'write']);
    events.push('link');
  };
  data.addSymlink(link);
  await data.persistAllToFS();
  assert.deepEqual(events, ['remove', 'write', 'link']);
});

test('filesystem write errors preserve canonical identity and prevent link phase', async (t) => {
  const { directory, children } = await setup(t);
  await fs.mkdir(path.join(directory, 'blocked'));
  async function run(flag) {
    process.env.BIT_RUST_WORKSPACE_PERSISTENCE = flag;
    const data = new DataToPersist();
    data.addFile(vinyl(directory, 'blocked'));
    let linked = false;
    data.addSymlink({
      src: directory,
      dest: path.join(directory, 'link'),
      write() {
        linked = true;
      },
    });
    try {
      await data.persistAllToFS();
      assert.fail('expected filesystem error');
    } catch (error) {
      assert.equal(linked, false);
      return { constructor: error.constructor.name, code: error.code, syscall: error.syscall, path: error.path };
    }
  }
  assert.deepEqual(await run('on'), await run('off'));
  await closed(children);
});

test('missing helper falls back across the complete operation', async (t) => {
  const { directory } = await setup(t, path.join(os.tmpdir(), 'missing-bit-persistence-helper'));
  const target = path.join(directory, 'stale');
  await fs.writeFile(target, 'stale');
  const data = new DataToPersist();
  data.removePath(new RemovePath(target));
  data.addFile(vinyl(directory, 'source'));
  data.addSymlink(new Symlink(path.join(directory, 'source'), path.join(directory, 'link')));
  await data.persistAllToFS();
  await absent(target);
  assert.deepEqual(await fs.readFile(path.join(directory, 'source')), await fs.readFile(path.join(directory, 'link')));
});

test(
  'a crashed helper is reaped before replaying canonical hooks',
  { skip: process.platform === 'win32' },
  async (t) => {
    const executable = path.join(os.tmpdir(), `bit-persistence-crash-${process.pid}-${Date.now()}`);
    await fs.writeFile(executable, '#!/usr/bin/env node\nprocess.stdin.once("data", () => process.exit(1));\n', {
      mode: 0o755,
    });
    t.after(() => fs.rm(executable, { force: true }));
    const { directory, children } = await setup(t, executable);
    const data = new DataToPersist();
    data.addFile(vinyl(directory, 'source'));
    data.addSymlink({
      src: directory,
      dest: path.join(directory, 'link'),
      write() {
        assert.ok(children.length > 0);
        for (const child of children) assert.ok(child.exitCode !== null || child.signalCode !== null);
      },
    });
    await data.persistAllToFS();
    assert.equal(await fs.readFile(path.join(directory, 'source'), 'utf8'), 'new' + os.EOL);
  }
);

test('parallel persistence operations share at most four helpers and release all borrowed sessions', async (t) => {
  const { directory, children, acknowledgements } = await setup(t);
  await withWorkspacePersistence(() =>
    Promise.all(
      Array.from({ length: 12 }, async (_, index) => {
        const data = new DataToPersist();
        data.addFile(vinyl(directory, `component-${index}/source`));
        data.addSymlink(
          new Symlink(path.join(directory, `component-${index}/source`), path.join(directory, `links/${index}`))
        );
        await data.persistAllToFS();
      })
    )
  );
  assert.ok(children.length > 0 && children.length <= 4);
  assert.ok(frames(acknowledgements).length >= 2);
  for (let index = 0; index < 12; index++)
    assert.equal(await fs.readFile(path.join(directory, `links/${index}`), 'utf8'), 'new' + os.EOL);
  await closed(children);
});

test('absolute path validation runs before native deletion or helper launch', async (t) => {
  const { directory, children } = await setup(t);
  const retained = path.join(directory, 'retained');
  await fs.writeFile(retained, 'retain');
  const data = new DataToPersist();
  data.removePath(new RemovePath(retained));
  const file = vinyl(directory, 'relative');
  file.path = 'relative';
  data.addFile(file);
  await assert.rejects(data.persistAllToFS(), /expects relative to be absolute/);
  assert.equal(await fs.readFile(retained, 'utf8'), 'retain');
  assert.equal(children.length, 0);
});

test('an explicit persistence scope reuses one helper across sequential operations and closes on thrown errors', async (t) => {
  const { directory, children, acknowledgements } = await setup(t);
  const failure = new Error('caller failure');
  await assert.rejects(
    withWorkspacePersistence(async () => {
      for (let index = 0; index < 3; index++) {
        const data = new DataToPersist();
        data.addFile(vinyl(directory, `scope/${index}`));
        await data.persistAllToFS();
      }
      assert.equal(children.length, 1);
      assert.equal(children[0].exitCode, null);
      throw failure;
    }),
    (error) => error === failure
  );
  assert.equal(
    frames(acknowledgements).reduce((sum, frame) => sum + frame.completed, 0),
    3
  );
  await closed(children);
});

test('failed ordinary links replay canonical BitError and stop subsequent links', async (t) => {
  const { directory, children } = await setup(t);
  async function run(flag) {
    process.env.BIT_RUST_WORKSPACE_PERSISTENCE = flag;
    const data = new DataToPersist();
    data.addSymlink(new Symlink(path.join(directory, 'missing-source'), path.join(directory, 'link')));
    let later = false;
    data.addSymlink({
      src: directory,
      dest: path.join(directory, 'later'),
      write() {
        later = true;
      },
    });
    try {
      await data.persistAllToFS();
      assert.fail('expected link failure');
    } catch (error) {
      assert.equal(later, false);
      return { constructor: error.constructor.name, message: error.message };
    }
  }
  assert.deepEqual(await run('on'), await run('off'));
  await closed(children);
});

test('custom phase hooks can add files, add links and replace later link entries', async (t) => {
  const { directory } = await setup(t);
  const data = new DataToPersist();
  const removal = new RemovePath(path.join(directory, 'old'));
  removal.persistToFS = async () => {
    const file = vinyl(directory, 'created-by-remove');
    file.write = async () => {
      await fs.writeFile(file.path, 'created');
      const first = {
        src: file.path,
        dest: path.join(directory, 'first'),
        write() {
          data.symlinks[1] = {
            src: file.path,
            dest: path.join(directory, 'replacement'),
            write() {
              assert.equal(require('node:fs').readFileSync(file.path, 'utf8'), 'created');
              events.push('replacement');
            },
          };
          events.push('first');
        },
      };
      data.addSymlink(first);
      data.addSymlink({
        src: file.path,
        dest: path.join(directory, 'never'),
        write() {
          assert.fail('stale link entry invoked');
        },
      });
    };
    data.addFile(file);
  };
  const events = [];
  data.removePath(removal);
  await data.persistAllToFS();
  assert.deepEqual(events, ['first', 'replacement']);
  assert.equal(await fs.readFile(path.join(directory, 'created-by-remove'), 'utf8'), 'created');
});

test('overriding a DataToPersist phase preserves the canonical operation and avoids helpers', async (t) => {
  const { directory, children } = await setup(t);
  const data = new DataToPersist();
  const phases = [];
  data._deletePathsFromFS = async () => {
    phases.push('remove');
  };
  data._persistFilesToFS = async () => {
    phases.push('files');
  };
  data._persistSymlinksToFS = async () => {
    phases.push('links');
  };
  data.addFile(vinyl(directory, 'unused'));
  await data.persistAllToFS();
  assert.deepEqual(phases, ['remove', 'files', 'links']);
  assert.equal(children.length, 0);
});

test('fully custom filesystem work launches no idle helper', async (t) => {
  const { directory, children, acknowledgements } = await setup(t);
  const data = new DataToPersist();
  const removed = new RemovePath(path.join(directory, 'custom'));
  removed.persistToFS = async () => {};
  data.removePath(removed);
  const file = vinyl(directory, 'custom');
  file.write = async () => {};
  data.addFile(file);
  data.addSymlink({ src: directory, dest: path.join(directory, 'link'), write() {} });
  await withWorkspacePersistence(() => data.persistAllToFS());
  assert.equal(children.length, 0);
  assert.deepEqual(frames(acknowledgements), []);
});

test('nested persistence scopes reuse their outer helper until the outer scope closes', async (t) => {
  const { directory, children } = await setup(t);
  await withWorkspacePersistence(async () => {
    for (let index = 0; index < 3; index++) {
      await withWorkspacePersistence(async () => {
        const data = new DataToPersist();
        data.addFile(vinyl(directory, `nested/${index}`));
        await data.persistAllToFS();
      });
      assert.equal(children.length, 1);
      assert.equal(children[0].exitCode, null);
    }
  });
  await closed(children);
});

test('scoped operations honor helper configuration changes instead of borrowing the previous executable', async (t) => {
  const { directory, children } = await setup(t);
  await withWorkspacePersistence(async () => {
    const first = new DataToPersist();
    first.addFile(vinyl(directory, 'first'));
    await first.persistAllToFS();
    assert.equal(children.length, 1);
    const recorded = [];
    children[0].stdout.on('data', (data) => recorded.push(data));
    process.env.BIT_RUST_OBJECT_IMPORT = path.join(directory, 'missing-helper');
    const second = new DataToPersist();
    second.addFile(vinyl(directory, 'second'));
    await second.persistAllToFS();
    assert.equal(await fs.readFile(path.join(directory, 'second'), 'utf8'), 'new' + os.EOL);
    assert.deepEqual(recorded, []);
    process.env.BIT_RUST_OBJECT_IMPORT = native;
    const third = new DataToPersist();
    third.addFile(vinyl(directory, 'third'));
    await third.persistAllToFS();
    assert.equal(children.length, 1);
    assert.ok(recorded.length > 0);
  });
  await closed(children);
});

test('prototype hooks installed before reloading the adapter remain canonical', async (t) => {
  const { directory, children } = await setup(t);
  const modulePath = compiled
    ? path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-persistence.js')
    : path.join(root, 'scopes/component/sources/rust-workspace-persistence.ts');
  const originalCache = require.cache[modulePath];
  const originalRemove = RemovePath.prototype.persistToFS;
  const originalLink = Symlink.prototype.write;
  const events = [];
  RemovePath.prototype.persistToFS = async function () {
    events.push(['remove', this.path]);
  };
  Symlink.prototype.write = function () {
    events.push(['link', this.dest]);
  };
  delete require.cache[modulePath];
  try {
    const fresh = require(modulePath);
    const data = new DataToPersist();
    data.removePath(new RemovePath(path.join(directory, 'removed')));
    data.addSymlink(new Symlink(directory, path.join(directory, 'link')));
    const defaults = {
      _deletePathsFromFS: data._deletePathsFromFS,
      _persistFilesToFS: data._persistFilesToFS,
      _persistSymlinksToFS: data._persistSymlinksToFS,
    };
    assert.equal(await fresh.persistWorkspaceOperation(data, defaults), true);
    assert.deepEqual(events, [
      ['remove', path.join(directory, 'removed')],
      ['link', path.join(directory, 'link')],
    ]);
    assert.equal(children.length, 0);
  } finally {
    RemovePath.prototype.persistToFS = originalRemove;
    Symlink.prototype.write = originalLink;
    if (originalCache) require.cache[modulePath] = originalCache;
    else delete require.cache[modulePath];
  }
});

test('mixed custom link phases preserve synchronous ordering across queued microtasks', async (t) => {
  const { directory } = await setup(t);
  async function run(flag) {
    process.env.BIT_RUST_WORKSPACE_PERSISTENCE = flag;
    const base = path.join(directory, flag);
    const data = new DataToPersist();
    data.addFile(vinyl(base, 'source'));
    const events = [];
    data.addSymlink({
      src: base,
      dest: path.join(base, 'first'),
      write() {
        events.push('first');
        queueMicrotask(() => {
          events.push('microtask');
          data.symlinks[2] = {
            src: base,
            dest: path.join(base, 'replacement'),
            write() {
              events.push('replacement');
            },
          };
        });
      },
    });
    data.addSymlink(new Symlink(path.join(base, 'source'), path.join(base, 'ordinary')));
    data.addSymlink({
      src: base,
      dest: path.join(base, 'last'),
      write() {
        events.push('last');
      },
    });
    await data.persistAllToFS();
    assert.equal(await fs.readFile(path.join(base, 'ordinary'), 'utf8'), 'new' + os.EOL);
    return events;
  }
  assert.deepEqual(await run('on'), ['first', 'last', 'microtask']);
  assert.deepEqual(await run('off'), ['first', 'last', 'microtask']);
});

test('a failed native ordinary link returns canonical BitError and stops the remaining ordinary phase', async (t) => {
  const { directory, acknowledgements, children } = await setup(t);
  await fs.writeFile(path.join(directory, 'source'), 'source');
  const data = new DataToPersist();
  data.addSymlink(new Symlink(path.join(directory, 'missing'), path.join(directory, 'failed')));
  data.addSymlink(new Symlink(path.join(directory, 'source'), path.join(directory, 'later')));
  await assert.rejects(
    data.persistAllToFS(),
    (error) => error.constructor.name === 'BitError' && error.message.includes('failed to generate a symlink')
  );
  const failed = frames(acknowledgements).filter((frame) => frame.failed);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].completed, 0);
  await absent(path.join(directory, 'later'));
  await closed(children);
});

test(
  'a failed scoped helper is retired and its slot can restart the same configured executable',
  { skip: process.platform === 'win32' },
  async (t) => {
    const executable = path.join(os.tmpdir(), `bit-persistence-restart-${process.pid}-${Date.now()}`);
    await fs.writeFile(executable, '#!/usr/bin/env node\nprocess.stdin.once("data", () => process.exit(1));\n', {
      mode: 0o755,
    });
    t.after(() => fs.rm(executable, { force: true }));
    const { directory, children } = await setup(t, executable);
    await withWorkspacePersistence(async () => {
      const first = new DataToPersist();
      first.addFile(vinyl(directory, 'first'));
      await first.persistAllToFS();
      assert.equal(children.length, 1);
      await closed(children);
      // Keep the resolved configuration unchanged while replacing the failed program with a healthy helper.
      await fs.copyFile(native, executable);
      await fs.chmod(executable, 0o755);
      const second = new DataToPersist();
      second.addFile(vinyl(directory, 'second'));
      await second.persistAllToFS();
      assert.equal(children.length, 2);
      assert.equal(children[1].exitCode, null);
      assert.equal(await fs.readFile(path.join(directory, 'second'), 'utf8'), 'new' + os.EOL);
    });
    await closed(children);
  }
);
