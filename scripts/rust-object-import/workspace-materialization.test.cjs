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
const { JsonVinyl } = compiled || source('scopes/component/sources/json-vinyl.ts');
const eol = installed('@teambit/toolbox.string.eol');
const { persistWorkspaceFiles } = compiled
  ? require(path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js'))
  : source('scopes/component/sources/rust-workspace-materializer.ts');
const native =
  process.env.BIT_TEST_OBJECT_IMPORT ||
  path.join(root, 'native/target/debug/bit-object-import' + (process.platform === 'win32' ? '.exe' : ''));

async function setup(t, executable = native) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-materialization-'));
  const previous = { helper: process.env.BIT_RUST_OBJECT_IMPORT, flag: process.env.BIT_RUST_WORKSPACE_MATERIALIZATION };
  process.env.BIT_RUST_OBJECT_IMPORT = executable;
  process.env.BIT_RUST_WORKSPACE_MATERIALIZATION = 'on';
  const originalSpawn = cp.spawn;
  const acknowledgements = [];
  const spawns = [];
  cp.spawn = (...args) => {
    const child = originalSpawn(...args);
    // The resolver converts Windows executable paths to the extended-length namespace.
    if (args[0] === path.toNamespacedPath(executable)) {
      spawns.push(args);
      child.stdout.on('data', (data) => acknowledgements.push(data.toString()));
    }
    return child;
  };
  t.after(async () => {
    cp.spawn = originalSpawn;
    for (const [key, value] of [
      ['BIT_RUST_OBJECT_IMPORT', previous.helper],
      ['BIT_RUST_WORKSPACE_MATERIALIZATION', previous.flag],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { directory, acknowledgements, spawns };
}
function file(directory, name, contents, overwrite = true) {
  const vinyl = new AbstractVinyl({
    base: directory,
    path: path.join(directory, name),
    contents: Buffer.from(contents),
  });
  vinyl.override = overwrite;
  return vinyl;
}
function frames(acknowledgements) {
  return acknowledgements.join('').trim().split('\n').filter(Boolean).map(JSON.parse);
}
test('actual DataToPersist materializes 150 nested files through multiple bounded native frames', async (t) => {
  const { directory, acknowledgements } = await setup(t);
  const data = new DataToPersist();
  for (let index = 0; index < 150; index++) data.addFile(file(directory, `nested/${index}.ts`, `a\r\nb\rc\n${index}`));
  await data.persistAllToFS();
  for (const vinyl of data.files) assert.deepEqual(await fs.readFile(vinyl.path), eol.auto(vinyl.contents));
  assert.deepEqual(
    frames(acknowledgements).map((frame) => frame.completed),
    [64, 36, 50]
  );
});
test('binary, empty, invalid UTF-8, Unicode and BOM contents match canonical newline policy', async (t) => {
  const { directory, acknowledgements } = await setup(t);
  const contents = [
    Buffer.alloc(0),
    Buffer.from([0, 255, 13, 10]),
    Buffer.from([255, 13, 10, 254]),
    Buffer.from('日本語 🚀\r\n\r\n'),
    Buffer.from('\ufeffhello\rworld'),
  ];
  const data = new DataToPersist();
  contents.forEach((bytes, index) => data.addFile(file(directory, `日本語/${index}`, bytes)));
  await data.persistAllToFS();
  for (const vinyl of data.files) assert.deepEqual(await fs.readFile(vinyl.path), eol.auto(vinyl.contents));
  assert.equal(frames(acknowledgements)[0].completed, contents.length);
});
test('overwrite=false retains canonical existence handling without launching a potentially partial native writer', async (t) => {
  const { directory, acknowledgements, spawns } = await setup(t);
  await fs.writeFile(path.join(directory, 'existing'), 'keep');
  await fs.mkdir(path.join(directory, 'existing-dir'));
  const data = new DataToPersist();
  data.addFile(file(directory, 'existing', 'replace', false));
  data.addFile(file(directory, 'existing-dir', 'replace', false));
  data.addFile(file(directory, 'new', 'create', false));
  await data.persistAllToFS();
  assert.equal(await fs.readFile(path.join(directory, 'existing'), 'utf8'), 'keep');
  assert.equal(await fs.readFile(path.join(directory, 'new'), 'utf8'), 'create');
  assert.deepEqual(frames(acknowledgements), []);
  assert.equal(spawns.length, 0);
});
test('deletions finish before Rust writes and link hooks run after complete materialization', async (t) => {
  const { directory, acknowledgements } = await setup(t);
  const target = path.join(directory, 'component');
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'stale'), 'remove');
  const data = new DataToPersist();
  data.removePath(new RemovePath(target));
  data.addFile(file(directory, 'component/new.ts', 'new'));
  let linked = false;
  data.addSymlink({
    src: target,
    dest: path.join(directory, 'link'),
    write() {
      assert.equal(require('node:fs').readFileSync(path.join(target, 'new.ts'), 'utf8'), 'new');
      assert.equal(require('node:fs').existsSync(path.join(target, 'stale')), false);
      linked = true;
    },
  });
  await data.persistAllToFS();
  assert.equal(linked, true);
  assert.equal(frames(acknowledgements)[0].completed, 1);
});
test('custom writes and atomic JsonVinyl retain their entire canonical concurrency chunk', async (t) => {
  const { directory, acknowledgements, spawns } = await setup(t);
  const data = new DataToPersist();
  data.addFile(file(directory, 'first', 'first'));
  const custom = file(directory, 'custom', 'custom');
  let called = 0;
  custom.write = async () => {
    called++;
    await fs.writeFile(custom.path, 'custom hook');
  };
  data.addFile(custom);
  data.addFile(JsonVinyl.load({ base: directory, path: path.join(directory, 'config.json'), content: { test: true } }));
  data.addFile(file(directory, 'last', 'last'));
  await data.persistAllToFS();
  assert.equal(called, 1);
  assert.equal(await fs.readFile(custom.path, 'utf8'), 'custom hook');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, 'config.json'), 'utf8')), { test: true });
  assert.deepEqual(frames(acknowledgements), []);
  assert.equal(spawns.length, 0, 'fully canonical operations must not launch idle helpers');
});
test('native filesystem failure replays the failed file with canonical error identity', async (t) => {
  const { directory, acknowledgements } = await setup(t);
  await fs.mkdir(path.join(directory, 'blocked'));
  const data = new DataToPersist();
  data.addFile(file(directory, 'first', 'committed'));
  data.addFile(file(directory, 'blocked', 'invalid'));
  let error;
  try {
    await data.persistAllToFS();
  } catch (caught) {
    error = caught;
  }
  assert.equal(error.code, 'EISDIR');
  assert.equal(error.path, path.join(directory, 'blocked'));
  assert.equal(await fs.readFile(path.join(directory, 'first'), 'utf8'), 'committed');
  assert.deepEqual(frames(acknowledgements)[0], { version: 1, id: 1, completed: 1, skipped: [], failed: true });
});
test('missing helper and disabled flag use canonical materialization', async (t) => {
  const { directory } = await setup(t, path.join(os.tmpdir(), 'missing-bit-materializer'));
  const data = new DataToPersist();
  data.addFile(file(directory, 'missing-helper', 'fallback\r\n'));
  await data.persistAllToFS();
  process.env.BIT_RUST_WORKSPACE_MATERIALIZATION = 'off';
  data.addFile(file(directory, 'off', 'disabled\r\n'));
  await data.persistAllToFS();
  for (const vinyl of data.files) assert.deepEqual(await fs.readFile(vinyl.path), eol.auto(vinyl.contents));
});
test(
  'in-place native writes retain modes, hard links and symlink targets',
  { skip: process.platform === 'win32' },
  async (t) => {
    const { directory, acknowledgements } = await setup(t);
    const target = path.join(directory, 'target');
    const linked = path.join(directory, 'hard');
    const symlink = path.join(directory, 'symlink');
    await fs.writeFile(target, 'long original');
    await fs.chmod(target, 0o640);
    await fs.link(target, linked);
    await fs.symlink(target, symlink);
    const before = await fs.stat(target);
    const data = new DataToPersist();
    data.addFile(file(directory, 'symlink', 'short'));
    await data.persistAllToFS();
    const after = await fs.stat(target);
    assert.equal(before.ino, after.ino);
    assert.equal(before.mode, after.mode);
    assert.equal(await fs.readFile(linked, 'utf8'), 'short');
    assert.equal((await fs.lstat(symlink)).isSymbolicLink(), true);
    assert.equal(frames(acknowledgements)[0].completed, 1);
  }
);

