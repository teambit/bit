const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { installed } = require('./load-source.cjs');
const { Source, Version, ModelComponent } = installed('@teambit/objects');
const { SourceFile } = installed('@teambit/component.sources');
const { getFilesDiff, formatFileDiff } = installed('@teambit/legacy.component-diff');
function request(input) {
  const body = Buffer.from(JSON.stringify({ kind: 'workspaceDiff', gitExecutable: 'git', color: true, ...input }));
  const header = Buffer.alloc(12);
  header.write('BWS1');
  header.writeUInt32BE(1, 4);
  header.writeUInt32BE(body.length, 8);
  return JSON.parse(
    execFileSync(process.env.BIT_TEST_OBJECT_IMPORT, {
      input: Buffer.concat([header, body]),
      encoding: 'utf8',
      maxBuffer: 40 * 1024 * 1024,
    })
  );
}
function project(files, version) {
  return files.map((file) => {
    const diffOutput = file.same
      ? ''
      : formatFileDiff(
          file.rawDiff.replace(/\r?\n$/, ''),
          `${version} original`,
          `${version} modified`,
          file.relativePath
        );
    return {
      filePath: file.relativePath,
      diffOutput,
      status: !diffOutput ? 'UNCHANGED' : file.fromEmpty ? 'NEW' : file.toEmpty ? 'DELETED' : 'MODIFIED',
    };
  });
}
async function fixture(t, entries) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-workspace-diff-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'component');
  await fs.mkdir(directory);
  const write = async (object) => {
    const hash = object.hash().toString();
    const filename = path.join(root, '.bit/objects', hash.slice(0, 2), hash.slice(2));
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, await object.compress());
  };
  const cases = entries || [
    ['index.js', 'unchanged\n', 'unchanged\n'],
    ['crlf.js', 'line\n', 'line\r\n'],
    ['bom.js', 'line\n', '\ufeffline\r\n'],
    ['lone-cr.txt', 'a\rb\n', 'a\rb changed\n'],
    ['new.txt', null, 'added\n'],
    ['deleted.txt', 'deleted\n', null],
    ['empty-new.txt', null, ''],
    ['empty-deleted.txt', '', null],
    ['empty-to-text.txt', '', 'added\n'],
    ['text-to-empty.txt', 'deleted\n', ''],
    ['binary.bin', Buffer.from([0, 255, 13, 10, 1]), Buffer.from([0, 254, 13, 10, 1])],
    ['binary-new.bin', null, Buffer.from([0, 1, 2])],
    ['invalid-utf8.txt', Buffer.from([255, 13, 10]), Buffer.from([254, 13, 10])],
    ['space name.txt', 'before\n', 'after\n'],
    ['日本語.txt', 'before β🌱\n', 'after 日本語\n'],
    ['unterminated.txt', 'before', 'after'],
    ['trailing-newline.txt', 'before\n', 'before'],
  ];
  const old = [],
    current = [],
    modelFiles = [];
  for (const [name, left, right] of cases) {
    if (left !== null) {
      const source = Source.from(Buffer.from(left));
      await write(source);
      modelFiles.push({ name, relativePath: name, file: source.hash(), test: false });
      old.push(new SourceFile({ base: directory, path: path.join(directory, name), contents: Buffer.from(left) }));
    }
    if (right !== null) {
      await fs.writeFile(path.join(directory, name), right);
      current.push(SourceFile.load(path.join(directory, name), directory, root));
    }
  }
  const version = new Version({
    hash: '1'.repeat(40),
    mainFile: cases[0][0],
    files: modelFiles,
    log: { date: '1700000000000', message: 'diff fixture' },
    dependencies: [],
    devDependencies: [],
    parents: [],
  });
  const model = ModelComponent.from({
    scope: 'qualification.diff',
    name: 'component',
    versions: { '1.0.0': version.hash() },
    head: version.hash(),
  });
  await write(version);
  await write(model);
  await fs.writeFile(
    path.join(root, '.bit/index.json'),
    JSON.stringify({
      components: [{ id: { scope: model.scope, name: model.name }, hash: model.hash().toString(), isSymlink: false }],
      lanes: [],
    })
  );
  return {
    root,
    directory,
    old,
    current,
    target: {
      identity: model.id(),
      version: '1.0.0',
      directory: 'component',
      files: current.map((file) => file.relative),
      current: { mainFile: cases[0][0] },
    },
  };
}

