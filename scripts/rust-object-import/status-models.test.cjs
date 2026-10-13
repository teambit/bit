const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { installed } = require('./load-source.cjs');
const { ModelComponent, Version, Source } = installed('@teambit/objects');
function request(root, targets, history = false, compare = false, options = {}) {
  const body = Buffer.from(JSON.stringify(compare ? { kind: 'statusCompare', root, targets } : { kind: 'statusModels', root, targets, history, ...options }));
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

test('owned status comparisons match the public Consumer across source and semantic changes', async (t) => {
  const { root, version, targets, index } = await fixture(t);
  const { Consumer } = installed('@teambit/legacy.consumer');
  const { ConsumerComponent } = installed('@teambit/legacy.consumer-component');
  const { SourceFile } = installed('@teambit/component.sources');
  const { deflateSync } = require('node:zlib');
  const previousFlag = process.env.BIT_RUST_CLIENT_VCS;
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  t.after(() => {
    if (previousFlag === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = previousFlag;
  });
  index.components = index.components.slice(0, 1);
  await fs.writeFile(path.join(root, '.bit/index.json'), JSON.stringify(index));
  const directory = path.join(root, 'component');
  await fs.mkdir(directory);
  const filename = path.join(directory, 'index.js');
  const hash = version.hash().toString();
  const objectFile = path.join(root, '.bit/objects', hash.slice(0, 2), hash.slice(2));
  for (let i = 0; i < 96; i++) {
    const raw = JSON.parse(version.toBuffer().toString());
    raw.packageDependencies = { z: '^2.0.0', a: '^1.0.0' };
    raw.overrides = { dependencies: { z: '^2', a: '^1' } };
    raw.dependencies = [
      { id: { scope: 'qualification.status', name: 'dep', version: '1.0.0' }, relativePaths: [] },
    ];
    raw.extensions = [{ name: 'teambit.dependencies/dependency-resolver', config: { enabled: true }, data: {} }];
    const body = Buffer.from(JSON.stringify(raw));
    await fs.writeFile(objectFile, deflateSync(Buffer.concat([Buffer.from(`Version ${hash} ${body.length}\0`), body])));
    const current = structuredClone(raw);
    for (const field of Object.keys(current)) {
      if (!['mainFile', 'dependencies', 'devDependencies', 'packageDependencies', 'devPackageDependencies',
        'peerPackageDependencies', 'bindingPrefix', 'overrides', 'extensions'].includes(field)) delete current[field];
    }
    current.packageDependencies = { a: '^1.0.0', z: '^2.0.0' };
    current.overrides.dependencies = { a: '^1', z: '^2' };
    // The current ID can be unresolved; the model supplies its version.
    if (i % 2) delete current.dependencies[0].id.version;
    let contents = Buffer.from(i % 3 ? '\ufeffmodule.exports = 1;\r\n' : 'module.exports = 1;\n');
    switch (i % 8) {
      case 1: current.packageDependencies.a = '^3'; break;
      case 2: current.dependencies[0].id.version = '2.0.0'; break;
      case 3: current.extensions[0].config.enabled = false; break;
      case 4: current.overrides.dependencies.a = '^3'; break;
      case 5: contents = Buffer.from([0, 255, 13, 10]); break;
      case 6: current.mainFile = 'other.js'; break;
      default: break;
    }
    await fs.writeFile(filename, contents);
    const sourceFile = SourceFile.load(filename, directory, root);
    const currentFiles = [{ relativePath: 'index.js', name: 'old ignored name', test: true,
      file: sourceFile.toSourceAsLinuxEOL().hash().toString() }];
    const left = Version.parse(body.toString(), hash);
    const right = Version.parse(JSON.stringify({ ...current, files: currentFiles, log: raw.log }), hash);
    const component = new ConsumerComponent({ name: 'component0', scope: 'qualification.status',
      version: '1.0.0', mainFile: current.mainFile, files: [], dependencies: [], devDependencies: [] });
    const context = { scope: { sources: { consumerComponentToVersion: async () => ({ version: right }) } } };
    const expected = await Consumer.prototype.isComponentModified.call(context, left, component);
    const actual = request(root, [{ ...targets[0], directory: 'component', files: ['index.js'], current }], false, true);
    assert.equal(actual.failed, false, `case ${i}`);
    assert.deepEqual(actual.data.comparisons, [{ identity: targets[0].identity, modified: expected,
      modelHash: left.calculateHash().toString(), currentHash: right.calculateHash().toString() }], `case ${i}`);
  }
});

test('owned status reads share the batch budget and publish no partial comparisons', async (t) => {
  const { root, targets } = await fixture(t);
  const batch = targets.map((target, index) => ({ ...target, directory: `component-${index}`,
    files: ['index.js'], current: { mainFile: 'index.js' } }));
  await Promise.all(batch.map(async (target) => {
    const directory = path.join(root, target.directory);
    await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, 'index.js'), 'module.exports = 1;\n');
  }));
  const initial = request(root, batch, false, true);
  assert.equal(initial.failed, false);
  assert.equal(initial.data.comparisons.length, batch.length);
  assert.deepEqual(initial.data.comparisons.map((row) => row.identity), targets.map((target) => target.identity));
  assert.ok(initial.data.comparisons.every((row) => !row.modified));
  const file = path.join(root, batch[65].directory, 'index.js');
  await fs.writeFile(file, 'module.exports = 2;\n');
  const changed = request(root, batch, false, true);
  assert.deepEqual(changed.data.comparisons.filter((row) => row.modified).map((row) => row.identity), [targets[65].identity]);
  for (const bad of [
    { files: ['../index.js'] }, { directory: '../outside' }, { files: ['index.js', 'index.js'] },
    { current: { mainFile: 'index.js', files: [] } }, { identity: 'qualification.status/missing' },
    { files: ['missing.js'] },
  ]) {
    const response = request(root, [batch[0], { ...batch[1], ...bad }], false, true);
    assert.equal(response.failed, true, JSON.stringify(bad));
    assert.equal(response.data, undefined);
  }
  // Two individually acceptable files exceed the shared eight-MiB budget.
  await fs.writeFile(file, Buffer.alloc(5 * 1024 * 1024, 120));
  await fs.writeFile(path.join(root, batch[66].directory, 'index.js'), Buffer.alloc(5 * 1024 * 1024, 120));
  assert.equal(request(root, batch, false, true).failed, true);
  assert.equal(request(root, batch.slice(0, 1), false, true).failed, false);
});

