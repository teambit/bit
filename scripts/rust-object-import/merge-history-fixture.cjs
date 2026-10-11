// Production model objects for a genuine local/remote sibling history, exclusively in disposable scopes.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { createRequire } = require('node:module');
async function createMergeFixture(cliRoot, directory, options = {}) {
  const extraFiles = Number(options.extraFiles || 0);
  assert.ok(Number.isInteger(extraFiles) && extraFiles >= 0 && extraFiles <= 1000);
  const load = createRequire(path.join(cliRoot, 'package.json'));
  const { Scope } = load('@teambit/legacy.scope');
  const { Source, Version, ModelComponent, VersionHistory } = load('@teambit/objects');
  const { ExtensionDataList, ExtensionDataEntry } = load('@teambit/legacy.extension-data');
  const name = 'qualification.merge';
  const scope = await Scope.ensure(directory, name);
  await scope.ensureDir();
  const base = {
    'index.js': Buffer.from('export const value = "base";\n'),
    'clean.js': Buffer.from('export const first = "base";\nexport const middle = 1;\nexport const last = "base";\n'),
    'deleted-remote.js': Buffer.from('export default "remove remotely";\n'),
    'deleted-local.js': Buffer.from('export default "remove locally";\n'),
    'delete-conflict.js': Buffer.from('export default "base deletion conflict";\n'),
    'rename.js': Buffer.from('export default "rename unchanged";\n'),
    'binary.bin': Buffer.from([0, 255, 13, 10, 254]),
    'eol.js': Buffer.from('export default "base eol";\n'),
  };
  const local = {
    ...base,
    'index.js': Buffer.from('export const value = "local";\n'),
    'clean.js': Buffer.from('export const first = "local";\nexport const middle = 1;\nexport const last = "base";\n'),
    'delete-conflict.js': Buffer.from('export default "local deletion conflict";\n'),
    'binary.bin': Buffer.from([0, 253, 13, 10, 252]),
    'add-local.js': Buffer.from('export default "added locally";\n'),
    'eol.js': Buffer.from('\ufeffexport default "local eol";\r\n'),
  };
  delete local['deleted-local.js'];
  const remote = {
    ...base,
    'index.js': Buffer.from('export const value = "remote";\n'),
    'clean.js': Buffer.from('export const first = "base";\nexport const middle = 1;\nexport const last = "remote";\n'),
    'binary.bin': Buffer.from([0, 251, 13, 10, 250]),
    'renamed.js': base['rename.js'],
    'add-remote.js': Buffer.from('export default "added remotely";\n'),
  };
  delete remote['deleted-remote.js'];
  delete remote['delete-conflict.js'];
  delete remote['rename.js'];
  for (let index = 0; index < extraFiles; index++) {
    const filename = `large-${String(index).padStart(4, '0')}.js`;
    const padding = '/* ' + `${index}:`.padEnd(4096, 'x') + ' */\n';
    base[filename] = Buffer.from(
      padding + 'export const first = "base";\nexport const middle = 1;\nexport const last = "base";\n'
    );
    local[filename] = Buffer.from(
      padding + 'export const first = "local";\nexport const middle = 1;\nexport const last = "base";\n'
    );
    remote[filename] = Buffer.from(
      padding + 'export const first = "base";\nexport const middle = 1;\nexport const last = "remote";\n'
    );
  }
  const versions = [];
  async function writeVersion(files, tag) {
    const objects = [];
    const models = Object.entries(files).map(([relativePath, bytes]) => {
      const source = Source.from(bytes);
      objects.push(source);
      return { name: path.basename(relativePath), relativePath, test: false, file: source.hash() };
    });
    const version = new Version({
      schema: '1.0.0',
      extensions: ExtensionDataList.fromModelObject([
        new ExtensionDataEntry(
          undefined,
          undefined,
          'teambit.envs/envs',
          {},
          { type: 'node', id: 'teambit.harmony/node' }
        ),
      ]),
      mainFile: 'index.js',
      bindingPrefix: '@qualification',
      devPackageDependencies: { '@types/jest': '26.0.20', '@types/node': '22.10.5' },
      overrides: { devDependencies: { '@types/jest': '26.0.20', '@types/node': '22.10.5' } },
      files: models,
      parents: versions.length ? [versions[0].hash()] : [],
      log: {
        message: `merge fixture ${tag}`,
        date: String(1700000000000 + versions.length),
        username: 'fixture',
        email: 'fixture@example.invalid',
      },
    });
    version._hash = version.calculateHash().toString();
    version.validate();
    versions.push(version);
    const component = ModelComponent.from({
      name: 'component',
      scope: name,
      versions: Object.fromEntries(versions.map((v, i) => [`1.0.${i}`, v.hash()])),
      head: version.hash(),
    });
    const history = new VersionHistory({
      name: 'component',
      scope: name,
      versions: versions.map((v) => ({ hash: v.hash(), parents: v.parents })),
      graphCompleteRefs: versions.map((v) => v.hash().toString()),
    });
    await scope.objects.writeObjectsToTheFS([...objects, version, component, history]);
    Scope.scopeCache = {};
    return version.hash().toString();
  }
  const baseRef = await writeVersion(base, '1.0.0');
  return {
    id: `${name}/component`,
    base,
    local,
    remote,
    baseRef,
    remotes: { [name]: `file://${directory}` },
    async publishRemoteSibling() {
      assert.equal(versions.length, 1);
      return writeVersion(remote, '1.0.1');
    },
    async writeLocal(root) {
      for (const filename of Object.keys(base))
        if (!Object.hasOwn(local, filename)) await fs.rm(path.join(root, filename), { force: true });
      for (const [filename, bytes] of Object.entries(local)) await fs.writeFile(path.join(root, filename), bytes);
    },
  };
}
module.exports = { createMergeFixture };
