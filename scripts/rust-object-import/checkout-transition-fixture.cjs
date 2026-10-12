const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { inflateSync } = require('node:zlib');
const { createCheckoutFixture } = require('./checkout-qualification.cjs');

// Production Source/Version objects are seeded only in the disposable remote.
// Every scenario forks one imported baseline so failures cannot contaminate peers.
async function createFixture(cliRoot, directory, options = {}) {
  const fixture = await createCheckoutFixture(cliRoot, directory, options);
  const load = createRequire(path.join(cliRoot, 'package.json'));
  const { Scope } = load('@teambit/legacy.scope');
  const { Source, Version, ModelComponent, VersionHistory } = load('@teambit/objects');
  const { ComponentID, ComponentIdList } = load('@teambit/component-id');
  const legacy = path.dirname(load.resolve('@teambit/legacy.consumer-component'));
  const Dependency = load(path.join(legacy, 'dependencies/dependency.js')).default;
  const Dependencies = load(path.join(legacy, 'dependencies/dependencies.js')).default;
  const scope = await Scope.load(directory, false);
  const component = await scope.getModelComponent(ComponentID.fromString(fixture.id));
  const originals = await Promise.all(
    fixture.versionRefs.map((hash) => scope.objects.load(new (load('@teambit/objects').Ref)(hash)))
  );
  const dependencyId = 'qualification.checkout/dependency';
  const dependencySource = Source.from(Buffer.from('export default "dependency-unchanged";\n'));
  const dependencyVersion = new Version({
    schema: '1.0.0',
    mainFile: 'index.js',
    bindingPrefix: '@qualification',
    devPackageDependencies: { ...originals[0].devPackageDependencies },
    overrides: { ...originals[0].overrides },
    files: [{ name: 'index.js', relativePath: 'index.js', test: false, file: dependencySource.hash() }],
    log: {
      message: 'dependency baseline',
      date: '1700000000000',
      username: 'fixture',
      email: 'fixture@example.invalid',
    },
    parents: [],
  });
  dependencyVersion._hash = dependencyVersion.calculateHash().toString();
  dependencyVersion.validate();
  const dependencyModel = ModelComponent.from({
    name: 'dependency',
    scope: 'qualification.checkout',
    versions: { '1.0.0': dependencyVersion.hash() },
    head: dependencyVersion.hash(),
  });
  const stable = Buffer.from('first unchanged line\nsecond unchanged line\nthird unchanged line\n');
  const stableSource = Source.from(stable);
  const indexSources = [];
  const versions = originals.map((original, index) => {
    const version = Version.parse(original.toBuffer().toString(), fixture.versionRefs[index]);
    version.files.push({ name: 'stable.txt', relativePath: 'stable.txt', test: false, file: stableSource.hash() });
    const indexContents = Buffer.concat([
      Buffer.from("import dependency from '@qualification/checkout.dependency';\n"),
      fixture.definitions[index]['index.js'],
    ]);
    const indexSource = Source.from(indexContents);
    indexSources.push(indexSource);
    version.files.find((file) => file.relativePath === 'index.js').file = indexSource.hash();
    fixture.definitions[index]['index.js'] = indexContents;
    fixture.sourceRefs[`${index}/index.js`] = indexSource.hash().toString();
    version.dependencies = new Dependencies([new Dependency(ComponentID.fromString(`${dependencyId}@1.0.0`), [])]);
    version.flattenedDependencies = ComponentIdList.fromArray([ComponentID.fromString(`${dependencyId}@1.0.0`)]);
    version.parents = index ? [originals[0].hash()] : [];
    version._hash = version.calculateHash().toString();
    fixture.definitions[index]['stable.txt'] = stable;
    return version;
  });
  versions[1].parents = [versions[0].hash()];
  versions[1]._hash = versions[1].calculateHash().toString();
  versions.forEach((version) => version.validate());
  component.versions = { '1.0.0': versions[0].hash(), '1.0.1': versions[1].hash() };
  component.head = versions[1].hash();
  const histories = [component, dependencyModel].map(
    (model, index) =>
      new VersionHistory({
        name: model.name,
        scope: model.scope,
        versions: (index ? [dependencyVersion] : versions).map((version) => ({
          hash: version.hash(),
          parents: version.parents,
        })),
        graphCompleteRefs: (index ? [dependencyVersion] : versions).map((version) => version.hash().toString()),
      })
  );
  await scope.objects.writeObjectsToTheFS([
    dependencySource,
    dependencyVersion,
    dependencyModel,
    stableSource,
    ...indexSources,
    ...versions,
    component,
    ...histories,
  ]);
  Scope.scopeCache = {};
  fixture.versionRefs = versions.map((version) => version.hash().toString());
  fixture.dependencyId = dependencyId;
  return fixture;
}

