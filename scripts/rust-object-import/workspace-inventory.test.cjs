const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createRequire } = require('node:module');
const { source, installed } = require('./load-source.cjs');
const compiled = process.env.BIT_TEST_WORKSPACE_INVENTORY_COMPILED === '1';
const bitmapEntry = installed.resolve('@teambit/legacy.bit-map');
const bitmap = compiled
  ? require(path.join(path.dirname(bitmapEntry), 'component-map.js'))
  : source('components/legacy/bit-map/component-map.ts');
const ignore = createRequire(bitmapEntry)('ignore');
const sources = installed('@teambit/component.sources');
const Session = require(
  path.join(path.dirname(installed.resolve('@teambit/component.sources')), 'rust-workspace-materializer.js')
).MaterializationSession;
async function fixture(t, files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-inventory-'));
  const flag = process.env.BIT_RUST_CLIENT_VCS,
    helper = process.env.BIT_RUST_OBJECT_IMPORT;
  process.env.BIT_RUST_OBJECT_IMPORT = process.env.BIT_TEST_OBJECT_IMPORT;
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
    if (flag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = flag;
    if (helper === undefined) delete process.env.BIT_RUST_OBJECT_IMPORT;
    else process.env.BIT_RUST_OBJECT_IMPORT = helper;
  });
  for (const [name, bytes] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await fs.writeFile(path.join(root, name), bytes);
  }
  return root;
}
async function compare(root, directory, patterns, excluded = [], trackAllFiles = true, fallback = false) {
  const canonical = ignore().add(patterns),
    native = ignore().add(patterns);
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  const expected = await bitmap.getFilesByDir(directory, root, canonical, excluded, trackAllFiles);
  const requests = [],
    original = Session.prototype.request;
  Session.prototype.request = function (build, ...args) {
    return original.call(
      this,
      (id) => {
        const frame = build(id);
        if (frame.subarray(0, 4).toString() === 'BWS1') requests.push(JSON.parse(frame.subarray(12)).kind);
        return frame;
      },
      ...args
    );
  };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  try {
    const actual = await sources.withWorkspacePersistence(() =>
      bitmap.getFilesByDir(directory, root, native, excluded, trackAllFiles)
    );
    assert.deepEqual(actual, expected);
    assert.deepEqual(native._cache, canonical._cache);
    assert.ok(requests.includes('inventoryBegin'), JSON.stringify(requests));
    if (fallback)
      assert.ok(requests.includes('scan'), 'unsupported inventories use the canonical policy implementation');
    else {
      assert.ok(requests.includes('inventoryFinish'), JSON.stringify(requests));
      assert.equal(
        requests.includes('scan'),
        false,
        'qualified inventory must not fall back to path transfer and Node filtering'
      );
    }
  } finally {
    Session.prototype.request = original;
  }
}
test('Rust inventory preserves root and own ignores, case folding, negation and inherited cache entries', async (t) => {
  const root = await fixture(t, {
    'component/main.js': '',
    'component/a.log': '',
    'component/keep.log': '',
    'component/sub/a.log': '',
    'component/sub/keep.log': '',
    'component/UPPER.JS': '',
    'component/toString': '',
    'component/.bitignore': '*.log\r\n!keep.log\r\n',
  });
  await compare(root, 'component', ['**/upper.js', '**/toString']);
});
test('workspace-root inventory keeps bitmap, nested ignore precedence and nested component ownership', async (t) => {
  const root = await fixture(t, {
    '.bitmap': '{}',
    'main.js': '',
    'docs/a.log': '',
    'docs/keep.log': '',
    'docs/.gitignore': '*.js\n',
    'docs/.bitignore': '*.log\n!keep.log\n',
    'docs/deep/.gitignore': '!a.log\n',
    'docs/deep/a.log': '',
    'other/component.js': '',
    'node_modules/dependency/index.js': '',
  });
  await compare(root, '.', ['.bitmap', '*.log'], ['other']);
});
test('installed ignore expressions match Rust for wildcard and escaped path cases', async (t) => {
  const names = [
    'main.js',
    'a.js',
    'A.JS',
    'a.log',
    'keep.log',
    'a b.txt',
    '#name',
    '!name',
    '[name]',
    'dir/a.js',
    'dir/a.log',
    'dir/deep/b.js',
    'toString',
    'constructor',
  ];
  const root = await fixture(t, Object.fromEntries(names.map((name) => [name, ''])));
  for (const patterns of [
    ['*.log'],
    ['*.js', '!main.js'],
    ['dir/*', '!dir/a.js'],
    ['dir/', '!dir/deep/b.js'],
    ['**/a.*'],
    ['[a-z].*'],
    ['\\#name', '\\!name'],
    ['*', '!main.js'],
    ['?', '!main.js'],
    ['k', 's', 'i'],
    ['**/*.js', '!dir/**'],
    ['a\\ b.txt'],
    ['\\[name\\]'],
  ])
    await compare(root, '.', patterns);
});

