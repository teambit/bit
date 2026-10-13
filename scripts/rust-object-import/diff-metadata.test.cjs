const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { source, installed } = require('./load-source.cjs');
const { ConsumerComponent, Dependency } = installed('@teambit/legacy.consumer-component');
const { ModelComponent } = installed('@teambit/objects');
const { ComponentID } = installed('@teambit/component-id');
const { ComponentOverrides } = installed('@teambit/legacy.consumer-config');
const { ExtensionDataEntry, ExtensionDataList } = installed('@teambit/legacy.extension-data');
const { SourceFile } = installed('@teambit/component.sources');
const { componentToPrintableForDiff, diffBetweenComponentsObjects } = installed('@teambit/legacy.component-diff');
const { rustDiffMetadata } = source('scopes/harmony/bit/rust-diff-metadata.ts');
const { diffMetadata } = source('components/legacy/component-diff/diff-metadata.ts');
const target = { identity: 'qualification.diff/component', version: '1.0.0' };
function consumer(value, model, peers, current = false) {
  const canonicalModel = ModelComponent.from({ scope: 'qualification.diff', name: 'component', ...model });
  const dep = (row) => new Dependency(ComponentID.fromObject(row.id), [], row.packageName, row.versionRange);
  return new ConsumerComponent({
    name: 'component',
    scope: 'qualification.diff',
    version: target.version,
    lang: current ? 'javascript' : canonicalModel.lang,
    deprecated: model.deprecated,
    bindingPrefix: canonicalModel.bindingPrefix,
    mainFile: value.mainFile,
    files: value.files.map(
      (file) =>
        new SourceFile({
          base: process.cwd(),
          path: path.join(process.cwd(), file.relativePath),
          test: file.test,
          contents: Buffer.alloc(0),
        })
    ),
    dependencies: value.dependencies.map(dep),
    devDependencies: value.devDependencies.map(dep),
    peerDependencies: peers.map((id) => new Dependency(ComponentID.fromString(id), [])),
    packageDependencies: value.packageDependencies,
    devPackageDependencies: value.devPackageDependencies,
    peerPackageDependencies: value.peerPackageDependencies,
    overrides: new ComponentOverrides({}),
    extensions: ExtensionDataList.fromArray(
      value.extensions.map(
        (extension) =>
          new ExtensionDataEntry(
            undefined,
            undefined,
            extension.name,
            structuredClone(extension.config),
            structuredClone(extension.data || {})
          )
      )
    ),
  });
}
function baseline() {
  return {
    mainFile: 'index.js',
    bindingPrefix: '@qualification',
    files: [
      { relativePath: 'index.js', test: false },
      { relativePath: 'other.js', test: false },
    ],
    dependencies: [{ id: { scope: 'qualification.diff', name: 'dep', version: '1.0.0' } }],
    devDependencies: [],
    packageDependencies: { zebra: '^1.0.0', alpha: '^2.0.0' },
    devPackageDependencies: { '@types/node': '22.10.5' },
    peerPackageDependencies: {},
    extensions: [
      { name: 'teambit.envs/envs', config: {}, data: { id: 'teambit.harmony/node' } },
      {
        name: 'teambit.dependencies/dependency-resolver',
        config: { policy: { dependencies: { zebra: '^1' } } },
        data: {},
      },
    ],
  };
}
function printable(component) {
  const value = componentToPrintableForDiff(component);
  for (const field of [
    'id',
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'overridesDependencies',
    'overridesDevDependencies',
    'overridesPeerDependencies',
    'overridesPackageJsonProps',
  ])
    delete value[field];
  return value;
}

test('cold metadata projection and shared formatter match actual Consumer component diff', async () => {
  const previous = process.env.BIT_RUST_CLIENT_VCS;
  process.env.BIT_RUST_CLIENT_VCS = 'off';
  try {
    for (let index = 0; index < 48; index += 1) {
      const left = baseline(),
        right = baseline();
      const model = {
        lang: index % 3 ? 'javascript' : 'typescript',
        deprecated: index % 5 === 0,
        bindingPrefix: index % 4 === 0 ? '@custom' : index % 4 === 1 ? '' : undefined,
      };
      left.bindingPrefix = index % 2 ? '@wrong-version-prefix' : undefined;
      right.bindingPrefix = left.bindingPrefix;
      const peers = index % 2 ? ['qualification.diff/peer@1.0.0'] : [];
      switch (index % 12) {
        case 0:
          right.mainFile = 'other.js';
          break;
        case 1:
          right.files.reverse();
          break;
        case 2:
          right.files[1].test = true;
          break;
        case 3:
          right.files.push({ relativePath: 'new.js', test: false });
          break;
        case 4:
          right.packageDependencies = { alpha: '^2.0.0', zebra: '^3.0.0', new: '*' };
          break;
        case 5:
          right.dependencies[0].id.version = '2.0.0';
          break;
        case 6:
          right.extensions[1].config = { __specific: true, policy: { dependencies: { z: '^1', a: '^2' } } };
          break;
        case 7:
          right.extensions[1].config = {};
          break;
        case 8:
          right.extensions.reverse();
          break;
        case 9:
          right.peerPackageDependencies = { react: '^19' };
          break;
        case 10:
          right.devDependencies = right.dependencies;
          right.dependencies = [];
          break;
        case 11:
          right.extensions[1].data.dependencies = [
            { __type: 'component', lifecycle: 'peer', id: 'qualification.diff/peer', version: '2.0.0' },
          ];
          break;
      }
      const a = consumer(left, model, []),
        b = consumer(right, model, peers, true);
      const packageName = componentToPrintableForDiff(a).packageName;
      const metadataA = rustDiffMetadata(target, model, left, [], packageName);
      const metadataB = rustDiffMetadata(target, model, right, peers, packageName, true);
      assert.deepEqual(metadataA.printable, printable(a), `left printable ${index}`);
      assert.deepEqual(metadataB.printable, printable(b), `right printable ${index}`);
      const expected = await diffBetweenComponentsObjects(a, b, { verbose: false, formatDepsAsTable: false });
      const actual = await diffMetadata(metadataA, metadataB, { verbose: false, formatDepsAsTable: false });
      assert.deepEqual(actual, expected, `fields ${index}`);
      assert.equal(JSON.stringify(actual), JSON.stringify(expected), `field bytes ${index}`);
    }
  } finally {
    if (previous === undefined) delete process.env.BIT_RUST_CLIENT_VCS;
    else process.env.BIT_RUST_CLIENT_VCS = previous;
  }
});

test('current metadata retains the default core aspect list when explicit configuration is empty', () => {
  const value = baseline();
  value.extensions = [];
  const model = { lang: 'javascript' };
  const canonical = consumer(
    {
      ...value,
      extensions: [
        { name: 'teambit.envs/envs', config: {}, data: { id: 'teambit.harmony/node' } },
        { name: 'teambit.dependencies/dependency-resolver', config: {}, data: {} },
      ],
    },
    model,
    []
  );
  const expected = printable(canonical);
  const actual = rustDiffMetadata(target, model, value, [], expected.packageName, true);
  assert.deepEqual(actual.printable, expected);
});

test('stored-only custom package names decline for canonical placeholder handling', () => {
  const value = baseline();
  value.extensions.push({ name: 'teambit.pkg/pkg', config: { packageJson: { name: '@custom/{name}' } } });
  assert.throws(
    () => rustDiffMetadata(target, {}, value, [], '@qualification/diff.component'),
    /stored custom package name/
  );
});