test('owned workspace-root comparisons normalize the live bitmap before hashing', async (t) => {
  const { root, version, targets, write, index } = await fixture(t);
  const { normalizeBitmapContentForVersioning } = installed('@teambit/legacy.bit-map');
  const bitmap = { alpha: { name: 'alpha', scope: '', defaultScope: 'qualification.status',
    version: '1.0.0', rootDir: 'alpha', mainFile: 'index.js' }, '$schema-version': '17.0.0' };
  const stored = Source.from(Buffer.from(normalizeBitmapContentForVersioning(JSON.stringify(bitmap))));
  version.files = [{ relativePath: '.bitmap', name: '.bitmap', test: false, file: stored.hash() }];
  version.mainFile = '.bitmap';
  await write(version);
  index.components = index.components.slice(0, 1);
  await fs.writeFile(path.join(root, '.bit/index.json'), JSON.stringify(index));
  const compare = () => request(root, [{ ...targets[0], directory: '.', files: ['.bitmap'],
    current: { mainFile: '.bitmap' } }], false, true);
  bitmap.alpha.version = '2.0.0';
  bitmap._bit_lane = { name: 'lane', scope: 'qualification.status' };
  await fs.writeFile(path.join(root, '.bitmap'), `\ufeff// current workspace\n${JSON.stringify(bitmap, null, 2)}`);
  const same = compare();
  assert.equal(same.failed, false);
  assert.equal(same.data.comparisons[0].modified, false);
  bitmap.alpha.mainFile = 'different.js';
  await fs.writeFile(path.join(root, '.bitmap'), JSON.stringify(bitmap));
  assert.equal(compare().data.comparisons[0].modified, true);
});
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bit-status-models-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const body = Source.from(Buffer.from('module.exports = 1;\n'));
  const version = new Version({
    hash: '1'.repeat(40),
    mainFile: 'index.js',
    files: [{ name: 'index.js', relativePath: 'index.js', file: body.hash(), test: false }],
    log: { date: '1700000000000', message: 'status' },
    dependencies: [],
    devDependencies: [],
    parents: [],
  });
  const models = Array.from({ length: 130 }, (_, i) =>
    ModelComponent.from({
      name: `component${i}`,
      scope: 'qualification.status',
      versions: { '1.0.0': version.hash() },
      head: version.hash(),
    })
  );
  const write = async (object) => {
    const hash = object.hash().toString();
    const filename = path.join(root, '.bit/objects', hash.slice(0, 2), hash.slice(2));
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, await object.compress());
    return filename;
  };
  await Promise.all([version, ...models].map(write));
  const index = {
    components: models.map((model) => ({
      id: { scope: model.scope, name: model.name },
      isSymlink: false,
      hash: model.hash().toString(),
    })),
    lanes: [],
  };
  await fs.writeFile(path.join(root, '.bit/index.json'), JSON.stringify(index));
  const targets = models.map((model) => ({ identity: model.id(), version: '1.0.0' }));
  return { root, version, models, index, targets, write };
}
test('status model batch reads canonical objects in index order and deduplicates Version reads', async (t) => {
  const { root, version, models, targets } = await fixture(t);
  const response = request(root, [...targets, { identity: 'qualification.status/missing', version: '1.0.0' }]);
  assert.equal(response.failed, false);
  assert.deepEqual(response.data.semantics, [
    Version.parse(version.toBuffer().toString(), version.hash().toString()).calculateHash().toString(),
  ]);
  assert.deepEqual(
    response.data.models,
    models.map((model) => JSON.parse(model.toBuffer().toString()))
  );
  assert.deepEqual(response.data.versions, [[version.hash().toString(), JSON.parse(version.toBuffer().toString())]]);
});
test('mutable Version bodies are reread and malformed compressed objects decline the entire batch', async (t) => {
  const { root, version, targets, write } = await fixture(t);
  assert.equal(request(root, targets).failed, false);
  version.log.message = 'changed under the same stable hash';
  const filename = await write(version);
  assert.equal(request(root, targets).data.versions[0][1].log.message, version.log.message);
  await fs.appendFile(filename, 'trailing bytes');
  const declined = request(root, targets);
  assert.equal(declined.failed, true);
  assert.equal(declined.data, undefined);
});
test('model index identity mismatches and symlinks decline without partial snapshots', async (t) => {
  const { root, index, targets } = await fixture(t);
  index.components[0].id.name = 'other';
  await fs.writeFile(path.join(root, '.bit/index.json'), JSON.stringify(index));
  assert.equal(request(root, targets).failed, true);
  index.components[0].id.name = 'component0';
  index.components[0].isSymlink = true;
  await fs.writeFile(path.join(root, '.bit/index.json'), JSON.stringify(index));
  assert.equal(request(root, targets).failed, true);
});