function scenarios(id) {
  const skip = '--skip-dependency-installation';
  return [
    { name: 'clean-old', args: ['checkout', '1.0.0', id, skip], version: '1.0.0' },
    {
      name: 'clean-head',
      prepare: ['checkout', '1.0.0', id, skip],
      args: ['checkout', 'head', id, skip],
      version: '1.0.1',
    },
    {
      name: 'reset-edited-deleted',
      mutation: 'edited-deleted',
      args: ['checkout', 'reset', id, skip],
      version: '1.0.1',
    },
    { name: 'reset-missing-root', mutation: 'missing-root', args: ['checkout', 'reset', id, skip], version: '1.0.1' },
    {
      name: 'reset-workspace-root',
      workspaceRoot: true,
      mutation: 'edited-deleted',
      args: ['checkout', 'reset', id, skip],
      version: '1.0.1',
    },
    {
      name: 'lane-reset-files',
      lane: true,
      mutation: 'edited-deleted',
      args: ['checkout', 'reset', id, skip],
      version: '1.0.1',
    },
    {
      name: 'lane-revert',
      lane: true,
      args: ['revert', id, '1.0.0', skip],
      version: '1.0.1',
      contentsVersion: '1.0.0',
    },
    { name: 'revert-keeps-version', args: ['revert', id, '1.0.0', skip], version: '1.0.1', contentsVersion: '1.0.0' },
    {
      name: 'head-preserves-local-edit',
      prepare: ['checkout', '1.0.0', id, skip],
      mutation: 'stable-edit',
      args: ['checkout', 'head', id, skip],
      version: '1.0.1',
    },
    {
      name: 'head-preserves-local-deletion',
      prepare: ['checkout', '1.0.0', id, skip],
      mutation: 'stable-delete',
      args: ['checkout', 'head', id, skip],
      version: '1.0.1',
    },
    { name: 'conflict-rejected', mutation: 'conflict', args: ['checkout', '1.0.0', id, skip], failure: true },
    ...['manual', 'ours', 'theirs'].map((strategy) => ({
      name: `conflict-${strategy}`,
      mutation: 'conflict',
      args: ['checkout', '1.0.0', id, skip, '--auto-merge-resolve', strategy],
      version: '1.0.0',
      strategy,
    })),
  ];
}

async function mutate(componentRoot, kind) {
  if (kind === 'stable-edit')
    return fs.writeFile(
      path.join(componentRoot, 'stable.txt'),
      'local first line\nsecond unchanged line\nthird unchanged line\n'
    );
  if (kind === 'stable-delete') return fs.rm(path.join(componentRoot, 'stable.txt'));
  if (kind === 'missing-root') return fs.rm(componentRoot, { recursive: true });
  if (kind === 'edited-deleted') {
    await fs.writeFile(path.join(componentRoot, 'index.js'), 'export default "local-reset";\n');
    await fs.rm(path.join(componentRoot, 'added.js'));
    return;
  }
  assert.equal(kind, 'conflict');
  await fs.writeFile(path.join(componentRoot, 'index.js'), 'export default "local-conflict";\n');
}