test('Unicode inventories preserve V8 legacy case folding through canonical fallback', async (t) => {
  const names = ['main.js', 'ß', 'İ', 'ı', 'ſ', 'K', '😀'];
  const root = await fixture(t, Object.fromEntries(names.map((name) => [name, ''])));
  await compare(root, '.', ['k', 's', 'i'], [], true, true);
});

test('parallel inventory matches policy and cache results across chunk boundaries', async (t) => {
  const files = {
    '.bitmap': '{}',
    'docs/.bitignore': '*.log\n!keep.log\n',
    'ignored/.gitignore': '!*.js\n',
    'ignored/a.js': '',
  };
  for (let index = 0; index < 320; index++)
    files[`docs/group-${index % 7}/file-${index}.${index % 3 ? 'js' : 'log'}`] = '';
  const root = await fixture(t, files);
  await compare(root, '.', ['ignored/', '**/group-3/**', '!docs/group-3/file-10.js']);
  await compare(root, 'docs', ['**/file-3.log']);
});
test('root-only exclusions and ignored own policy file remain canonical', async (t) => {
  const root = await fixture(t, {
    'component/main.js': '',
    'component/tsconfig.json': '{}',
    'component/a.log': '',
    'component/.bitignore': '\ufeff\r\n# comment\r\n*.log\r\n',
    'component/.gitignore': '*.js\n',
  });
  await compare(root, 'component', ['**/.bitignore'], [], false);
});
test('non-ASCII ignore expressions fall back without changing ASCII filenames', async (t) => {
  const root = await fixture(t, { 'main.js': '', s: '', i: '' });
  await compare(root, '.', ['[À-ž]'], [], true, true);
});
test('custom ignore methods are observed and bypass native inventory', async (t) => {
  const root = await fixture(t, { 'main.js': '', 'hidden.js': '' });
  const policy = ignore();
  let calls = 0;
  policy.filter = (paths) => {
    calls++;
    return paths.filter((name) => name !== 'hidden.js');
  };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  const files = await sources.withWorkspacePersistence(() => bitmap.getFilesByDir('.', root, policy, [], true));
  assert.deepEqual(
    files.map((file) => file.relativePath),
    ['main.js']
  );
  assert.equal(calls, 1);
});

test('policy mutation during capture cancels retained inventory and uses the updated policy', async (t) => {
  const root = await fixture(t, { 'main.js': '', 'hidden.js': '' });
  const policy = ignore(),
    requests = [],
    original = Session.prototype.request;
  Session.prototype.request = async function (build, ...args) {
    let kind;
    const result = await original.call(
      this,
      (id) => {
        const frame = build(id);
        if (frame.subarray(0, 4).toString() === 'BWS1') {
          kind = JSON.parse(frame.subarray(12)).kind;
          requests.push(kind);
        }
        return frame;
      },
      ...args
    );
    if (kind === 'inventoryBegin') policy.add('hidden.js');
    return result;
  };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  try {
    const files = await sources.withWorkspacePersistence(() => bitmap.getFilesByDir('.', root, policy, [], true));
    assert.deepEqual(
      files.map((file) => file.relativePath),
      ['main.js']
    );
    assert.ok(requests.includes('inventoryCancel'));
    assert.equal(requests.includes('inventoryFinish'), false);
  } finally {
    Session.prototype.request = original;
  }
});
test('invalid native completion counts cannot publish a partial manifest', async (t) => {
  const root = await fixture(t, { 'main.js': '', 'another.js': '' });
  const policy = ignore(),
    original = Session.prototype.request;
  let invalidated = false;
  Session.prototype.request = function (build, count, consume, ...args) {
    let kind;
    return original.call(
      this,
      (id) => {
        const frame = build(id);
        if (frame.subarray(0, 4).toString() === 'BWS1') kind = JSON.parse(frame.subarray(12)).kind;
        return frame;
      },
      count,
      (response) => {
        if (kind === 'inventoryFinish' && !response.failed) {
          invalidated = true;
          response.completed++;
        }
        return consume(response);
      },
      ...args
    );
  };
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  try {
    const files = await sources.withWorkspacePersistence(() => bitmap.getFilesByDir('.', root, policy, [], true));
    assert.deepEqual(
      files.map((file) => file.relativePath),
      ['another.js', 'main.js']
    );
    assert.equal(invalidated, true);
  } finally {
    Session.prototype.request = original;
  }
});

test('noncanonical root spellings retain component bitmap semantics', async (t) => {
  const root = await fixture(t, { '.bitmap': '{}', 'main.js': '' });
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  const expected = await bitmap.getFilesByDir('./', root, ignore(), [], true);
  process.env.BIT_RUST_CLIENT_VCS = 'on';
  const actual = await sources.withWorkspacePersistence(() => bitmap.getFilesByDir('./', root, ignore(), [], true));
  assert.deepEqual(actual, expected);
  assert.equal(
    actual.some((file) => file.relativePath === '.bitmap'),
    false
  );
});
