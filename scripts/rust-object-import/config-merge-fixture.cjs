// Production objects and package stubs, exclusively in disposable qualification scopes.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const envId = 'teambit.envs/envs';
const resolverId = 'teambit.dependencies/dependency-resolver';
const deprecationId = 'teambit.component/deprecation';
const digest = (value) => createHash('sha1').update(value).digest('hex');
async function createConfigMergeFixture(cliRoot, directory, options = {}) {
  assert.ok(path.isAbsolute(directory));
  const load = createRequire(path.join(cliRoot, 'package.json'));
  const { Scope } = load('@teambit/legacy.scope');
  const { Source, Version, ModelComponent, VersionHistory, Lane } = load('@teambit/objects');
  const { ComponentID } = load('@teambit/component-id');
  const { ExtensionDataList, ExtensionDataEntry } = load('@teambit/legacy.extension-data');
  const scopeName = 'qualification.config';
  const scope = await Scope.ensure(directory, scopeName);
  await scope.ensureDir();
  const conflict = options.scenario === 'conflict';
  const extraDependencies = Number(options.extraDependencies || 0);
  const extraFiles = Number(options.extraFiles || 0);
  assert.ok(Number.isInteger(extraFiles) && extraFiles >= 0 && extraFiles <= 1000);
  assert.ok(Number.isInteger(extraDependencies) && extraDependencies >= 0 && extraDependencies <= 1000);
  const rows = [];
  function versionsFor(kind) {
    return kind === 'other' ? (conflict ? '2.0.0' : '1.1.0') : kind === 'current' && conflict ? '1.2.0' : '1.0.0';
  }
  function dependencies(kind) {
    return [
      'qualification-auto-a',
      ...Array.from({ length: extraDependencies }, (_, i) => `qualification-auto-${i}`),
    ].map((id) => ({ id, version: versionsFor(kind), __type: 'package', lifecycle: 'runtime', source: 'auto' }));
  }
  function extensions(kind) {
    const policy = { dependencies: { 'qualification-force': '^2.0.0' } };
    if (kind !== 'other') policy.dependencies['qualification-delete'] = '^3.0.0';
    return ExtensionDataList.fromModelObject([
      new ExtensionDataEntry(
        undefined,
        undefined,
        envId,
        {},
        {
          type: kind === 'other' && options.changeEnv ? 'react' : 'node',
          id: kind === 'other' && options.changeEnv ? 'teambit.react/react' : 'teambit.harmony/node',
        }
      ),
      new ExtensionDataEntry(
        undefined,
        undefined,
        resolverId,
        { policy },
        {
          dependencies: dependencies(kind),
          policy: [],
        }
      ),
      new ExtensionDataEntry(
        undefined,
        undefined,
        deprecationId,
        { deprecate: kind === 'other' },
        { owner: kind === 'other' ? 'incoming' : 'base', nested: { enabled: true } }
      ),
    ]);
  }
  function files(kind, name) {
    const extra = Object.fromEntries(
      Array.from({ length: Math.floor(extraFiles / 2) + (name === 'alpha' ? extraFiles % 2 : 0) }, (_, index) => [
        `extra-${index}.js`,
        Buffer.from(
          `exports.first = ${JSON.stringify(kind === 'current' ? 'local' : 'base')};\nexports.payload = ${JSON.stringify(name + index + 'x'.repeat(4096 + (index % 23)))};\nexports.last = ${JSON.stringify(kind === 'other' ? 'incoming' : 'base')};\n`
        ),
      ])
    );
    return {
      ...extra,
      'index.js': Buffer.from(
        `const auto = require('qualification-auto-a');\nexports.value = ${JSON.stringify(kind === 'base' ? 'base' : kind + '-' + name)};\nexports.auto = auto;\n`
      ),
      'clean.js': Buffer.from(
        kind === 'current'
          ? 'exports.first = "local";\nexports.middle = 1;\nexports.last = "base";\n'
          : kind === 'other'
            ? 'exports.first = "base";\nexports.middle = 1;\nexports.last = "incoming";\n'
            : 'exports.first = "base";\nexports.middle = 1;\nexports.last = "base";\n'
      ),
      'binary.bin': Buffer.from([0, 255, 13, 10, 254]),
      'eol.js': Buffer.from('exports.eol = true;\n'),
    };
  }
  function makeVersion(kind, name, parents) {
    const bodies = files(kind, name);
    const sources = Object.entries(bodies).map(([relativePath, contents]) => ({
      relativePath,
      source: Source.from(contents),
    }));
    const value = new Version({
      schema: '1.0.0',
      mainFile: 'index.js',
      bindingPrefix: '@qualification',
      extensions: extensions(kind),
      files: sources.map(({ relativePath, source }) => ({
        name: path.basename(relativePath),
        relativePath,
        test: false,
        file: source.hash(),
      })),
      parents,
      packageDependencies: Object.fromEntries(dependencies(kind).map((dep) => [dep.id, dep.version])),
      devPackageDependencies: { '@types/jest': '26.0.20', '@types/node': '22.10.5' },
      overrides: { devDependencies: { '@types/jest': '26.0.20', '@types/node': '22.10.5' } },
      log: {
        message: `${name} ${kind} configuration`,
        date: String(1700000000000 + ['base', 'current', 'other'].indexOf(kind)),
        username: 'fixture',
        email: 'fixture@example.invalid',
      },
    });
    value._hash = value.calculateHash().toString();
    value.validate();
    return { value, sources: sources.map(({ source }) => source), bodies };
  }
  for (const name of ['alpha', 'beta']) {
    const base = makeVersion('base', name, []);
    const current = makeVersion('current', name, [base.value.hash()]);
    const other = makeVersion('other', name, [base.value.hash()]);
    const model = ModelComponent.from({
      name,
      scope: scopeName,
      versions: { '1.0.0': base.value.hash() },
      head: base.value.hash(),
    });
    const history = new VersionHistory({
      name,
      scope: scopeName,
      versions: [{ hash: base.value.hash(), parents: [] }],
      graphCompleteRefs: [base.value.hash().toString()],
    });
    await scope.objects.writeObjectsToTheFS([...base.sources, base.value, model, history]);
    rows.push({ name, id: `${scopeName}/${name}`, base, current, other });
  }
  Scope.scopeCache = {};
  return {
    ids: rows.map(({ id }) => id),
    remotes: { [scopeName]: `file://${directory}` },
    workspacePolicy: { dependencies: Object.fromEntries(dependencies('base').map((dep) => [dep.id, '^1.0.0'])) },
    async installPackageStubs(workspaceDirectory, kind = 'current') {
      for (const dependency of [
        ...dependencies(kind),
        { id: 'qualification-force', version: '2.0.0' },
        { id: 'qualification-delete', version: '3.0.0' },
      ]) {
        const packageDirectory = path.join(workspaceDirectory, 'node_modules', dependency.id);
        await fs.mkdir(packageDirectory, { recursive: true });
        await fs.writeFile(
          path.join(packageDirectory, 'package.json'),
          JSON.stringify({ name: dependency.id, version: dependency.version, main: 'index.js' })
        );
        await fs.writeFile(path.join(packageDirectory, 'index.js'), 'module.exports = {};\n');
      }
    },
    async installCurrent(workspaceDirectory, roots) {
      const localScope = await Scope.load(path.join(workspaceDirectory, '.bit'), false);
      const json = load('comment-json');
      const bitmapPath = path.join(workspaceDirectory, '.bitmap');
      const bitmap = json.parse(await fs.readFile(bitmapPath, 'utf8'));
      for (const row of rows) {
        const model = await localScope.getModelComponent(ComponentID.fromString(row.id));
        model.head = row.current.value.hash();
        const history = await model.getVersionHistory(localScope.objects);
        history.addFromVersionsObjects([row.current.value]);
        history.graphCompleteRefs.push(row.current.value.hash().toString());
        await localScope.objects.writeObjectsToTheFS([...row.current.sources, row.current.value, model, history]);
        for (const [relativePath, contents] of Object.entries(row.current.bodies))
          await fs.writeFile(path.join(roots[row.id], relativePath), contents);
        const entry = Object.values(bitmap).find((item) => item?.scope === scopeName && item.name === row.name);
        assert.ok(entry);
        entry.version = row.current.value.hash().toString();
      }
      await fs.writeFile(bitmapPath, json.stringify(bitmap, null, 2));
      Scope.scopeCache = {};
    },
    async publishOther() {
      for (const row of rows) {
        const model = ModelComponent.from({
          name: row.name,
          scope: scopeName,
          versions: { '1.0.0': row.base.value.hash(), '1.0.1': row.other.value.hash() },
          head: row.other.value.hash(),
        });
        const history = new VersionHistory({
          name: row.name,
          scope: scopeName,
          versions: [row.base.value, row.other.value].map((v) => ({ hash: v.hash(), parents: v.parents })),
          graphCompleteRefs: [row.base.value, row.other.value].map((v) => v.hash().toString()),
        });
        await scope.objects.writeObjectsToTheFS([...row.other.sources, row.other.value, model, history]);
      }
      Scope.scopeCache = {};
    },
    async seedIncomingLane(workspaceDirectory) {
      const localScope = await Scope.load(path.join(workspaceDirectory, '.bit'), false);
      const lane = new Lane({
        name: 'incoming',
        scope: scopeName,
        hash: digest('configuration incoming lane'),
        components: rows.map(({ id, other }) => ({ id: ComponentID.fromString(id), head: other.value.hash() })),
        log: { date: '1700000000999' },
      });
      await localScope.objects.writeObjectsToTheFS([lane]);
      Scope.scopeCache = {};
    },
  };
}
module.exports = { createConfigMergeFixture, envId, resolverId, deprecationId };