test('native stored Version semantics match canonical parsing, defaults and extension configuration', async (t) => {
  const { root, version, index, targets } = await fixture(t);
  index.components = index.components.slice(0, 1);
  await fs.writeFile(path.join(root, '.bit/index.json'), JSON.stringify(index));
  const { deflateSync } = require('node:zlib');
  const hash = version.hash().toString();
  const filename = path.join(root, '.bit/objects', hash.slice(0, 2), hash.slice(2));
  for (let i = 0; i < 128; i++) {
    const raw = JSON.parse(version.toBuffer().toString());
    raw.log.message = i % 2 ? false : 'message';
    raw.packageDependencies = i % 3 ? { beta: '^2', alpha: '^1' } : [null, false, 0, ''][i % 4];
    raw.overrides = i % 4 ? { devDependencies: { types: '1.0.0' } } : null;
    if (i % 2) delete raw.devDependencies;
    raw.dependencies = [
      { id: { scope: 'qualification.status', name: 'dep', version: i % 3 ? '1.0.0' : 'latest' }, relativePaths: [] },
    ];
    raw.extensions = [
      {
        name: 'teambit.dependencies/dependency-resolver',
        config: { z: i, __specific: true, a: { 2: 'two', 1: 'one' } },
        data: { ignoredForHash: i },
      },
      {
        extensionId: { scope: 'qualification.status', name: 'extension', version: i % 2 ? '2.0.0' : 'latest' },
        config: i % 3 ? { enabled: true } : '-',
        data: {},
      },
    ];
    if (i % 2) raw.extensions.reverse();
    const body = Buffer.from(JSON.stringify(raw));
    await fs.writeFile(filename, deflateSync(Buffer.concat([Buffer.from(`Version ${hash} ${body.length}\0`), body])));
    const expected = Version.parse(body.toString(), hash).calculateHash().toString();
    const actual = request(root, targets.slice(0, 1));
    assert.equal(actual.failed, false, `case ${i}`);
    assert.equal(actual.data.semantics[0], expected, `case ${i}: ${Version.parse(body.toString(), hash).id()}`);
  }
});