async function readTree(directory, prefix = '') {
  const result = {};
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return result;
    throw error;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!prefix && ['.bit', '.git', 'node_modules', '.bitmap', 'workspace.jsonc'].includes(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) Object.assign(result, await readTree(filename, relative));
    else if (entry.isSymbolicLink()) result[relative] = { link: await fs.readlink(filename) };
    else result[relative] = { bytes: (await fs.readFile(filename)).toString('hex') };
  }
  return result;
}

async function capture(directory, roots) {
  const read = async (filename) => {
    try {
      return (await fs.readFile(path.join(directory, filename))).toString('hex');
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  };
  const objects = {};
  const objectRoot = path.join(directory, '.bit/objects');
  for (const shard of (await fs.readdir(objectRoot)).sort()) {
    if (!/^[a-f0-9]{2}$/.test(shard)) continue;
    for (const suffix of (await fs.readdir(path.join(objectRoot, shard))).sort()) {
      if (!/^[a-f0-9]{38}$/.test(suffix)) continue;
      objects[shard + suffix] = inflateSync(await fs.readFile(path.join(objectRoot, shard, suffix))).toString('hex');
    }
  }
  return {
    objects,
    roots: Object.fromEntries(
      await Promise.all(roots.map(async (root) => [root, await readTree(path.join(directory, root))]))
    ),
    bitmap: await read('.bitmap'),
    config: await read('workspace.jsonc'),
    index: await read('.bit/index.json'),
    stagedSnaps: await read('.bit/staged-snaps'),
    unmerged: await read('.bit/unmerged.json'),
    stagedConfig: await readTree(path.join(directory, '.bit/staged-config')),
    lastMerged: await readTree(path.join(directory, '.bit/last-merged')),
  };
}

async function markWorkspaceRoot(cliRoot, directory, versionRefs) {
  const load = createRequire(path.join(cliRoot, 'package.json'));
  const { Scope } = load('@teambit/legacy.scope');
  const { Ref, Source, Version, VersionHistory } = load('@teambit/objects');
  const { ComponentID } = load('@teambit/component-id');
  const { ExtensionDataEntry } = load('@teambit/legacy.extension-data');
  const scope = await Scope.load(path.join(directory, '.bit'), false);
  const originals = await Promise.all(versionRefs.map((hash) => scope.objects.load(new Ref(hash))));
  const rootSources = await Promise.all(
    ['workspace.jsonc', '.bitmap', 'package.json'].map(async (filename) => ({
      filename,
      source: Source.from(await fs.readFile(path.join(directory, filename))),
    }))
  );
  const versions = [];
  for (const [index, original] of originals.entries()) {
    const version = Version.parse(original.toBuffer().toString(), original.hash().toString());
    version.extensions.push(
      new ExtensionDataEntry(undefined, undefined, 'teambit.workspace/workspace-root', undefined, { isRoot: true })
    );
    for (const { filename, source } of rootSources)
      version.files.push({ name: filename, relativePath: filename, test: false, file: source.hash() });
    version.parents = index ? [versions[0].hash()] : [];
    version._hash = version.calculateHash().toString();
    version.validate();
    versions.push(version);
  }
  const model = await scope.getModelComponent(ComponentID.fromString('qualification.checkout/component'));
  model.versions = { '1.0.0': versions[0].hash(), '1.0.1': versions[1].hash() };
  model.head = versions[1].hash();
  const history = new VersionHistory({
    name: model.name,
    scope: model.scope,
    versions: versions.map((version) => ({ hash: version.hash(), parents: version.parents })),
    graphCompleteRefs: versions.map((version) => version.hash().toString()),
  });
  await scope.objects.writeObjectsToTheFS([...rootSources.map((row) => row.source), ...versions, model, history]);
  Scope.scopeCache = {};
}

module.exports = { createFixture, scenarios, mutate, readTree, capture, markWorkspaceRoot };
