const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { root, installed, source } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_THREE_WAY_MERGE_COMPILED === '1';
const mergeRoot = path.dirname(installed.resolve('@teambit/component.modules.merge-helper'));
const adapter = compiled
  ? require(path.join(mergeRoot, 'rust-three-way-merge.js'))
  : source('scopes/component/modules/merge-helper/rust-three-way-merge.ts');
const merge = compiled
  ? installed('@teambit/component.modules.merge-helper')
  : source('scopes/component/modules/merge-helper/three-way-merge.ts');
const { Repository, Source } = installed('@teambit/objects');
const { ConsumerComponent } = installed('@teambit/legacy.consumer-component');
const sources = installed('@teambit/component.sources');
const persistence = require(
  path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-persistence.js')
);
const helper = process.env.BIT_TEST_OBJECT_IMPORT || path.join(root, 'native/target/debug/bit-object-import');
async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-three-way-merge-'));
  const previous = { flag: process.env.BIT_RUST_CLIENT_VCS, helper: process.env.BIT_RUST_OBJECT_IMPORT };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  process.env.BIT_RUST_OBJECT_IMPORT = helper;
  t.after(async () => {
    for (const [name, value] of [
      ['BIT_RUST_CLIENT_VCS', previous.flag],
      ['BIT_RUST_OBJECT_IMPORT', previous.helper],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await fs.rm(directory, { recursive: true, force: true });
  });
  const repo = new Repository(path.join(directory, 'scope'), {});
  const scope = { objects: repo, getPath: () => path.join(directory, 'scope') };
  async function model(files) {
    const models = [];
    for (const [relativePath, contents] of Object.entries(files)) {
      const object = Source.from(Buffer.from(contents));
      const filename = repo.objectPath(object.hash());
      await fs.mkdir(path.dirname(filename), { recursive: true });
      await fs.writeFile(filename, await object.compress());
      models.push({
        name: path.basename(relativePath),
        relativePath,
        test: relativePath.endsWith('.spec.js'),
        file: object.hash(),
      });
    }
    return { files: models };
  }
  async function current(files) {
    const filenames = Object.keys(files).map((relative) => path.join(directory, 'workspace', relative));
    await Promise.all(
      Object.entries(files).map(async ([relative, contents]) => {
        const filename = path.join(directory, 'workspace', relative);
        await fs.mkdir(path.dirname(filename), { recursive: true });
        await fs.writeFile(filename, contents);
      })
    );
    const reader = require(
      path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-reader.js')
    );
    const reads = await reader.readRustWorkspaceFiles(filenames);
    assert.ok(reads);
    const component = Object.create(ConsumerComponent.prototype);
    component.files = reads.map((read) => {
      const file = new sources.SourceFile({
        base: path.join(directory, 'workspace'),
        path: read.path,
        contents: read.contents,
      });
      sources.registerRustWorkspaceFile(file, read);
      return file;
    });
    return component;
  }
  return { directory, scope, model, current };
}
function publicResult(result) {
  // Canonical updatedFiles pushes after parallel Source loads; compare its complete rows independently of I/O order.
  const ordered = {
    ...result,
    updatedFiles: [...result.updatedFiles].sort((a, b) =>
      a.filePath < b.filePath ? -1 : a.filePath > b.filePath ? 1 : 0
    ),
  };
  const file = (value) =>
    value && {
      relative: value.relative,
      contents: value.contents.toString('hex'),
      test: value.test,
      label: value.label,
    };
  return Object.fromEntries(
    Object.entries(ordered).map(([kind, rows]) => [
      kind,
      Array.isArray(rows)
        ? rows.map((row) => ({
            ...row,
            fsFile: file(row.fsFile),
            content: row.content?.toString('hex'),
            baseFile: row.baseFile && { ...row.baseFile, file: row.baseFile.file.toString() },
            otherFile: row.otherFile && { ...row.otherFile, file: row.otherFile.file.toString() },
          }))
        : rows,
    ])
  );
}
async function parity(params) {
  const actual = await sources.withWorkspacePersistence(() => adapter.tryRustThreeWayMerge(params));
  assert.ok(actual, 'eligible three-way merge must actually run natively');
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  let expected;
  try {
    expected = await merge.threeWayMerge(params);
  } finally {
    process.env.BIT_RUST_CLIENT_VCS = 'on';
  }
  assert.deepEqual(publicResult(actual), publicResult(expected));
  return actual;
}

test('whole native three-way merge preserves all file categories, conflict bytes, binary CRLF and deletion duplicates', async (t) => {
  const fixture = await setup(t);
  const base = {
    'same.js': 'same\n',
    'update.js': 'base\n',
    'update-large.js': 'base\n'.repeat(2000),
    'clean.js': 'first base\nmid\nlast base\n',
    'conflict.js': 'base\n',
    'binary.bin': Buffer.from([0, 255, 13, 10, 254]),
    'deleted-remote.js': 'remove\n',
    'deleted-local.js': 'remain\n',
    'deleted-modified.js': 'old\n',
    'eol.js': 'line1\nline2\n',
  };
  const other = {
    ...base,
    'update.js': 'other\n',
    'update-large.js': 'other\n'.repeat(2001),
    'clean.js': 'first base\nmid\nlast other\n',
    'conflict.js': 'other\n',
    'binary.bin': Buffer.from([0, 251, 13, 10, 250]),
    'deleted-modified.js': 'changed\n',
    'added-other.spec.js': 'added other\n',
  };
  delete other['deleted-remote.js'];
  const current = {
    ...base,
    'clean.js': 'first current\nmid\nlast base\n',
    'conflict.js': 'current\n',
    'binary.bin': Buffer.from([0, 253, 13, 10, 252]),
    'eol.js': '\ufeffline1\r\nline2\r\n',
    'added-current.js': 'added current\n',
  };
  delete current['deleted-local.js'];
  delete current['deleted-modified.js'];
  const params = {
    scope: fixture.scope,
    baseComponent: await fixture.model(base),
    otherComponent: await fixture.model(other),
    currentComponent: await fixture.current(current),
    currentLabel: 'current label',
    otherLabel: 'other label',
  };
  const result = await parity(params);
  assert.equal(result.hasConflicts, true);
  assert.equal(result.deletedConflictFiles.filter((row) => row.filePath === 'deleted-modified.js').length, 2);
  assert.equal(result.modifiedFiles.find((row) => row.filePath === 'binary.bin').isBinaryConflict, true);
  assert.deepEqual(
    result.updatedFiles.map((row) => row.filePath),
    ['update.js', 'update-large.js']
  );
  assert.ok(result.unModifiedFiles.some((row) => row.filePath === 'eol.js'));
});

test('custom Ref getters and stale workspace buffers decline native merge planning without invoking hooks', async (t) => {
  const fixture = await setup(t);
  const params = {
    scope: fixture.scope,
    baseComponent: await fixture.model({ 'index.js': 'base\n' }),
    otherComponent: await fixture.model({ 'index.js': 'other\n' }),
    currentComponent: await fixture.current({ 'index.js': 'current\n' }),
    currentLabel: 'current',
    otherLabel: 'other',
  };
  let calls = 0;
  Object.defineProperty(params.baseComponent.files[0].file, 'load', {
    configurable: true,
    get() {
      calls++;
      return () => {};
    },
  });
  assert.equal(await adapter.tryRustThreeWayMerge(params), undefined);
  assert.equal(calls, 0);
  Reflect.deleteProperty(params.baseComponent.files[0].file, 'load');
  params.currentComponent.files[0].contents[0] = 88;
  assert.equal(await adapter.tryRustThreeWayMerge(params), undefined);
});

test('native merge input frames contain only verified descriptors rather than source bodies', async (t) => {
  const fixture = await setup(t);
  const params = {
    scope: fixture.scope,
    baseComponent: await fixture.model({ 'index.js': 'base\n' }),
    otherComponent: await fixture.model({ 'index.js': 'other\n' }),
    currentComponent: await fixture.current({ 'index.js': 'base\n' }),
    currentLabel: 'current',
    otherLabel: 'other',
  };
  const original = persistence.withWorkspaceSession;
  t.after(() => {
    persistence.withWorkspaceSession = original;
  });
  let input;
  persistence.withWorkspaceSession = (action) =>
    original((session) =>
      action({
        ...session,
        request(build, ...rest) {
          const frame = build(1);
          input = JSON.parse(frame.subarray(12));
          return session.request(build, ...rest);
        },
      })
    );
  assert.ok(await adapter.tryRustThreeWayMerge(params));
  assert.equal(input.kind, 'mergeFiles');
  for (const row of [...input.base, ...input.other, ...input.current]) {
    assert.equal(row.body, undefined);
    assert.equal(row.contents, undefined);
  }
});

test('canonical updated files follow Source load completion order while parity preserves complete rows', async (t) => {
  const fixture = await setup(t);
  const params = {
    scope: fixture.scope,
    baseComponent: await fixture.model({ 'first.js': 'base first\n', 'second.js': 'base second\n' }),
    otherComponent: await fixture.model({ 'first.js': 'other first\n', 'second.js': 'other second\n' }),
    currentComponent: await fixture.current({ 'first.js': 'base first\n', 'second.js': 'base second\n' }),
    currentLabel: 'current',
    otherLabel: 'other',
  };
  const first = Source.from(Buffer.from('other first\n'));
  const second = Source.from(Buffer.from('other second\n'));
  let releaseFirst;
  const firstLoad = new Promise((resolve) => {
    releaseFirst = () => resolve(first);
  });
  params.otherComponent.files[0].file.load = () => firstLoad;
  params.otherComponent.files[1].file.load = async () => second;
  Object.defineProperty(second, 'contents', {
    get() {
      // Reading the second body happens immediately before its push; only then release the first load.
      releaseFirst();
      return Buffer.from('other second\n');
    },
  });
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  let result;
  try {
    result = await merge.threeWayMerge(params);
  } finally {
    process.env.BIT_RUST_CLIENT_VCS = 'on';
  }
  assert.deepEqual(
    result.updatedFiles.map((row) => row.filePath),
    ['second.js', 'first.js']
  );
  assert.deepEqual(
    result.updatedFiles.map((row) => row.content.toString()),
    ['other second\n', 'other first\n']
  );
  assert.deepEqual(publicResult(result), publicResult({ ...result, updatedFiles: [...result.updatedFiles].reverse() }));
});