test('cached main status and merge distances match the actual Node history pipeline', async (t) => {
  const { root, models, index, targets, write } = await fixture(t);
  const { VersionHistory, Ref } = installed('@teambit/objects');
  const { getDivergeData } = installed('@teambit/component.snap-distance');
  index.components = index.components.slice(0, 1);
  await fs.writeFile(path.join(root, '.bit/index.json'), JSON.stringify(index));
  const model = models[0];
  const remoteFile = path.join(root, '.bit/refs/remotes', model.scope, 'main');
  await fs.mkdir(path.dirname(remoteFile), { recursive: true });
  const ref = (n) => new Ref(n.toString(16).padStart(40, '0'));
  const normalize = (distance) => ({
    sourceOnly: distance.snapsOnSourceOnly.map(String),
    targetOnly: distance.snapsOnTargetOnly.map(String),
    noCommon: !!distance.err,
    ...(distance.commonSnapBeforeDiverge ? { common: distance.commonSnapBeforeDiverge.toString() } : {}),
  });
  for (let i = 0; i < 64; i++) {
    const versions = Array.from({ length: 7 }, (_, n) => ({
      hash: ref(n + 1),
      parents: n ? [ref(i % 3 && n > 2 ? n - 1 : n)] : [],
    }));
    if (i % 4 === 0) versions[6].parents.push(ref(4));
    if (i % 3 === 0) versions[6].parents = [];
    if (i % 6 === 0) versions[6].unrelated = ref(2);
    if (i % 7 === 0) versions[6].squashed = [ref(3)];
    const history = new VersionHistory({ name: model.name, scope: model.scope, versions });
    await write(history);
    model.head = ref(3 + (i % 5));
    await write(model);
    const remote = i % 8 ? ref(i % 8) : null;
    await fs.writeFile(
      remoteFile,
      JSON.stringify(remote ? [{ id: { scope: model.scope, name: model.name }, head: remote.toString() }] : [])
    );
    const repo = {
      load: async (hash) => {
        assert.equal(hash.toString(), history.hash().toString());
        return history;
      },
      unmergedComponents: { getEntry: () => undefined },
    };
    // The workspace version uses the fixture's existing Version body; include
    // that detached ref in history without manufacturing a second body read.
    history.addFromVersionParents([{ hash: model.getRef('1.0.0'), parents: [ref(2)] }]);
    await write(history);
    const status = await getDivergeData({
      repo,
      modelComponent: model,
      sourceHead: model.getRef('1.0.0'),
      targetHead: remote,
      throws: false,
    });
    const merge = await getDivergeData({ repo, modelComponent: model, targetHead: remote, throws: false });
    const actual = request(root, targets.slice(0, 1), true);
    assert.equal(actual.failed, false, `case ${i}`);
    assert.deepEqual(
      actual.data.histories,
      [
        {
          identity: model.id(),
          remoteHead: remote?.toString() ?? null,
          status: normalize(status),
          merge: normalize(merge),
        },
      ],
      `case ${i}`
    );
  }
  await fs.writeFile(path.join(root, '.bit/unmerged.json'), JSON.stringify([{ unrelated: true }]));
  assert.equal(request(root, targets.slice(0, 1), true).failed, true);
});

test('missing history keeps population and writes on the canonical path', async (t) => {
  const { root, targets } = await fixture(t);
  const response = request(root, targets, true);
  assert.equal(response.failed, true);
  assert.equal(response.data, undefined);
  assert.equal(request(root, targets).failed, false);
});

test('detached remote histories decline new population without changing complete-history support', async (t) => {
  const { root, models, version, index, targets, write } = await fixture(t);
  const { VersionHistory, Ref } = installed('@teambit/objects');
  index.components = index.components.slice(0, 1);
  await fs.writeFile(path.join(root, '.bit/index.json'), JSON.stringify(index));
  const model = models[0];
  const second = Version.parse(version.toBuffer().toString(), '2'.repeat(40));
  second.parents = [version.hash()];
  await write(second);
  model.head = second.hash();
  await write(model);
  const remoteFile = path.join(root, '.bit/refs/remotes', model.scope, 'main');
  await fs.mkdir(path.dirname(remoteFile), { recursive: true });
  await fs.writeFile(remoteFile, JSON.stringify([
    { id: { scope: model.scope, name: model.name }, head: version.hash().toString() },
  ]));
  const history = new VersionHistory({
    name: model.name, scope: model.scope,
    versions: [{ hash: version.hash(), parents: [] }],
    graphCompleteRefs: [version.hash().toString()],
  });
  const hash = history.hash().toString();
  const filename = path.join(root, '.bit/objects', hash.slice(0, 2), hash.slice(2));
  const read = () => request(root, targets.slice(0, 1), true, false, { stageHistory: true });
  assert.equal(read().failed, true, 'missing detached history must retain canonical population ordering');
  await assert.rejects(fs.access(filename), { code: 'ENOENT' }, 'decline must not publish a new history');
  await write(history);
  const partial = await fs.readFile(filename);
  assert.equal(read().failed, true, 'partial detached history also requires canonical population');
  assert.deepEqual(await fs.readFile(filename), partial, 'decline must preserve an existing history byte for byte');
  history.addFromVersionParents([{ hash: new Ref('2'.repeat(40)), parents: [version.hash()] }]);
  await write(history);
  const complete = await fs.readFile(filename);
  const supported = read();
  assert.equal(supported.failed, false, 'complete cached detached histories remain supported');
  assert.equal(supported.data.pendingHistory, undefined);
  assert.deepEqual(supported.data.histories[0].status, { sourceOnly: [], targetOnly: [], noCommon: false });
  assert.deepEqual(supported.data.histories[0].merge.sourceOnly, [second.hash().toString()]);
  assert.deepEqual(await fs.readFile(filename), complete, 'complete history reads must not rewrite objects');
});