test(
  'malformed acknowledgement reaps a still-writing helper before canonical replay',
  { skip: process.platform === 'win32' },
  async (t) => {
    const { directory } = await setup(t);
    const helper = path.join(directory, 'bad-helper');
    const pidFile = path.join(directory, 'helper.pid');
    await fs.writeFile(
      helper,
      `#!${process.execPath}\nconst fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
process.stdin.once('data', bytes => {
  const length = bytes.readUInt32BE(12);
  const filename = bytes.subarray(16, 16 + length).toString();
  fs.writeFileSync(filename, 'unacknowledged partial');
  process.on('SIGTERM', () => setTimeout(() => { fs.writeFileSync(filename, 'late native write'); process.exit(0); }, 25));
  process.stdout.write(JSON.stringify({ version: 1, id: 999, completed: 1, skipped: [], failed: false }) + '\\n');
});
setInterval(() => {}, 1000);
`,
      { mode: 0o755 }
    );
    process.env.BIT_RUST_OBJECT_IMPORT = helper;
    const data = new DataToPersist();
    data.addFile(file(directory, 'file', 'canonical complete contents'));
    await data.persistAllToFS();
    assert.equal(await fs.readFile(path.join(directory, 'file'), 'utf8'), 'canonical complete contents');
    const pid = Number(await fs.readFile(pidFile, 'utf8'));
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
  }
);