test('owned workspace diff matches canonical public file diff byte-for-byte across source edge cases', async (t) => {
  const data = await fixture(t);
  const previous = process.env.BIT_RUST_CLIENT_VCS;
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  t.after(() => {
    if (previous === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = previous;
  });
  const expected = (await getFilesDiff(data.old, data.current, '1.0.0', '1.0.0')).map(
    ({ filePath, diffOutput, status }) => ({ filePath, diffOutput, status })
  );
  const actual = request({ root: data.root, targets: [data.target] });
  assert.equal(actual.failed, false);
  assert.equal(actual.data.comparisons.length, 1);
  const row = actual.data.comparisons[0];
  assert.equal(row.identity, data.target.identity);
  assert.equal(row.modified, true);
  assert.deepEqual(project(row.files, '1.0.0'), expected);
  assert.equal(JSON.stringify(project(row.files, '1.0.0')), JSON.stringify(expected));
  for (const file of data.current) {
    const metadata = row.current.files.find((entry) => entry.relativePath === file.relative);
    assert.equal(metadata.file, file.toSourceAsLinuxEOL().hash().toString(), file.relative);
  }
  // A new component uses undefined labels and an empty model side.
  const target = { ...data.target, identity: 'qualification.diff/new-component', version: '' };
  const added = request({ root: data.root, targets: [target] });
  assert.equal(added.failed, false);
  const newExpected = (await getFilesDiff([], data.current, undefined, undefined)).map(
    ({ filePath, diffOutput, status }) => ({ filePath, diffOutput, status })
  );
  assert.equal(added.data.comparisons[0].model, null);
  assert.deepEqual(project(added.data.comparisons[0].files, undefined), newExpected);
});

test('owned diff rejects unsafe or failed batches without leaking partial results and rereads mutable files', async (t) => {
  const data = await fixture(t);
  for (const patch of [
    { directory: '../escape' },
    { files: ['../escape'] },
    { files: ['missing.txt'] },
    { files: ['index.js', 'index.js'] },
    { current: { files: [] } },
  ]) {
    const response = request({
      root: data.root,
      targets: [data.target, { ...data.target, identity: 'qualification.diff/new-component', version: '', ...patch }],
    });
    assert.equal(response.failed, true, JSON.stringify(patch));
    assert.equal(response.data, undefined);
  }
  await fs.writeFile(path.join(data.directory, 'index.js'), 'changed after first request\n');
  const response = request({ root: data.root, targets: [data.target] });
  assert.equal(response.failed, false);
  assert.ok(
    project(response.data.comparisons[0].files, '1.0.0')
      .find((file) => file.filePath === 'index.js')
      .diffOutput.includes('changed after first request')
  );
  assert.equal(
    request({ root: data.root, targets: [data.target], gitExecutable: path.join(data.root, 'missing-git') }).failed,
    true
  );
});

test('bare diff skips unchanged stored Source reads while explicit and changed requests validate them', async (t) => {
  const data = await fixture(t, [['index.js', 'unchanged\n', 'unchanged\n']]);
  const original = request({ root: data.root, targets: [data.target] });
  assert.equal(original.failed, false);
  assert.equal(original.data.comparisons[0].modified, false);
  const hash = original.data.comparisons[0].model.files[0].file;
  const filename = path.join(data.root, '.bit/objects', hash.slice(0, 2), hash.slice(2));
  await fs.rm(filename);
  const skipped = request({ root: data.root, targets: [data.target], modifiedOnly: true });
  assert.equal(skipped.failed, false);
  assert.deepEqual(skipped.data.comparisons[0].files, []);
  assert.equal(request({ root: data.root, targets: [data.target] }).failed, true);
  await fs.writeFile(filename, 'invalid compressed source');
  assert.equal(request({ root: data.root, targets: [data.target], modifiedOnly: true }).failed, false);
  assert.equal(request({ root: data.root, targets: [data.target], modifiedOnly: false }).failed, true);
  await fs.writeFile(path.join(data.directory, 'index.js'), 'changed\n');
  assert.equal(request({ root: data.root, targets: [data.target], modifiedOnly: true }).failed, true);
});

test('workspace-root bitmap diff uses canonical normalized contents for hashes and printed patches', async (t) => {
  const { normalizeBitmapContentForVersioning } = installed('@teambit/legacy.bit-map');
  const bitmap = {
    alpha: {
      name: 'alpha',
      scope: '',
      defaultScope: 'qualification.diff',
      version: '1.0.0',
      rootDir: 'alpha',
      mainFile: 'index.js',
    },
    '$schema-version': '17.0.0',
  };
  const normalized = normalizeBitmapContentForVersioning(JSON.stringify(bitmap));
  const data = await fixture(t, [['.bitmap', normalized, null]]);
  const target = { ...data.target, directory: '.', files: ['.bitmap'] };
  bitmap.alpha.version = '2.0.0';
  bitmap._bit_lane = { name: 'feature', scope: 'qualification.diff' };
  const filename = path.join(data.root, '.bitmap');
  await fs.writeFile(filename, `\ufeff// live workspace\n${JSON.stringify(bitmap, null, 2)}`);
  const unchanged = request({ root: data.root, targets: [target] });
  assert.equal(unchanged.failed, false);
  assert.equal(unchanged.data.comparisons[0].modified, false);
  assert.deepEqual(project(unchanged.data.comparisons[0].files, '1.0.0'), [
    { filePath: '.bitmap', diffOutput: '', status: 'UNCHANGED' },
  ]);
  bitmap.alpha.mainFile = 'different.js';
  await fs.writeFile(filename, JSON.stringify(bitmap));
  const current = new SourceFile({
    base: data.root,
    path: filename,
    contents: Buffer.from(normalizeBitmapContentForVersioning(JSON.stringify(bitmap))),
  });
  const previous = process.env.BIT_RUST_CLIENT_VCS;
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  t.after(() => {
    if (previous === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = previous;
  });
  const expected = (await getFilesDiff(data.old, [current], '1.0.0', '1.0.0')).map(
    ({ filePath, diffOutput, status }) => ({ filePath, diffOutput, status })
  );
  const changed = request({ root: data.root, targets: [target] });
  assert.equal(changed.failed, false);
  assert.equal(changed.data.comparisons[0].modified, true);
  assert.deepEqual(project(changed.data.comparisons[0].files, '1.0.0'), expected);
  assert.ok(!expected[0].diffOutput.includes('feature'));
  assert.ok(!expected[0].diffOutput.includes('2.0.0'));
});