test(
  'old helpers rejecting BWM1 fall back without losing contents',
  { skip: process.platform === 'win32' },
  async (t) => {
    const { directory } = await setup(t);
    const helper = path.join(directory, 'old-helper');
    await fs.writeFile(helper, `#!${process.execPath}\nprocess.stdin.once('data', () => process.exit(1));\n`, {
      mode: 0o755,
    });
    process.env.BIT_RUST_OBJECT_IMPORT = helper;
    const data = new DataToPersist();
    data.addFile(file(directory, 'nested/first', 'first'));
    data.addFile(file(directory, 'nested/second', Buffer.from([0, 255, 13, 10])));
    await data.persistAllToFS();
    for (const vinyl of data.files) assert.deepEqual(await fs.readFile(vinyl.path), eol.auto(vinyl.contents));
  }
);

test('absolute path validation happens before helper creation or deletions', async (t) => {
  const { directory, acknowledgements } = await setup(t);
  const data = new DataToPersist();
  data.files.push({ path: 'relative.ts' });
  await assert.rejects(data.persistAllToFS(), /expects relative.ts to be absolute/);
  assert.deepEqual(acknowledgements, []);
  assert.deepEqual(await fs.readdir(directory), []);
});

test('large binary files split at the native byte limit without corruption', async (t) => {
  const { directory, acknowledgements } = await setup(t);
  const data = new DataToPersist();
  const bytes = Buffer.alloc(17 * 1024 * 1024);
  for (let index = 0; index < 3; index++) data.addFile(file(directory, String(index), bytes));
  await data.persistAllToFS();
  for (const vinyl of data.files) assert.deepEqual(await fs.readFile(vinyl.path), bytes);
  assert.deepEqual(
    frames(acknowledgements).map((frame) => frame.completed),
    [1, 1, 1]
  );
});

test('files above the byte limit use the canonical writer', async (t) => {
  const { directory, acknowledgements } = await setup(t);
  const bytes = Buffer.alloc(32 * 1024 * 1024 + 1);
  const data = new DataToPersist();
  data.addFile(file(directory, 'oversized', bytes));
  await data.persistAllToFS();
  assert.deepEqual(await fs.readFile(data.files[0].path), bytes);
  assert.deepEqual(frames(acknowledgements), []);
});

test('filesystem failures never start files beyond the configured concurrency chunk', async (t) => {
  const { directory, acknowledgements } = await setup(t);
  const files = Array.from({ length: 130 }, (_, index) => file(directory, String(index), `file ${index}`));
  await fs.mkdir(files[65].path);
  await assert.rejects(persistWorkspaceFiles(files, 100));
  await assert.rejects(fs.stat(files[100].path), { code: 'ENOENT' });
  await assert.rejects(fs.stat(files[129].path), { code: 'ENOENT' });
  assert.deepEqual(
    frames(acknowledgements).map((frame) => frame.completed),
    [64, 1]
  );
  // Drain already-started canonical writes before removing the temporary root.
  await new Promise((resolve) => setTimeout(resolve, 30));
});

test('parallel materializations bound native sessions and release slots for subsequent work', async (t) => {
  const { directory, acknowledgements } = await setup(t);
  const operations = Array.from({ length: 8 }, (_, operation) => {
    const data = new DataToPersist();
    for (let index = 0; index < 8; index++)
      data.addFile(file(directory, `${operation}/${index}`, `operation ${operation}, file ${index}`));
    return data;
  });
  await Promise.all(operations.map((data) => data.persistAllToFS()));
  for (const data of operations)
    for (const vinyl of data.files) assert.deepEqual(await fs.readFile(vinyl.path), vinyl.contents);
  assert.equal(frames(acknowledgements).length, 4);
  const subsequent = new DataToPersist();
  subsequent.addFile(file(directory, 'subsequent', 'next'));
  await subsequent.persistAllToFS();
  assert.equal(frames(acknowledgements).length, 5);
});

test('custom writers adding files do not change the in-progress file-list snapshot', async (t) => {
  const { directory } = await setup(t);
  const data = new DataToPersist();
  const custom = file(directory, 'custom', 'custom');
  custom.write = async () => {
    data.addFile(file(directory, 'added-later', 'later'));
    await fs.writeFile(custom.path, 'custom');
  };
  data.addFile(custom);
  data.addFile(file(directory, 'original', 'original'));
  await data.persistAllToFS();
  assert.equal(await fs.readFile(path.join(directory, 'original'), 'utf8'), 'original');
  await assert.rejects(fs.stat(path.join(directory, 'added-later')), { code: 'ENOENT' });
});

test('prototype hooks installed before materializer loading retain their write behavior', async (t) => {
  const { directory, acknowledgements } = await setup(t);
  const modulePath = compiled
    ? path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
    : path.join(root, 'scopes/component/sources/rust-workspace-materializer.ts');
  const cached = require.cache[modulePath];
  const original = AbstractVinyl.prototype.write;
  let called = 0;
  AbstractVinyl.prototype.write = async function () {
    called++;
    await fs.writeFile(this.path, 'prototype hook');
  };
  delete require.cache[modulePath];
  try {
    const fresh = require(modulePath);
    const hooked = file(directory, 'hooked', 'original');
    if (!(await fresh.persistWorkspaceFiles([hooked], 100))) await hooked.write();
    assert.equal(called, 1);
    assert.equal(await fs.readFile(path.join(directory, 'hooked'), 'utf8'), 'prototype hook');
    assert.deepEqual(frames(acknowledgements), []);
  } finally {
    AbstractVinyl.prototype.write = original;
    require.cache[modulePath] = cached;
  }
});

test('custom writers separated by ordinary files retain concurrent execution and native writes resume on the next chunk', async (t) => {
  const { directory, acknowledgements } = await setup(t);
  let release;
  let reject;
  const gate = new Promise((resolve, fail) => {
    release = resolve;
    reject = fail;
  });
  const first = file(directory, 'first', 'first');
  first.write = async () => {
    const deadline = setTimeout(() => reject(new Error('custom writers were serialized')), 500);
    try {
      await gate;
    } finally {
      clearTimeout(deadline);
    }
    await fs.writeFile(first.path, 'first hook');
  };
  const second = file(directory, 'second', 'second');
  second.write = async () => {
    release();
    await fs.writeFile(second.path, 'second hook');
  };
  await persistWorkspaceFiles(
    [first, file(directory, 'ordinary', 'ordinary'), second, file(directory, 'next-chunk', 'next')],
    3
  );
  assert.equal(await fs.readFile(first.path, 'utf8'), 'first hook');
  assert.equal(await fs.readFile(second.path, 'utf8'), 'second hook');
  assert.equal(await fs.readFile(path.join(directory, 'next-chunk'), 'utf8'), 'next');
  assert.deepEqual(
    frames(acknowledgements).map((frame) => frame.completed),
    [1]
  );
});

test('failed materialization does not start the link phase', async (t) => {
  const { directory } = await setup(t);
  await fs.mkdir(path.join(directory, 'blocked'));
  const data = new DataToPersist();
  data.addFile(file(directory, 'blocked', 'invalid'));
  let called = false;
  data.addSymlink({
    src: directory,
    dest: path.join(directory, 'link'),
    write() {
      called = true;
    },
  });
  await assert.rejects(data.persistAllToFS());
  assert.equal(called, false);
});

test(
  'JsonVinyl retains its canonical rejection of symbolic-link destinations',
  { skip: process.platform === 'win32' },
  async (t) => {
    const { directory, acknowledgements } = await setup(t);
    const target = path.join(directory, 'target');
    const link = path.join(directory, 'config.json');
    await fs.writeFile(target, 'original');
    await fs.symlink(target, link);
    const data = new DataToPersist();
    data.addFile(JsonVinyl.load({ base: directory, path: link, content: { test: true } }));
    await assert.rejects(data.persistAllToFS(), /trying to write.*into a symlink file/);
    assert.equal(await fs.readFile(target, 'utf8'), 'original');
    assert.deepEqual(frames(acknowledgements), []);
  }
);
